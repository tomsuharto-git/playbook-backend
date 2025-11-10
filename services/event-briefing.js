const Anthropic = require('@anthropic-ai/sdk');
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const logger = require('../utils/logger').service('event-briefing');

const execAsync = promisify(exec);

// Paths
const VAULT_PATH = path.join(__dirname, '../../..');
const NOTION_PATH = path.join(VAULT_PATH, 'Notion');

/**
 * Search Obsidian vault for context about an event
 */
async function searchVaultContext(event) {
  const title = event.summary || '';
  const description = event.description || '';

  // Extract keywords (filter out common words)
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with', 'about', 'from', 'meeting', 'call', 'sync']);
  const words = (title + ' ' + description)
    .toLowerCase()
    .match(/\b[a-z]{3,}\b/g) || [];
  const keywords = [...new Set(words.filter(w => !stopWords.has(w)))].slice(0, 5);

  if (keywords.length === 0) return '';

  const keywordsStr = keywords.join(', ');
  logger.info('Searching vault for:', { keywords: keywordsStr });

  const contextSnippets = [];

  // Search for each keyword in Notion folder
  for (const keyword of keywords) {
    try {
      const { stdout } = await execAsync(
        `grep -ri --include=*.md -m 3 "${keyword}" "${NOTION_PATH}" 2>/dev/null || true`
      );

      if (stdout) {
        const lines = stdout.split('\n').filter(l => l.trim()).slice(0, 2);
        contextSnippets.push(...lines);
      }
    } catch (error) {
      // grep not finding results is ok
    }
  }

  if (contextSnippets.length > 0) {
    const unique = [...new Set(contextSnippets)].slice(0, 5);
    logger.info('✓ Found  vault snippets', { length: unique.length });
    return unique.join('\n');
  }

  return '';
}

/**
 * Get attendee names from event
 */
function getAttendeesList(event) {
  const attendees = event.attendees || [];
  const names = attendees
    .filter(a => !a.email?.endsWith('@group.calendar.google.com'))
    .map(a => a.displayName || a.email?.split('@')[0] || 'Unknown')
    .filter(name => name !== 'Unknown');

  return names.length > 0 ? names : null;
}

/**
 * Generate AI briefing for a single event (with project context)
 */
async function generateEventBriefing(event, vaultContext, projectContext) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.error('      ⚠️ ANTHROPIC_API_KEY not set');
    return null;
  }

  const title = event.summary || 'No Title';
  const description = event.description || '';
  const location = event.location || '';
  const attendees = event.attendees || [];
  const isWorkEvent = event.calendar_category === 'Outlook';
  const hasProject = !!projectContext?.project;

  // Extract date context
  const eventDate = new Date(event.start?.dateTime || event.start?.date);
  const dateStr = eventDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Build attendee context with enrichment data
  let attendeeContext = '';
  if (attendees.length > 0) {
    const enrichedAttendees = attendees
      .filter(a => !a.email?.endsWith('@group.calendar.google.com'))
      .map(a => {
        let info = a.displayName || a.email?.split('@')[0] || 'Unknown';
        if (a.company && a.job_title) {
          info += ` (${a.job_title}, ${a.company})`;
          if (a.seniority && ['director', 'vp', 'c_suite', 'owner'].includes(a.seniority)) {
            info += ' ⭐';
          }
        }
        return info;
      })
      .filter(info => !info.includes('Unknown'));

    if (enrichedAttendees.length > 0) {
      attendeeContext = `\nATTENDEES:\n${enrichedAttendees.join('\n')}`;
    }
  }

  // Build project context section with narrative logs
  let projectSection = '';
  if (projectContext?.project) {
    const { project, tasks } = projectContext;
    const urgentTasks = tasks.filter(t => ['now', 'today'].includes(t.urgency)).slice(0, 5);
    const otherTasks = tasks.filter(t => !['now', 'today'].includes(t.urgency)).slice(0, 3);

    // Format narrative logs (recent context)
    let narrativeSection = '';
    if (project.narrative && Array.isArray(project.narrative) && project.narrative.length > 0) {
      const recentNarratives = project.narrative.slice(0, 5); // Last 5 entries
      narrativeSection = `
RECENT PROJECT ACTIVITY (last ${recentNarratives.length} updates):
${recentNarratives.map(n => {
  const bullets = n.bullets ? n.bullets.map(b => `  - ${b}`).join('\n') : '';
  return `${n.date} - ${n.headline} (${n.source || 'unknown'})
${bullets}`;
}).join('\n\n')}
`;
    }

    projectSection = `
PROJECT: ${project.name}
Status: ${project.status || 'Active'}
${project.objectives?.length > 0 && Array.isArray(project.objectives) && typeof project.objectives[0] === 'string' ?
  `Objectives: ${project.objectives.join('; ')}` : ''}

${narrativeSection}

URGENT TASKS (${urgentTasks.length}):
${urgentTasks.map((t, idx) => `${idx + 1}. ${t.title} [${t.urgency}]`).join('\n')}

${otherTasks.length > 0 ? `OTHER ACTIVE TASKS (${otherTasks.length}):
${otherTasks.map((t, idx) => `${idx + 1}. ${t.title} [${t.urgency}]`).join('\n')}` : ''}
`;
  }

  // Build prompt based on event type
  const prompt = isWorkEvent && hasProject ?
    // WORK EVENT WITH PROJECT
    `You are preparing a pre-meeting brief to prime Tom for peak performance in this meeting.

EVENT:
${title}
${dateStr}
${description ? `Description: ${description}` : ''}
${location ? `Location: ${location}` : ''}
${attendeeContext}

${vaultContext ? `VAULT CONTEXT:\n${vaultContext}\n` : ''}

${projectSection}

Your goal is to get Tom's mindset LOCKED IN before he walks into this meeting. Focus on:

1. **CONTEXT**: What's the backstory? What's led to this meeting? Connect it to the project status and recent tasks.

2. **THE ROOM**: Who's in this meeting? What do they care about? Use attendee titles/seniority to predict dynamics. (⭐ = senior stakeholder)

3. **WHAT'S AT STAKE**: What decisions are likely needed? What topics will probably come up based on the title and context?

4. **YOUR STANCE**: What's Tom's posture going in? Is he presenting? Deciding? Collaborating? Receiving feedback?

5. **SMART CONNECTIONS**: Connect urgent tasks to this meeting if relevant. Flag any deadlines or blockers that might come up.

TONE: Sharp, strategic, performance-focused. Help Tom walk in prepared and confident.

FORMAT:
- Start with a 1-sentence "what this is" framing
- Use bullets for key points
- End with a tactical note if relevant (decision needed, prep required, etc.)
- **CRITICAL: Keep the briefing to 75 words maximum. Be concise and punchy.**

${projectContext?.tasks?.length > 0 ? `
ALSO identify which tasks are directly relevant to THIS meeting.

Return JSON:
{
  "briefing": "your briefing text here",
  "relevant_task_ids": ["task_id_1", "task_id_2"]
}` : `
Return JSON:
{
  "briefing": "your briefing text here",
  "relevant_task_ids": []
}`}`
  :
  isWorkEvent ?
    // WORK EVENT WITHOUT PROJECT
    `You are preparing a pre-meeting brief to prime Tom for peak performance.

EVENT:
${title}
${dateStr}
${description ? `Description: ${description}` : ''}
${location ? `Location: ${location}` : ''}
${attendeeContext}

${vaultContext ? `VAULT CONTEXT:\n${vaultContext}\n` : ''}

This is a work meeting not tied to a specific project. Your goal is to help Tom walk in sharp and prepared.

Focus on:
1. **WHAT THIS IS**: Frame the meeting purpose based on title and any context
2. **THE ROOM**: Who's attending? What do they care about? (⭐ = senior stakeholder)
3. **LIKELY TOPICS**: Based on the title and context, what will probably be discussed?
4. **YOUR APPROACH**: What's Tom's role here? Listening? Presenting? Deciding?

TONE: Sharp, concise, performance-focused.

**CRITICAL: Keep the briefing to 75 words maximum. Be concise and punchy.**

Return JSON:
{
  "briefing": "your briefing text here",
  "relevant_task_ids": []
}`
  :
    // LIFE EVENT
    `You are preparing a brief for Tom's personal event.

TODAY'S DATE: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

EVENT:
${title}
${dateStr}
Full Date: ${eventDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
${description ? `Description: ${description}` : ''}
${location ? `Location: ${location}` : ''}

${vaultContext ? `CONTEXT:\n${vaultContext}\n` : ''}

${projectSection ? `\n${projectSection}\n` : ''}

This is a personal/life event. Keep it practical and contextual:
- **CRITICAL**: First, determine if this event date falls on a US federal/state holiday or observance. Examples:
  * Second Monday of October = Indigenous People's Day
  * Third Monday of January = MLK Day
  * Third Monday of February = Presidents Day
  * Last Monday of May = Memorial Day
  IF IT'S A HOLIDAY, START YOUR BRIEFING BY NAMING IT (e.g., "Indigenous People's Day - no school.")
- If it's a school closure with project context, connect it to recent school developments
- If it's a family/personal commitment, keep it brief and respectful
- If there's useful context from the vault, include it

TONE: Helpful, practical, brief (2-3 sentences max).

**CRITICAL: Keep the briefing to 75 words maximum.**

Return JSON:
{
  "briefing": "your briefing text here",
  "relevant_task_ids": []
}`;

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }]
    });

    let responseText = message.content[0].text.trim();

    // Strip markdown code fences if present
    if (responseText.startsWith('```')) {
      responseText = responseText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }

    // Parse JSON response
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      // Fallback: treat entire response as briefing
      logger.warn('⚠️ Failed to parse JSON, using raw text');
      result = {
        briefing: responseText,
        relevant_task_ids: []
      };
    }

    logger.info('✓ Generated briefing ( chars,  relevant tasks)', { length: result.briefing.length, length: result.relevant_task_ids.length });

    return result;
  } catch (error) {
    logger.error('✗ Error generating briefing:');
    return null;
  }
}

/**
 * Generate briefings for all events (SEQUENTIALLY to avoid concurrent connection rate limits)
 * Events can optionally have project_context already attached
 */
async function generateEventBriefings(events) {
  logger.info('\n🤖 Generating AI briefings for  events (sequential processing to avoid rate limits)...', { length: events.length });

  const DELAY_BETWEEN_EVENTS = 500; // 500ms delay between each event
  const enrichedEvents = [];

  // Process events sequentially (one at a time)
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const title = event.summary || 'No Title';
    const eventNum = i + 1;
    logger.info('\n   [/] Processing:', { eventNum: eventNum, length: events.length, title: title });

    try {
      // Search vault for context
      const vaultContext = await searchVaultContext(event);

      // Generate briefing with project context (if available)
      const projectContext = event.project_context || null;
      const briefingResult = await generateEventBriefing(event, vaultContext, projectContext);

      // Extract briefing text and relevant task IDs
      let briefingText = null;
      let relevantTaskIds = [];
      let relevantTasks = [];

      if (briefingResult) {
        if (typeof briefingResult === 'object' && briefingResult.briefing) {
          briefingText = briefingResult.briefing;
          relevantTaskIds = briefingResult.relevant_task_ids || [];

          // Fetch full task details for relevant tasks
          if (relevantTaskIds.length > 0 && projectContext?.tasks) {
            relevantTasks = projectContext.tasks.filter(t =>
              relevantTaskIds.includes(t.id)
            );
          }
        } else if (typeof briefingResult === 'string') {
          briefingText = briefingResult;
        }
      }

      // Build enriched event
      const enrichedEvent = {
        ...event,
        ai_briefing: briefingText,
        vault_context: vaultContext,
        relevant_task_ids: relevantTaskIds,
        relevant_tasks: relevantTasks
      };

      // Remove project_context from output (too large, already processed)
      delete enrichedEvent.project_context;

      enrichedEvents.push(enrichedEvent);

      // Wait before next event (unless this is the last event)
      if (i < events.length - 1) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_EVENTS));
      }
    } catch (error) {
      logger.error('✗ Error processing event:', { message: error.message });
      enrichedEvents.push({
        ...event,
        ai_briefing: null,
        vault_context: null
      });
    }
  }

  logger.info('\n   ✅ Generated  briefings\n', { length: enrichedEvents.filter(e => e.ai_briefing).length });

  return enrichedEvents;
}

module.exports = {
  generateEventBriefings
};
