/**
 * Code Project Progress Narrative Generator
 * Generates daily progress narratives for Code projects based on 24-hour activity
 * Runs 3x daily alongside Gmail scanner (6am, 12pm, 6pm ET)
 */

const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../db/supabase-client');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger').job('generate-code-progress');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VAULT_PATH = process.env.VAULT_PATH || path.join(process.env.HOME, 'Documents/Obsidian Vault');

/**
 * Get activity for a Code project in the last 24 hours
 * @param {Object} project - Project object
 * @returns {Object} Activity data
 */
async function get24HourActivity(project) {
  const twentyFourHoursAgo = new Date();
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
  const twentyFourHoursAgoISO = twentyFourHoursAgo.toISOString();

  // Get completed/dismissed tasks in last 24h
  const { data: completedTasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('project_id', project.id)
    .in('status', ['complete', 'dismissed'])
    .gte('updated_at', twentyFourHoursAgoISO)
    .order('updated_at', { ascending: false });

  // Get new files created in last 24h
  const { data: newFiles } = await supabase
    .from('meeting_notes')
    .select('*')
    .eq('project_id', project.id)
    .gte('created_at', twentyFourHoursAgoISO)
    .order('created_at', { ascending: false });

  // Get file updates in last 24h
  const { data: updatedFiles } = await supabase
    .from('meeting_notes')
    .select('*')
    .eq('project_id', project.id)
    .gte('updated_at', twentyFourHoursAgoISO)
    .neq('created_at', null) // Exclude files that were just created
    .order('updated_at', { ascending: false });

  return {
    completedTasks: completedTasks || [],
    newFiles: newFiles || [],
    updatedFiles: updatedFiles || [],
    hasActivity: (completedTasks?.length > 0) || (newFiles?.length > 0) || (updatedFiles?.length > 0)
  };
}

/**
 * Generate progress narrative using AI
 * @param {Object} project - Project object
 * @param {Object} activity - Activity data
 * @returns {Object} Narrative data
 */
async function generateProgressNarrative(project, activity) {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setHours(yesterday.getHours() - 24);

  // Build activity context
  const completedTasksText = activity.completedTasks.length > 0
    ? activity.completedTasks.map(t => `- ${t.title} (${t.priority || 'Normal'})`).join('\n')
    : 'No tasks completed';

  const newFilesText = activity.newFiles.length > 0
    ? activity.newFiles.map(f => `- ${f.title || 'Untitled'}`).join('\n')
    : 'No new files created';

  const updatedFilesText = activity.updatedFiles.length > 0
    ? activity.updatedFiles.map(f => `- ${f.title || 'Untitled'}`).join('\n')
    : 'No files updated';

  const prompt = `You are a code project progress tracker. Generate a concise progress summary for the following coding project's last 24 hours of activity.

**Project:** ${project.name}
**Time Period:** ${yesterday.toLocaleDateString()} - ${now.toLocaleDateString()}

**Activity in Last 24 Hours:**

**Completed Tasks:**
${completedTasksText}

**New Files Created:**
${newFilesText}

**Files Updated:**
${updatedFilesText}

Based on this activity, create a JSON response with:
1. A brief headline (1 sentence summary of progress, max 100 chars)
2. 2-4 bullet points highlighting key accomplishments
3. Keep it factual and concise

Return ONLY valid JSON in this exact format:
{
  "headline": "Brief summary of progress",
  "bullets": [
    "Bullet point 1",
    "Bullet point 2"
  ]
}`;

  logger.info('   📞 Calling Claude API for progress summary...');

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: prompt
    }]
  });

  let responseText = message.content[0].text;

  // Remove markdown code blocks if present
  responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    return JSON.parse(responseText);
  } catch (e) {
    logger.error('   ❌ Failed to parse AI response:', { arg0: e });
    // Fallback: create simple summary
    return {
      headline: `Progress update: ${activity.completedTasks.length} tasks completed`,
      bullets: activity.completedTasks.slice(0, 3).map(t => t.title)
    };
  }
}

/**
 * Generate progress narratives for all active Code projects
 */
async function generateCodeProjectProgress() {
  logger.debug('\n📊 Generating Code Project Progress Narratives\n');
  logger.info('='.repeat(60));

  try {
    // Get all active Code projects
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

    let processedCount = 0;
    let skippedCount = 0;

    for (const project of codeProjects) {
      logger.info('\n📦 Processing:', { name: project.name });

      // Get 24-hour activity
      const activity = await get24HourActivity(project);

      if (!activity.hasActivity) {
        logger.info('   ⏭️  No activity in last 24 hours - skipping');
        skippedCount++;
        continue;
      }

      logger.info('✓ Found activity:  tasks,  new files,  updated files', { length: activity.completedTasks.length, length: activity.newFiles.length, length: activity.updatedFiles.length });

      // Generate narrative
      const narrative = await generateProgressNarrative(project, activity);

      // Insert into meeting_notes table with proper schema
      const today = new Date().toISOString().split('T')[0];
      const { error: insertError } = await supabase
        .from('meeting_notes')
        .insert({
          project_id: project.id,
          file_path: `${VAULT_PATH}/Code Progress/${project.name}/${today}_progress.md`,
          title: 'Code Progress Update',
          date: today,
          analyzed: true,
          analysis: {
            narrative: {
              headline: narrative.headline,
              bullets: narrative.bullets
            },
            tasks: [],
            completed_tasks: [],
            blocked_tasks: [],
            delegated_tasks: [],
            team_objectives: [],
            project_updates: {
              status_change: 'Code progress logged',
              progress_notes: `Activity: ${activity.completedTasks.length} completed tasks, ${activity.newFiles.length} new files`
            }
          },
          created_at: new Date().toISOString()
        });

      if (insertError) {
        logger.error('❌ Error saving narrative for :', { name: project.name });
        continue;
      }

      logger.info('   ✅ Progress narrative saved');
      processedCount++;
    }

    logger.info('\n' + '='.repeat(60));
    logger.info('\n📈 Summary:');
    logger.info('- Projects with activity:', { processedCount: processedCount });
    logger.info('- Projects skipped (no activity):', { skippedCount: skippedCount });
    logger.info('- Total Code projects: \n', { length: codeProjects.length });

  } catch (error) {
    logger.error('❌ Unexpected error in generateCodeProjectProgress:', { arg0: error });
  }
}

/**
 * Start the code progress generation schedule (3x daily: 6am, 12pm, 6pm ET)
 */
function startCodeProgressSchedule() {
  const cron = require('node-cron');
  logger.info('⏰ Code progress schedule started (6am, 12pm, 6pm)');

  // 6:00 AM ET
  cron.schedule('0 6 * * *', async () => {
    logger.info('\n⏰ [6am] Code progress generation triggered');
    await generateCodeProjectProgress();
  });

  // 12:00 PM ET
  cron.schedule('0 12 * * *', async () => {
    logger.info('\n⏰ [12pm] Code progress generation triggered');
    await generateCodeProjectProgress();
  });

  // 6:00 PM ET
  cron.schedule('0 18 * * *', async () => {
    logger.info('\n⏰ [6pm] Code progress generation triggered');
    await generateCodeProjectProgress();
  });
}

module.exports = { generateCodeProjectProgress, startCodeProgressSchedule };

// Allow running standalone for testing
if (require.main === module) {
  generateCodeProjectProgress().then(() => {
    logger.info('✨ Done!');
    process.exit(0);
  });
}
