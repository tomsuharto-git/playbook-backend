/**
 * Project Detection Service
 * Detects which project a calendar event belongs to using hybrid approach:
 * 1. Keyword matching (fast, cheap)
 * 2. AI classification (slower, more accurate)
 */

const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../db/supabase-client');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Extract keywords from event title and description
 */
function extractKeywords(title, description) {
  const text = `${title || ''} ${description || ''}`.toLowerCase();

  // Remove common words
  const commonWords = ['meeting', 'call', 'sync', 'checkin', 'check-in', 'review', 'discussion', 'the', 'and', 'for', 'with', 'a', 'an', 'of', 'to', 'in', 'on', 'at'];

  const words = text.split(/\s+/)
    .filter(word => word.length > 2)
    .filter(word => !commonWords.includes(word))
    .map(word => word.replace(/[^a-z0-9]/g, ''));

  return [...new Set(words)]; // Remove duplicates
}

/**
 * Extract text from narrative array
 */
function extractNarrativeText(narrative) {
  if (!Array.isArray(narrative)) return '';

  return narrative.map(entry => {
    const headline = entry.headline || '';
    const bullets = Array.isArray(entry.bullets) ? entry.bullets.join(' ') : '';
    return `${headline} ${bullets}`;
  }).join(' ');
}

/**
 * Extract text from objectives array
 */
function extractObjectivesText(objectives) {
  if (!Array.isArray(objectives)) return '';

  return objectives.map(obj => {
    const headline = obj.headline || '';
    const bullets = Array.isArray(obj.bullets) ? obj.bullets.join(' ') : '';
    return `${headline} ${bullets}`;
  }).join(' ');
}

/**
 * Match projects by keywords
 */
async function matchProjectsByKeywords(keywords) {
  if (keywords.length === 0) {
    return [];
  }

  // Get all active projects
  const { data: projects, error} = await supabase
    .from('projects')
    .select('id, name, narrative, color, objectives')
    .in('status', ['active', 'on_hold']);

  if (error || !projects) {
    console.error('Error fetching projects:', error);
    return [];
  }

  // Score each project based on keyword matches
  const scoredProjects = projects.map(project => {
    // Properly extract text from narrative and objectives arrays
    const narrativeText = extractNarrativeText(project.narrative);
    const objectivesText = extractObjectivesText(project.objectives);
    const projectText = `${project.name} ${narrativeText} ${objectivesText}`.toLowerCase();

    let score = 0;
    const matchedKeywords = [];

    for (const keyword of keywords) {
      if (projectText.includes(keyword)) {
        score++;
        matchedKeywords.push(keyword);
      }
    }

    // Boost score if project name is directly mentioned
    const projectNameWords = project.name.toLowerCase().split(/\s+/);
    for (const word of projectNameWords) {
      if (keywords.includes(word)) {
        score += 2; // Higher weight for name matches
      }
    }

    return {
      ...project,
      score,
      matchedKeywords,
      confidence: score / Math.max(keywords.length, projectNameWords.length)
    };
  });

  // Return projects with score > 0, sorted by score
  return scoredProjects
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * Classify event with AI
 */
async function classifyEventWithAI(event, projectMatches) {
  try {
    // If no keyword matches, get all active projects
    let projects = projectMatches;
    if (projects.length === 0) {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, description, context')
        .in('status', ['active', 'on_hold']);

      if (!error && data) {
        projects = data;
      }
    }

    if (projects.length === 0) {
      return null;
    }

    const prompt = `You are analyzing a calendar event to determine which project it belongs to.

EVENT:
Title: ${event.summary || 'No Title'}
Description: ${event.description || 'None'}
Attendees: ${event.attendees?.map(a => a.email).join(', ') || 'None'}

ACTIVE PROJECTS:
${projects.slice(0, 10).map((p) => {
  // Handle objectives - could be string, array, or null
  let objectivesText = '';
  if (typeof p.objectives === 'string') {
    objectivesText = p.objectives.substring(0, 200);
  } else if (Array.isArray(p.objectives) && p.objectives.length > 0) {
    objectivesText = p.objectives.map(obj => obj.headline || obj.bullets?.join(', ') || '').join('; ').substring(0, 200);
  }

  return `Project ID: ${p.id}
Name: ${p.name}
Narrative: ${p.narrative || 'No narrative'}
${objectivesText ? `Recent context: ${objectivesText}...` : ''}
${p.matchedKeywords ? `Keywords matched: ${p.matchedKeywords.join(', ')}` : ''}`;
}).join('\n\n')}

Determine which project this event belongs to, or if it doesn't match any project.

Consider:
- Direct mentions of project names or key terms
- Attendee domains (client emails often indicate project)
- Meeting context and purpose

Return ONLY a JSON object with the EXACT Project ID (UUID) from the list above:
{
  "project_id": "exact-uuid-from-above or null",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }]
    });

    // Extract text and strip markdown code blocks if present
    let responseText = response.content[0].text.trim();
    if (responseText.startsWith('```json')) {
      responseText = responseText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    } else if (responseText.startsWith('```')) {
      responseText = responseText.replace(/^```\n?/, '').replace(/\n?```$/, '').trim();
    }

    const result = JSON.parse(responseText);

    console.log(`   AI Response: project_id=${result.project_id}, confidence=${result.confidence}`);
    console.log(`   AI Reasoning: ${result.reasoning}`);

    // Check if project_id is valid (not null, not undefined string)
    if (result.project_id && result.project_id !== 'null' && result.project_id !== 'undefined') {
      // Find the matching project
      const project = projects.find(p => p.id === result.project_id);
      if (project) {
        console.log(`   ✅ Found matching project: ${project.name}`);
        return {
          ...project,
          confidence: result.confidence,
          reasoning: result.reasoning,
          detection_method: 'ai'
        };
      } else {
        console.log(`   ⚠️  Project ID ${result.project_id} not found in database!`);
      }
    }

    return null;
  } catch (error) {
    console.error('AI classification error:', error);
    return null;
  }
}

/**
 * Detect which project an event belongs to (main function)
 */
async function detectProject(event) {
  try {
    console.log(`\n🔍 Detecting project for: "${event.summary}"`);

    // Step 1: Extract keywords
    const keywords = extractKeywords(event.summary, event.description);
    console.log(`   Keywords: ${keywords.join(', ')}`);

    // Step 2: Keyword matching
    const projectMatches = await matchProjectsByKeywords(keywords);

    if (projectMatches.length > 0) {
      console.log(`   Keyword matches: ${projectMatches.length}`);
      console.log(`   Top match: ${projectMatches[0].name} (confidence: ${projectMatches[0].confidence.toFixed(2)})`);

      // If high confidence match, return it immediately
      if (projectMatches[0].confidence >= 0.8) {
        console.log(`   ✅ High confidence keyword match!`);
        return {
          ...projectMatches[0],
          detection_method: 'keyword'
        };
      }
    }

    // Step 3: AI classification for ambiguous cases
    console.log(`   🤖 Using AI for classification...`);
    const aiMatch = await classifyEventWithAI(event, projectMatches);

    if (aiMatch && aiMatch.confidence >= 0.7) {
      console.log(`   ✅ AI match: ${aiMatch.name} (confidence: ${aiMatch.confidence.toFixed(2)})`);
      return aiMatch;
    }

    console.log(`   ℹ️  No project match found`);
    return null;
  } catch (error) {
    console.error('Error detecting project:', error);
    return null;
  }
}

module.exports = {
  detectProject,
  extractKeywords,
  matchProjectsByKeywords,
  classifyEventWithAI
};
