const logger = require('../../utils/logger');

const { supabase } = require('./db/supabase-client');

async function autoCleanupDuplicates() {
  logger.info('\n🧹 Auto Duplicate Task Cleanup\n');
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
    return;
  }

  logger.info('Found  pending email-based tasks\n', { length: tasks.length });

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
    return;
  }

  logger.error('❌ Found  emails with duplicate tasks:\n', { length: duplicateGroups.length });

  let totalDuplicates = 0;
  const toKeep = [];
  const toDismiss = [];

  duplicateGroups.forEach(([emailSource, tasks], idx) => {
    const emailId = emailSource.replace('email:', '').substring(0, 50);
    logger.info('. Email: ...', { idx + 1: idx + 1, emailId: emailId });
    logger.info('tasks:\n', { length: tasks.length });

    tasks.forEach((task, i) => {
      const taskNumber = i + 1;
      logger.info('task', { taskNumber: taskNumber, title: task.title });
      const createdAt = new Date(task.created_at).toLocaleString();
      logger.info('Created:', { createdAt: createdAt });
    });

    // Strategy: Keep the OLDEST task (first created), dismiss the rest
    const oldest = tasks[0]; // Already sorted by created_at
    const duplicates = tasks.slice(1);

    toKeep.push(oldest);
    toDismiss.push(...duplicates);
    totalDuplicates += duplicates.length;

    logger.info('\n   ✅ KEEPING:', { title: oldest.title });
    logger.error('❌ DISMISSING:  duplicate(s)\n', { length: duplicates.length });
  });

  logger.info('═'.repeat(80));
  logger.debug('\n📊 Summary:');
  logger.info('Tasks to keep:', { length: toKeep.length });
  logger.info('Tasks to dismiss: \n', { length: toDismiss.length });

  logger.info('🚀 Starting cleanup...\n');

  // Dismiss duplicates
  let dismissed = 0;
  for (const task of toDismiss) {
    const { error } = await supabase
      .from('tasks')
      .update({
        status: 'dismissed',
        dismissed_at: new Date().toISOString()
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
  logger.info('Kept:  tasks\n', { length: toKeep.length });
}

autoCleanupDuplicates().catch(error => {
  logger.error('\n❌ Error:', { arg0: error });
  process.exit(1);
});
