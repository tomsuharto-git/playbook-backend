/**
 * Central Processor for Three-Entity Architecture
 *
 * Unified processing pipeline for all input sources (Email, Vault, Calendar)
 * Creates appropriate entities (Tasks, Events, Narratives) based on content
 *
 * Created: October 28, 2025
 * Part of the Three-Entity Architecture refactoring
 */

const { supabase } = require('../db/supabase-client');
const { detectProject } = require('./project-detector');
const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../utils/logger').service('central-processor');
const duplicateDetector = require('./duplicate-detector-service');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

class CentralProcessor {
  constructor() {
    this.projectsCache = null;
    this.cacheExpiry = null;
  }

  /**
   * Main processing pipeline for all input types
   */
  async process(input) {
    try {
      logger.info('\n🔄 [CENTRAL PROCESSOR] Starting processing...');

      // Step 1: Identify source type
      const sourceType = this.identifySource(input);
      logger.info('📍 Source type:', { sourceType: sourceType });

      // Step 2: Extract and normalize content
      const content = await this.extractContent(input, sourceType);

      // Step 3: Detect project with multiple fallback strategies
      const project = await this.detectProjectWithFallbacks(content);
      const projectName = project?.name || 'Unassigned';
      logger.info('📁 Project:', { projectName: projectName });

      // Step 4: Analyze content and classify into entities
      const entities = await this.analyzeContent(content, project, sourceType);
      logger.debug('📊 Entities detected:', { length: entities.length });

      // Step 5: Process each entity
      const results = {
        tasks: [],
        events: [],
        narratives: [],
        news: [] // Placeholder for future
      };

      for (const entity of entities) {
        // Check for duplicates (except narratives which can accumulate)
        if (entity.type !== 'narrative' && await this.isDuplicate(entity)) {
          logger.info('⏭️  Skipping duplicate :', { type: entity.type, headline: entity.title || entity.headline });
          continue;
        }

        // Score significance
        entity.significance_score = await this.scoreSignificance(entity);

        // Skip low-significance items (except tasks which are always created)
        if (entity.type !== 'task' && entity.significance_score < 0.5) {
          logger.info('⏭️  Skipping low significance  ()', { type: entity.type, significance_score: entity.significance_score });
          continue;
        }

        // Create entity in database
        const created = await this.createEntity(entity);
        if (created) {
          results[entity.type + 's'].push(created);
          logger.info('✅ Created :', { type: entity.type, headline: created.title || created.headline });
        }
      }

      // Step 6: Create entity relationships
      await this.linkEntities(results);

      logger.info('\n✅ [CENTRAL PROCESSOR] Complete');
      logger.info('Tasks: , Events: , Narratives:', { length: results.tasks.length, length: results.events.length, length: results.narratives.length });

      return results;

    } catch (error) {
      logger.error('❌ [CENTRAL PROCESSOR] Error:', { arg0: error });
      throw error;
    }
  }

  /**
   * Identify the source type from input structure
   */
  identifySource(input) {
    if (input.filepath) return 'vault';
    if (input.calendar_source) return 'calendar';
    if (input.email_id || input.from) return 'email';
    if (input.source) return input.source;
    return 'unknown';
  }

  /**
   * Extract and normalize content from various input types
   */
  async extractContent(input, sourceType) {
    const content = {
      source: sourceType,
      text: '',
      metadata: {},
      date: null
    };

    switch (sourceType) {
      case 'email':
        content.text = `${input.subject || ''}\n${input.body || ''}`;
        content.metadata = {
          from: input.from,
          to: input.to,
          email_id: input.email_id || input.id
        };
        content.date = input.received_date;
        break;

      case 'vault':
        content.text = input.content || '';
        content.metadata = {
          filepath: input.filepath,
          filename: input.filename
        };
        content.date = this.extractDateFromFile(input.filepath);
        break;

      case 'calendar':
        content.text = `${input.summary || ''}\n${input.description || ''}`;
        content.metadata = {
          location: input.location,
          attendees: input.attendees,
          calendar_id: input.id,
          calendar_source: input.calendar_source
        };
        content.date = input.start_time;
        break;

      default:
        content.text = JSON.stringify(input);
        content.date = new Date();
    }

    return content;
  }

  /**
   * Detect project using multiple fallback strategies
   */
  async detectProjectWithFallbacks(content) {
    // Ensure projects cache is loaded
    await this.loadProjectsCache();

    const strategies = [
      () => this.detectByPath(content.metadata?.filepath),
      () => this.detectByKeywords(content.text),
      () => this.detectByFuzzyMatch(content.text),
      () => this.detectByAI(content),
      () => this.getGenericFallbackProject()
    ];

    for (const strategy of strategies) {
      try {
        const project = await strategy();
        if (project) {
          return project;
        }
      } catch (error) {
        logger.error('⚠️  Strategy failed:', { message: error.message });
      }
    }

    return null; // Allow null projects (orphan entities)
  }

  /**
   * Load projects cache with 5-minute expiry
   */
  async loadProjectsCache() {
    if (!this.projectsCache || !this.cacheExpiry || Date.now() > this.cacheExpiry) {
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name, type, status')
        .eq('status', 'active');

      this.projectsCache = projects || [];
      this.cacheExpiry = Date.now() + (5 * 60 * 1000); // 5 minutes
      logger.info('📂 Loaded  active projects', { length: this.projectsCache.length });
    }
  }

  /**
   * Detect project by file path
   */
  detectByPath(filepath) {
    if (!filepath) return null;

    const pathParts = filepath.split('/');

    // Check for client folders
    if (pathParts.includes('Clients')) {
      const clientIndex = pathParts.indexOf('Clients');
      const clientName = pathParts[clientIndex + 1];
      if (clientName) {
        const project = this.projectsCache.find(p =>
          p.name.toLowerCase().includes(clientName.toLowerCase()) ||
          clientName.toLowerCase().includes(p.name.toLowerCase())
        );
        if (project) return project;
      }
    }

    // Check for Claude Code projects with fuzzy matching
    if (pathParts.includes('Claude Code')) {
      const ccIndex = pathParts.indexOf('Claude Code');
      const subfolder = pathParts[ccIndex + 1];

      if (subfolder && !subfolder.endsWith('.md')) {
        // Fuzzy match for Claude Code subfolders
        const project = this.projectsCache.find(p => {
          const projectWords = p.name.toLowerCase().split(/[\s-_]+/);
          const subfolderWords = subfolder.toLowerCase().split(/[\s-_]+/);

          return projectWords.some(pw =>
            subfolderWords.some(sw =>
              pw.includes(sw) || sw.includes(pw)
            )
          );
        });

        if (project) return project;
      }

      // Fallback to generic Claude Code project
      return this.projectsCache.find(p => p.name === 'Claude Code');
    }

    return null;
  }

  /**
   * Detect project by keywords in content
   */
  detectByKeywords(text) {
    if (!text) return null;

    const textLower = text.toLowerCase();

    // Check each project name
    for (const project of this.projectsCache) {
      const projectLower = project.name.toLowerCase();
      if (textLower.includes(projectLower)) {
        return project;
      }
    }

    return null;
  }

  /**
   * Detect project using fuzzy matching
   */
  detectByFuzzyMatch(text) {
    if (!text || text.length < 50) return null;

    const textWords = text.toLowerCase().split(/\s+/).filter(w => w.length > 3);

    let bestMatch = null;
    let bestScore = 0;

    for (const project of this.projectsCache) {
      const projectWords = project.name.toLowerCase().split(/[\s-_]+/);

      // Count matching words
      let matches = 0;
      for (const pw of projectWords) {
        if (textWords.some(tw => tw.includes(pw) || pw.includes(tw))) {
          matches++;
        }
      }

      const score = matches / projectWords.length;
      if (score > bestScore && score > 0.5) {
        bestScore = score;
        bestMatch = project;
      }
    }

    return bestMatch;
  }

  /**
   * Detect project using AI classification
   */
  async detectByAI(content) {
    // Use the existing project-detector service
    const result = await detectProject({
      summary: content.text.substring(0, 200),
      description: content.text
    });

    return result;
  }

  /**
   * Get generic fallback project
   */
  getGenericFallbackProject() {
    // Try common fallbacks
    const fallbacks = ['Personal', 'Admin', 'General'];

    for (const name of fallbacks) {
      const project = this.projectsCache.find(p =>
        p.name.toLowerCase() === name.toLowerCase()
      );
      if (project) return project;
    }

    return null;
  }

  /**
   * Analyze content and extract entities using AI
   */
  async analyzeContent(content, project, sourceType) {
    const prompt = this.buildAnalysisPrompt(content, project, sourceType);

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2000,
      temperature: 0.3,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    // Extract JSON from response (may be wrapped in markdown code blocks)
    let responseText = response.content[0].text;

    // Remove markdown code blocks if present
    if (responseText.includes('```json')) {
      responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (responseText.includes('```')) {
      responseText = responseText.replace(/```\n?/g, '');
    }

    // Parse JSON with better error handling
    let analysis;
    try {
      // First try to parse as-is
      analysis = JSON.parse(responseText.trim());
    } catch (firstError) {
      try {
        // If that fails, try to extract JSON from the response
        const jsonStart = responseText.indexOf('{');
        const jsonEnd = responseText.lastIndexOf('}') + 1;

        if (jsonStart === -1 || jsonEnd === 0) {
          throw new Error('No JSON found in response');
        }

        const cleanJson = responseText.substring(jsonStart, jsonEnd);
        analysis = JSON.parse(cleanJson);
      } catch (secondError) {
        logger.error('JSON Parse Error. Response was:');
        // Return empty result on parse error rather than crashing
        return [];
      }
    }

    const entities = [];

    // Convert analysis to entity objects
    if (analysis.tasks && analysis.tasks.length > 0) {
      for (const task of analysis.tasks) {
        entities.push({
          type: 'task',
          project_id: project?.id,
          title: task.title,
          description: task.description || task.context,
          urgency: task.urgency || 'Eventually',
          due_date: task.due_date,
          confidence: task.confidence || 0.8,
          source: sourceType,
          detected_from: content.metadata.filepath || content.metadata.email_id
        });
      }
    }

    if (analysis.events && analysis.events.length > 0) {
      for (const event of analysis.events) {
        entities.push({
          type: 'event',
          project_id: project?.id,
          title: event.title || event.summary,
          start_time: event.start_time,
          end_time: event.end_time,
          location: event.location,
          attendees: event.attendees,
          calendar_source: content.metadata.calendar_source,
          calendar_id: content.metadata.calendar_id,
          category: project ? 'work' : 'life'
        });
      }
    }

    if (analysis.narrative && analysis.narrative.headline) {
      entities.push({
        type: 'narrative',
        project_id: project?.id,
        headline: analysis.narrative.headline,
        bullets: analysis.narrative.bullets || [],
        date: content.date || new Date(),
        source: sourceType === 'vault' && content.metadata.filepath?.includes('Granola')
          ? 'meeting'
          : sourceType,
        source_file: content.metadata.filepath,
        source_id: content.metadata.email_id || content.metadata.calendar_id
      });
    }

    return entities;
  }

  /**
   * Build AI analysis prompt based on content type
   */
  buildAnalysisPrompt(content, project, sourceType) {
    const projectContext = project
      ? `This content is related to the "${project.name}" project.`
      : 'Project context is unknown.';

    const basePrompt = `
Analyze the following ${sourceType} content and extract structured information.
${projectContext}

Content:
${content.text}

Extract and return as JSON:
{
  "tasks": [
    {
      "title": "Clear action item",
      "description": "Additional context",
      "urgency": "Now|Soon|Eventually",
      "due_date": "YYYY-MM-DD if mentioned",
      "confidence": 0.0-1.0
    }
  ],
  "events": [
    {
      "title": "Event name",
      "start_time": "ISO datetime",
      "end_time": "ISO datetime",
      "location": "Where",
      "attendees": ["names"]
    }
  ],
  "narrative": {
    "headline": "Key outcome or decision (10 words max)",
    "bullets": [
      "Important point 1",
      "Important point 2",
      "Important point 3 (max 5)"
    ]
  }
}

Rules:
- Only extract CLEAR action items as tasks
- Skip tasks assigned to others (unless tracking is needed)
- For narratives, focus on decisions, milestones, and significant updates
- Ignore routine or low-value information

IMPORTANT: Return ONLY valid JSON with no additional text, explanation, or commentary.`;

    return basePrompt;
  }

  /**
   * Check if entity is a duplicate using unified duplicate detector
   */
  async isDuplicate(entity) {
    const result = await duplicateDetector.checkDuplicate(
      entity,
      entity.type,
      {
        projectId: entity.project_id,
        timeWindow: 7 // Look back 7 days
      }
    );

    return result.isDuplicate;
  }

  /**
   * Score the significance of an entity
   */
  async scoreSignificance(entity) {
    // Tasks always have high enough significance
    if (entity.type === 'task') {
      return entity.confidence || 0.8;
    }

    // Events with project context are more significant
    if (entity.type === 'event') {
      return entity.project_id ? 0.7 : 0.5;
    }

    // Narratives from meetings are most significant
    if (entity.type === 'narrative') {
      const scores = {
        'meeting': 0.9,
        'email': 0.6,
        'note': 0.5,
        'event': 0.7
      };
      return scores[entity.source] || 0.5;
    }

    return 0.5;
  }

  /**
   * Create entity in appropriate table
   */
  async createEntity(entity) {
    const table = entity.type + 's'; // tasks, events, narratives

    // Remove type field before insertion
    const { type, ...data } = entity;

    // Remove significance_score from tasks and events (only narratives have this field)
    if (type === 'task' || type === 'event') {
      delete data.significance_score;
    }

    // Special handling for narratives with null project
    if (type === 'narrative' && !data.project_id) {
      logger.warn('⚠️  Creating orphan narrative (no project)');
    }

    const { data: created, error } = await supabase
      .from(table)
      .insert(data)
      .select()
      .single();

    if (error) {
      logger.error('❌ Failed to create :', { type: type });
      return null;
    }

    return created;
  }

  /**
   * Create relationships between entities
   */
  async linkEntities(results) {
    // Future implementation:
    // - Link tasks to the narrative they came from
    // - Link events to related tasks
    // - Build entity graph

    // For now, just log what we would link
    if (results.tasks.length > 0 && results.narratives.length > 0) {
      logger.info('🔗 Would link  tasks to narrative', { length: results.tasks.length });
    }
  }

  /**
   * Extract date from filepath
   */
  extractDateFromFile(filepath) {
    if (!filepath) return new Date();

    const dateMatch = filepath.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      return new Date(dateMatch[1]);
    }

    return new Date();
  }
}

// Export singleton instance
module.exports = new CentralProcessor();