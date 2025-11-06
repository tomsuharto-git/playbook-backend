const { supabase } = require('./db/supabase-client');
const readline = require('readline');
const logger = require('../../utils/logger');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => {
    rl.question(question, resolve);
  });
}

async function cleanupDuplicates() {
  logger.info('\n🧹 Duplicate Task Cleanup Tool\n');
  logger.info('═'.repeat(80));

  // Get all pending email-based tasks
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('status', 'pending')
    .like('detected_from', 'email:%')
    .order('detected_from')
    .order('created_at');

  if (!tasks || tasks.length === 0) {
    logger.info('✅ No pending email-based tasks found.');
    rl.close();
    return;
  }

  // Group by email source
  const grouped = {};
  tasks.forEach(task => {
    if (!grouped[task.detected_from]) {
      grouped[task.detected_from] = [];
    }
    grouped[task.detected_from].push(task);
  });

  // Find duplicates (more than 1 task from same email)
  const duplicateGroups = Object.entries(grouped).filter(([_, tasks]) => tasks.length > 1);

  if (duplicateGroups.length === 0) {
    logger.info('✅ No duplicate tasks found!');
    rl.close();
    return;
  }

  logger.error('\n❌ Found  emails with duplicate tasks:\n', { length: duplicateGroups.length });

  let totalDuplicates = 0;
  const toKeep = [];
  const toDismiss = [];

  duplicateGroups.forEach(([emailSource, tasks], idx) => {
    const emailId = emailSource.replace('email:', '').substring(0, 50);
    logger.info('\n. Email: ...', { idx + 1: idx + 1, emailId: emailId });
    logger.info('tasks found:\n', { length: tasks.length });

    tasks.forEach((task, i) => {
      logger.info('[]', { i + 1: i + 1, title: task.title });
      logger.info('Created:', { toLocaleString(): new Date(task.created_at).toLocaleString() });
      logger.info('ID:', { id: task.id });
    });

    // Strategy: Keep the OLDEST task (first created), dismiss the rest
    const oldest = tasks[0]; // Already sorted by created_at
    const duplicates = tasks.slice(1);

    toKeep.push(oldest);
    toDismiss.push(...duplicates);
    totalDuplicates += duplicates.length;

    logger.info('\n   ✅ KEEP:     ()', { title: oldest.title, toLocaleDateString(): new Date(oldest.created_at).toLocaleDateString() });
    logger.error('❌ DISMISS:  duplicate(s)', { length: duplicates.length });
  });

  logger.info('\n' + '═'.repeat(80));
  logger.debug('\n📊 Summary:');
  logger.info('Total tasks:', { length: tasks.length });
  logger.info('Tasks to keep:', { length: toKeep.length });
  logger.info('Tasks to dismiss:', { length: toDismiss.length });
  logger.info('\n' + '═'.repeat(80));

  // Ask for confirmation
  const answer = await ask('\n⚠️  Proceed with cleanup? (yes/no): ');

  if (answer.toLowerCase() !== 'yes') {
    logger.error('\n❌ Cleanup cancelled.');
    rl.close();
    return;
  }

  logger.info('\n🚀 Starting cleanup...\n');

  // Dismiss duplicates
  let dismissed = 0;
  for (const task of toDismiss) {
    const { error } = await supabase
      .from('tasks')
      .update({
        status: 'dismissed',
        dismissed_at: new Date().toISOString(),
        dismissed_reason: 'Duplicate task from same email (auto-cleanup)'
      })
      .eq('id', task.id);

    if (error) {
      logger.error('❌ Error dismissing "":', { title: task.title });
    } else {
      dismissed++;
      logger.info('✅ Dismissed:', { title: task.title });
    }
  }

  logger.info('\n' + '═'.repeat(80));
  logger.info('\n🎉 Cleanup complete!');
  logger.info('Dismissed:  tasks', { dismissed: dismissed });
  logger.info('Kept:  tasks', { length: toKeep.length });
  logger.info('\n💡 Tip: Run list-pending-tasks.js to verify results\n');

  rl.close();
}

cleanupDuplicates().catch(error => {
  logger.error('\n❌ Error:', { arg0: error });
  rl.close();
  process.exit(1);
});
