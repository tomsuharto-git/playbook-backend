/**
 * Task Pattern Learning Job
 * Analyzes approved vs dismissed tasks to extract patterns
 * Uses Claude to identify what makes a good vs bad task suggestion
 */

const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../utils/logger').job('analyze-task-patterns');
const { supabase } = require('../db/supabase-client');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function analyzeTaskPatterns() {
  logger.info('🧠 [TASK LEARNING] Starting pattern analysis...');

  try {
    // Fetch recent approved tasks (auto-detected only)
    const { data: approvedTasks } = await supabase
      .from('tasks')
      .select('id, title, description, urgency, task_type, detected_from')
      .eq('status', 'active')
      .eq('auto_detected', true)
      .not('approved_at', 'is', null)
      .order('approved_at', { ascending: false })
      .limit(50);

    // Fetch recent dismissed tasks (auto-detected only)
    const { data: dismissedTasks } = await supabase
      .from('tasks')
      .select('id, title, description, urgency, task_type, detected_from')
      .eq('status', 'dismissed')
      .eq('auto_detected', true)
      .not('dismissed_at', 'is', null)
      .order('dismissed_at', { ascending: false })
      .limit(50);

    logger.info('Found  approved tasks', { length || 0: approvedTasks?.length || 0 });
    logger.info('Found  dismissed tasks', { length || 0: dismissedTasks?.length || 0 });

    if (!approvedTasks?.length && !dismissedTasks?.length) {
      logger.warn('   ⚠️  Not enough data to analyze patterns yet');
      return { patterns: [], message: 'Insufficient data' };
    }

    // Analyze patterns with Claude
    const patterns = await extractPatterns(approvedTasks, dismissedTasks);

    // Store patterns in database
    await storePatterns(patterns);

    logger.info('✅ Learned  patterns', { length: patterns.length });

    return { patterns, success: true };

  } catch (error) {
    logger.error('   ❌ Pattern analysis failed:', { arg0: error.message });
    return { patterns: [], error: error.message };
  }
}

async function extractPatterns(approvedTasks, dismissedTasks) {
  const prompt = `You are analyzing a user's task management behavior to learn what kinds of auto-suggested tasks they approve vs dismiss.

APPROVED TASKS (tasks the user kept and worked on):
${approvedTasks.map(t => `- "${t.title}"${t.description ? `\n  Context: ${t.description}` : ''}`).join('\n')}

DISMISSED TASKS (tasks the user rejected):
${dismissedTasks.map(t => `- "${t.title}"${t.description ? `\n  Context: ${t.description}` : ''}`).join('\n')}

Analyze these tasks and extract clear patterns about what the user wants vs doesn't want.

IMPORTANT GUIDELINES:
1. Focus on actionable patterns (not just "user likes strategic tasks")
2. Be specific about what to avoid (e.g., "Avoid routine admin reminders like timesheets")
3. Include patterns about:
   - Task scope (too vague? too detailed?)
   - Task types (strategic vs tactical? creative vs analytical?)
   - Phrasing/tone preferences
   - What makes a task actionable vs not actionable

Return ONLY valid JSON (no markdown, no code blocks) in this format:
{
  "approved_patterns": [
    {
      "pattern": "Clear, specific description of what user APPROVES",
      "confidence": 0.0-1.0,
      "supporting_task_ids": ["id1", "id2"]
    }
  ],
  "dismissed_patterns": [
    {
      "pattern": "Clear, specific description of what user DISMISSES",
      "confidence": 0.0-1.0,
      "supporting_task_ids": ["id1", "id2"]
    }
  ]
}

Confidence scoring:
- 0.9-1.0: Very strong pattern (10+ examples, highly consistent)
- 0.7-0.9: Strong pattern (5-10 examples, consistent)
- 0.5-0.7: Moderate pattern (3-5 examples, mostly consistent)
- Below 0.5: Weak pattern (fewer examples or inconsistent)`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }]
  });

  const jsonText = response.content[0].text
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  const analysis = JSON.parse(jsonText);

  // Format patterns for storage
  const patterns = [];

  // Add approved patterns
  analysis.approved_patterns?.forEach(p => {
    patterns.push({
      pattern_type: 'approved',
      pattern: p.pattern,
      confidence: p.confidence,
      task_count: p.supporting_task_ids?.length || 0,
      examples: p.supporting_task_ids || []
    });
  });

  // Add dismissed patterns
  analysis.dismissed_patterns?.forEach(p => {
    patterns.push({
      pattern_type: 'dismissed',
      pattern: p.pattern,
      confidence: p.confidence,
      task_count: p.supporting_task_ids?.length || 0,
      examples: p.supporting_task_ids || []
    });
  });

  return patterns;
}

async function storePatterns(patterns) {
  // Clear old patterns
  await supabase.from('task_learning').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  // Insert new patterns
  const { error } = await supabase
    .from('task_learning')
    .insert(patterns);

  if (error) {
    logger.error('   ⚠️  Error storing patterns:', { arg0: error.message });
  }
}

async function getLearnedPatterns() {
  const { data: patterns } = await supabase
    .from('task_learning')
    .select('*')
    .order('confidence', { ascending: false });

  return patterns || [];
}

/**
 * Start weekly pattern learning schedule
 * Runs every Sunday at 3:00 AM ET
 */
function startPatternLearningSchedule() {
  const cron = require('node-cron');

  // Run every Sunday at 3:00 AM ET
  cron.schedule('0 3 * * 0', async () => {
    logger.info('\n⏰ [WEEKLY] Pattern learning triggered');
    try {
      const result = await analyzeTaskPatterns();
      logger.info('✅ [WEEKLY] Learned  patterns', { length || 0: result.patterns?.length || 0 });
    } catch (error) {
      logger.error('❌ [WEEKLY] Pattern learning failed:', { arg0: error.message });
    }
  }, {
    timezone: 'America/New_York'
  });

  logger.info('⏰ Task pattern learning scheduled (Sundays at 3 AM ET)');
}

module.exports = {
  analyzeTaskPatterns,
  getLearnedPatterns,
  startPatternLearningSchedule
};
