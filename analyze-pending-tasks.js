/**
 * Automated pending tasks analysis
 * Analyzes 172 pending tasks to find patterns and issues
 */

const { supabase } = require('./db/supabase-client');

async function analyzePendingTasks() {
  console.log('\n🔍 Analyzing pending tasks...\n');

  // Fetch all pending tasks
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  console.log(`📊 Total pending tasks: ${tasks.length}\n`);

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
  console.log('═'.repeat(80));
  console.log('PENDING TASKS ANALYSIS REPORT');
  console.log('═'.repeat(80));
  console.log();

  console.log('📊 CONFIDENCE DISTRIBUTION');
  console.log('─'.repeat(80));
  console.log(`  High (90%+):      ${analysis.byConfidence.high.length} tasks`);
  console.log(`  Medium (70-89%):  ${analysis.byConfidence.medium.length} tasks`);
  console.log(`  Low (<70%):       ${analysis.byConfidence.low.length} tasks`);
  console.log(`  No confidence:    ${analysis.byConfidence.none.length} tasks`);
  console.log();

  console.log('⏰ TIME DISTRIBUTION');
  console.log('─'.repeat(80));
  console.log(`  Last 24 hours:    ${analysis.recentVsOld.last24h.length} tasks`);
  console.log(`  Last 7 days:      ${analysis.recentVsOld.last7days.length} tasks`);
  console.log(`  Older than 7d:    ${analysis.recentVsOld.older.length} tasks`);
  console.log();

  console.log('🔍 ISSUE PATTERNS');
  console.log('─'.repeat(80));
  console.log(`  Meeting invites:  ${analysis.meetingInvites.length} tasks (should be calendar events)`);
  console.log(`  FYI/Informational:${analysis.fyiEmails.length} tasks (no action needed)`);
  console.log(`  Vague tasks:      ${analysis.vague.length} tasks (unclear action)`);
  console.log();

  console.log('📁 TOP 10 SOURCES');
  console.log('─'.repeat(80));
  const sortedSources = Object.entries(analysis.bySource)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10);

  sortedSources.forEach(([source, tasks]) => {
    console.log(`  ${tasks.length.toString().padStart(3)} tasks | ${source.substring(0, 60)}`);
  });
  console.log();

  console.log('🎯 PROJECT DISTRIBUTION');
  console.log('─'.repeat(80));
  const sortedProjects = Object.entries(analysis.byProject)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10);

  sortedProjects.forEach(([projectId, tasks]) => {
    const projectName = projectId === 'none' ? '(No Project)' : projectId.substring(0, 8);
    console.log(`  ${tasks.length.toString().padStart(3)} tasks | ${projectName}`);
  });
  console.log();

  // Sample meeting invites
  if (analysis.meetingInvites.length > 0) {
    console.log('🚫 SAMPLE MEETING INVITES (should be calendar events):');
    console.log('─'.repeat(80));
    analysis.meetingInvites.slice(0, 5).forEach((task, i) => {
      console.log(`\n${i + 1}. "${task.title}"`);
      console.log(`   Confidence: ${(task.confidence * 100).toFixed(0)}%`);
      console.log(`   Reasoning: ${task.detection_reasoning?.substring(0, 100)}...`);
    });
    console.log();
  }

  // Sample FYI emails
  if (analysis.fyiEmails.length > 0) {
    console.log('ℹ️  SAMPLE FYI EMAILS (no action needed):');
    console.log('─'.repeat(80));
    analysis.fyiEmails.slice(0, 5).forEach((task, i) => {
      console.log(`\n${i + 1}. "${task.title}"`);
      console.log(`   Confidence: ${(task.confidence * 100).toFixed(0)}%`);
      console.log(`   Reasoning: ${task.detection_reasoning?.substring(0, 100)}...`);
    });
    console.log();
  }

  // Sample vague tasks
  if (analysis.vague.length > 0) {
    console.log('❓ SAMPLE VAGUE TASKS (unclear action):');
    console.log('─'.repeat(80));
    analysis.vague.slice(0, 5).forEach((task, i) => {
      console.log(`\n${i + 1}. "${task.title}"`);
      console.log(`   Confidence: ${(task.confidence * 100).toFixed(0)}%`);
      console.log(`   Reasoning: ${task.detection_reasoning?.substring(0, 100)}...`);
    });
    console.log();
  }

  // Recommendations
  console.log('💡 RECOMMENDATIONS');
  console.log('─'.repeat(80));
  console.log();

  if (analysis.meetingInvites.length > 10) {
    console.log(`1. HIGH PRIORITY: Fix meeting invite detection`);
    console.log(`   ${analysis.meetingInvites.length} tasks are calendar events, not tasks`);
    console.log(`   Action: Update email-analyzer.js to reject meeting invites`);
    console.log();
  }

  if (analysis.fyiEmails.length > 10) {
    console.log(`2. HIGH PRIORITY: Improve FYI/informational filtering`);
    console.log(`   ${analysis.fyiEmails.length} tasks have no actionable items`);
    console.log(`   Action: Strengthen action verb detection in email-analyzer.js`);
    console.log();
  }

  if (analysis.vague.length > 10) {
    console.log(`3. MEDIUM PRIORITY: Increase clarity threshold`);
    console.log(`   ${analysis.vague.length} tasks have vague/unclear actions`);
    console.log(`   Action: Require specific action verbs and objects`);
    console.log();
  }

  if (analysis.recentVsOld.older.length > 20) {
    console.log(`4. CLEANUP: Remove old pending tasks`);
    console.log(`   ${analysis.recentVsOld.older.length} tasks are over 7 days old`);
    console.log(`   Action: Review and archive/delete stale pending tasks`);
    console.log();
  }

  console.log('═'.repeat(80));
  console.log();
}

analyzePendingTasks().catch(console.error);
