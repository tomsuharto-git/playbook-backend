const logger = require('../../utils/logger');

/**
 * Automated pending tasks analysis
 * Analyzes 172 pending tasks to find patterns and issues
 */

const { supabase } = require('./db/supabase-client');

async function analyzePendingTasks() {
  logger.debug('\n🔍 Analyzing pending tasks...\n');

  // Fetch all pending tasks
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('❌ Error:', { arg0: error });
    return;
  }

  logger.debug('📊 Total pending tasks: \n', { length: tasks.length });

  // Analysis buckets
  const analysis = {
    byConfidence: {
      high: [], // 90%+
      medium: [], // 70-89%
      low: [], // <70%
      none: []
    },
    bySource: {},
    byProject: {},
    meetingInvites: [],
    fyiEmails: [],
    duplicates: [],
    vague: [],
    recentVsOld: {
      last24h: [],
      last7days: [],
      older: []
    }
  };

  // Keywords that suggest meeting invites
  const meetingKeywords = ['meeting', 'call', 'zoom', 'teams', 'lunch', 'coffee', 'invite', 'join', 'conference'];

  // Keywords that suggest FYI/informational
  const fyiKeywords = ['fyi', 'for your information', 'sharing', 'update', 'notification', 'reminder', 'heads up'];

  // Vague action phrases
  const vagueKeywords = ['follow up', 'check in', 'circle back', 'touch base', 'reach out', 'catch up'];

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Analyze each task
  for (const task of tasks) {
    const title = (task.title || '').toLowerCase();
    const description = (task.description || '').toLowerCase();
    const reasoning = (task.detection_reasoning || '').toLowerCase();
    const fullText = `${title} ${description} ${reasoning}`;

    // Confidence distribution
    if (task.confidence >= 0.90) {
      analysis.byConfidence.high.push(task);
    } else if (task.confidence >= 0.70) {
      analysis.byConfidence.medium.push(task);
    } else if (task.confidence > 0) {
      analysis.byConfidence.low.push(task);
    } else {
      analysis.byConfidence.none.push(task);
    }

    // Source distribution
    const source = task.detected_from || 'unknown';
    if (!analysis.bySource[source]) {
      analysis.bySource[source] = [];
    }
    analysis.bySource[source].push(task);

    // Project distribution
    const projectId = task.project_id || 'none';
    if (!analysis.byProject[projectId]) {
      analysis.byProject[projectId] = [];
    }
    analysis.byProject[projectId].push(task);

    // Check for meeting invites
    if (meetingKeywords.some(keyword => fullText.includes(keyword))) {
      analysis.meetingInvites.push(task);
    }

    // Check for FYI emails
    if (fyiKeywords.some(keyword => fullText.includes(keyword))) {
      analysis.fyiEmails.push(task);
    }

    // Check for vague tasks
    if (vagueKeywords.some(keyword => fullText.includes(keyword))) {
      analysis.vague.push(task);
    }

    // Time-based distribution
    const createdAt = new Date(task.created_at);
    if (createdAt > oneDayAgo) {
      analysis.recentVsOld.last24h.push(task);
    } else if (createdAt > sevenDaysAgo) {
      analysis.recentVsOld.last7days.push(task);
    } else {
      analysis.recentVsOld.older.push(task);
    }
  }

  // Print report
  logger.info('═'.repeat(80));
  logger.info('PENDING TASKS ANALYSIS REPORT');
  logger.info('═'.repeat(80));
  logger.info();

  logger.debug('📊 CONFIDENCE DISTRIBUTION');
  logger.info('─'.repeat(80));
  logger.info('High (90%+):       tasks', { length: analysis.byConfidence.high.length });
  logger.info('Medium (70-89%):   tasks', { length: analysis.byConfidence.medium.length });
  logger.info('Low (<70%):        tasks', { length: analysis.byConfidence.low.length });
  logger.info('No confidence:     tasks', { length: analysis.byConfidence.none.length });
  logger.info();

  logger.info('⏰ TIME DISTRIBUTION');
  logger.info('─'.repeat(80));
  logger.info('Last 24 hours:     tasks', { length: analysis.recentVsOld.last24h.length });
  logger.info('Last 7 days:       tasks', { length: analysis.recentVsOld.last7days.length });
  logger.info('Older than 7d:     tasks', { length: analysis.recentVsOld.older.length });
  logger.info();

  logger.debug('🔍 ISSUE PATTERNS');
  logger.info('─'.repeat(80));
  logger.info('Meeting invites:   tasks (should be calendar events)', { length: analysis.meetingInvites.length });
  logger.info('FYI/Informational: tasks (no action needed)', { length: analysis.fyiEmails.length });
  logger.info('Vague tasks:       tasks (unclear action)', { length: analysis.vague.length });
  logger.info();

  logger.info('📁 TOP 10 SOURCES');
  logger.info('─'.repeat(80));
  const sortedSources = Object.entries(analysis.bySource)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10);

  sortedSources.forEach(([source, tasks]) => {
    logger.info('tasks |', { padStart(3): tasks.length.toString().padStart(3), substring(0, 60): source.substring(0, 60) });
  });
  logger.info();

  logger.info('🎯 PROJECT DISTRIBUTION');
  logger.info('─'.repeat(80));
  const sortedProjects = Object.entries(analysis.byProject)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10);

  sortedProjects.forEach(([projectId, tasks]) => {
    const projectName = projectId === 'none' ? '(No Project)' : projectId.substring(0, 8);
    logger.info('tasks |', { padStart(3): tasks.length.toString().padStart(3), projectName: projectName });
  });
  logger.info();

  // Sample meeting invites
  if (analysis.meetingInvites.length > 0) {
    logger.info('🚫 SAMPLE MEETING INVITES (should be calendar events):');
    logger.info('─'.repeat(80));
    analysis.meetingInvites.slice(0, 5).forEach((task, i) => {
      logger.info('\n. ""', { i + 1: i + 1, title: task.title });
      logger.info('Confidence: %', { toFixed(0): (task.confidence * 100).toFixed(0) });
      logger.info('Reasoning: ...', { substring(0, 100): task.detection_reasoning?.substring(0, 100) });
    });
    logger.info();
  }

  // Sample FYI emails
  if (analysis.fyiEmails.length > 0) {
    logger.info('ℹ️  SAMPLE FYI EMAILS (no action needed):');
    logger.info('─'.repeat(80));
    analysis.fyiEmails.slice(0, 5).forEach((task, i) => {
      logger.info('\n. ""', { i + 1: i + 1, title: task.title });
      logger.info('Confidence: %', { toFixed(0): (task.confidence * 100).toFixed(0) });
      logger.info('Reasoning: ...', { substring(0, 100): task.detection_reasoning?.substring(0, 100) });
    });
    logger.info();
  }

  // Sample vague tasks
  if (analysis.vague.length > 0) {
    logger.info('❓ SAMPLE VAGUE TASKS (unclear action):');
    logger.info('─'.repeat(80));
    analysis.vague.slice(0, 5).forEach((task, i) => {
      logger.info('\n. ""', { i + 1: i + 1, title: task.title });
      logger.info('Confidence: %', { toFixed(0): (task.confidence * 100).toFixed(0) });
      logger.info('Reasoning: ...', { substring(0, 100): task.detection_reasoning?.substring(0, 100) });
    });
    logger.info();
  }

  // Recommendations
  logger.info('💡 RECOMMENDATIONS');
  logger.info('─'.repeat(80));
  logger.info();

  if (analysis.meetingInvites.length > 10) {
    logger.info('1. HIGH PRIORITY: Fix meeting invite detection');
    logger.info('tasks are calendar events, not tasks', { length: analysis.meetingInvites.length });
    logger.info('Action: Update email-analyzer.js to reject meeting invites');
    logger.info();
  }

  if (analysis.fyiEmails.length > 10) {
    logger.info('2. HIGH PRIORITY: Improve FYI/informational filtering');
    logger.info('tasks have no actionable items', { length: analysis.fyiEmails.length });
    logger.info('Action: Strengthen action verb detection in email-analyzer.js');
    logger.info();
  }

  if (analysis.vague.length > 10) {
    logger.info('3. MEDIUM PRIORITY: Increase clarity threshold');
    logger.info('tasks have vague/unclear actions', { length: analysis.vague.length });
    logger.info('Action: Require specific action verbs and objects');
    logger.info();
  }

  if (analysis.recentVsOld.older.length > 20) {
    logger.info('4. CLEANUP: Remove old pending tasks');
    logger.info('tasks are over 7 days old', { length: analysis.recentVsOld.older.length });
    logger.info('Action: Review and archive/delete stale pending tasks');
    logger.info();
  }

  logger.info('═'.repeat(80));
  logger.info();
}

analyzePendingTasks().catch(error => {
  logger.error('❌ Script failed', { error: error.message, stack: error.stack });
});
