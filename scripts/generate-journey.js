const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../utils/logger');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

async function generateJourneyForProject(projectName) {
  logger.info('\n🎯 Generating journey for ...\n', { projectName: projectName });

  // 1. Fetch project details
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('name', projectName)
    .single();

  if (projectError) {
    logger.error('Error fetching project:', { arg0: projectError });
    return;
  }

  // 2. Fetch recent narratives for context (Phase 2 table)
  const { data: narratives, error: narrativesError } = await supabase
    .from('narratives')
    .select('*')
    .eq('project_id', project.id)
    .order('date', { ascending: false })
    .limit(10); // Increased from 5 to 10 for richer context

  const narrativeContext = narratives && narratives.length > 0
    ? narratives.map(n => `- ${n.date}: ${n.headline}\n  ${n.bullets?.join('\n  ') || ''}`).join('\n')
    : 'No recent narratives available.';

  // 3. Fetch active tasks for context
  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('*')
    .eq('project_id', project.id)
    .in('status', ['pending', 'active', 'blocked'])
    .limit(10);

  const taskContext = tasks && tasks.length > 0
    ? tasks.map(t => `- ${t.title} (${t.urgency}, ${t.status})`).join('\n')
    : 'No active tasks.';

  // 4. Build prompt for Claude based on project type
  const deadline = project.deadline ? new Date(project.deadline).toLocaleDateString() : 'No deadline set';
  const today = new Date().toLocaleDateString();
  const isCodeProject = project.tag === 'Code';

  let prompt;

  if (isCodeProject) {
    // Code Project: Focus on next steps, not deadline-driven milestones
    prompt = `You are a code project management AI. Generate the next logical steps for this coding project based on recent progress and current tasks.

**Project Name:** ${project.name}
**Type:** Code/Development Project
**Today's Date:** ${today}
**Project Status:** ${project.status}

**Recent Activity:**
${narrativeContext}

**Active Tasks:**
${taskContext}

Based on this information, create a JSON response with:
1. Overall project status: "on_track", "at_risk", "critical", or "stalled"
2. A brief status summary (1-2 sentences about current state)
3. 3-5 next logical steps with:
   - description (clear, actionable next step)
   - status ("in_progress", "upcoming") - use "in_progress" if there are related active tasks
   - target_date (OPTIONAL: only include if there's a clear timeframe)
   - dependencies (optional: what needs to happen first)

IMPORTANT:
- Focus on next steps based on what's already been accomplished
- Steps should be incremental and logical progressions
- Don't create arbitrary deadlines - target_date can be null/omitted
- Status should reflect reality: "in_progress" if related tasks exist, otherwise "upcoming"

Return ONLY valid JSON in this exact format:
{
  "status": "on_track",
  "status_summary": "Brief summary here",
  "milestones": [
    {
      "description": "Next step description",
      "status": "in_progress",
      "target_date": null,
      "dependencies": ["Optional dependency"]
    }
  ]
}`;
  } else {
    // Regular Project: Deadline-driven milestones
    prompt = `You are a strategic project management AI. Generate a realistic project journey with milestones for the following project:

**Project Name:** ${project.name}
**Deadline:** ${deadline} (${project.deadline_label || 'No label'})
**Today's Date:** ${today}
**Project Status:** ${project.status}

**Recent Activity:**
${narrativeContext}

**Active Tasks:**
${taskContext}

Based on this information, create a JSON response with:
1. Overall project status: "on_track", "at_risk", "critical", or "stalled"
2. A brief status summary (1-2 sentences)
3. 3-5 key milestones with:
   - description (clear, actionable milestone name for preparatory work BEFORE the deadline)
   - status ("completed", "in_progress", "upcoming", "at_risk")
   - target_date (realistic date in YYYY-MM-DD format, should be BEFORE the deadline)
   - dependencies (optional: what needs to happen first)

IMPORTANT:
- Milestones should be preparatory steps that lead UP TO the deadline, not the deadline event itself.
  For example, if the deadline is a "Pitch Presentation", the milestones should be things like "Complete pitch deck",
  "Rehearse presentation", etc. - NOT "Pitch Presentation" as a milestone.
- Milestone dates should fall on weekdays (Monday-Friday), never on weekends (Saturday-Sunday).
  If a natural milestone date would fall on a weekend, move it to the following Monday.

Return ONLY valid JSON in this exact format:
{
  "status": "on_track",
  "status_summary": "Brief summary here",
  "milestones": [
    {
      "description": "Milestone name",
      "status": "in_progress",
      "target_date": "2025-10-25",
      "dependencies": ["Optional dependency"]
    }
  ]
}`;
  }
  // 5. Call Claude API
  logger.info('📞 Calling Claude API...\n');

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: prompt
    }]
  });

  let responseText = message.content[0].text;
  logger.info('📋 Claude Response:\n', { arg0: responseText });

  // Remove markdown code blocks if present
  responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  // 6. Parse and validate JSON
  let aiInsights;
  try {
    aiInsights = JSON.parse(responseText);
  } catch (e) {
    logger.error('❌ Failed to parse JSON response:', { arg0: e });
    return;
  }

  // 7. Update project with AI insights
  const { data: updated, error: updateError } = await supabase
    .from('projects')
    .update({
      ai_insights: aiInsights,
      journey_generated_at: new Date().toISOString()
    })
    .eq('id', project.id)
    .select();

  if (updateError) {
    logger.error('❌ Error updating project:', { arg0: updateError });
  } else {
    logger.info('✅ Successfully generated journey for', { arg0: projectName });
    logger.debug('\n📊 Generated Insights:');
    logger.info('Status:', { arg0: aiInsights.status });
    logger.info('Summary:', { arg0: aiInsights.status_summary });
    logger.info('\nMilestones:');
    aiInsights.milestones?.forEach((m, i) => {
      logger.info('.  () -', { i + 1: i + 1, description: m.description, status: m.status, target_date: m.target_date });
    });
  }
}

/**
 * Generate milestones for all active Code projects
 */
async function generateCodeMilestones() {
  logger.info('\n🚀 Generating Next Steps for Code Projects\n');
  logger.info('='.repeat(60));

  try {
    const { data: codeProjects, error } = await supabase
      .from('projects')
      .select('*')
      .eq('tag', 'Code')
      .eq('status', 'active');

    if (error) {
      logger.error('❌ Error fetching Code projects:', { arg0: error });
      return;
    }

    if (!codeProjects || codeProjects.length === 0) {
      logger.info('ℹ️  No active Code projects found');
      return;
    }

    logger.info('\n✅ Found  active Code projects\n', { length: codeProjects.length });

    for (const project of codeProjects) {
      logger.info('\n📦 Processing:', { name: project.name });
      await generateJourneyForProject(project.name);
    }

    logger.info('\n' + '='.repeat(60));
    logger.info('\n✨ Generated next steps for  Code projects\n', { length: codeProjects.length });

  } catch (error) {
    logger.error('❌ Unexpected error in generateCodeMilestones:', { arg0: error });
  }
}

/**
 * Start the milestone generation schedule for Code projects (3x daily: 6am, 12pm, 6pm ET)
 */
function startCodeMilestonesSchedule() {
  const cron = require('node-cron');
  logger.info('⏰ Code milestones schedule started (6am, 12pm, 6pm)');

  // 6:00 AM ET
  cron.schedule('0 6 * * *', async () => {
    logger.info('\n⏰ [6am] Code milestones generation triggered');
    await generateCodeMilestones();
  });

  // 12:00 PM ET
  cron.schedule('0 12 * * *', async () => {
    logger.info('\n⏰ [12pm] Code milestones generation triggered');
    await generateCodeMilestones();
  });

  // 6:00 PM ET
  cron.schedule('0 18 * * *', async () => {
    logger.info('\n⏰ [6pm] Code milestones generation triggered');
    await generateCodeMilestones();
  });
}

module.exports = { generateJourneyForProject, generateCodeMilestones, startCodeMilestonesSchedule };

// Run for ITA Airways if executed directly
if (require.main === module) {
  generateJourneyForProject('ITA Airways');
}
