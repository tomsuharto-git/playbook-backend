const logger = require('../../utils/logger');

/**
 * Cleanup script to dismiss false-positive tasks from Get Smart strategic documents
 * These 172 tasks were created when vault watcher processed client briefs as meeting notes
 */

const { supabase } = require('./db/supabase-client');

async function cleanupGetSmartTasks() {
  logger.info('\n🧹 Cleaning up Get Smart false-positive tasks...\n');

  // Fetch all pending tasks from Get Smart folder
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('status', 'pending')
    .ilike('detected_from', '%/Get Smart/%');

  if (error) {
    logger.error('❌ Error fetching tasks:', { arg0: error });
    return;
  }

  logger.debug('📊 Found  pending tasks from Get Smart folder\n', { length: tasks.length });

  if (tasks.length === 0) {
    logger.info('✅ No tasks to clean up');
    return;
  }

  // Show sample tasks
  logger.info('📋 Sample tasks (first 10):');
  logger.info('─'.repeat(80));
  tasks.slice(0, 10).forEach((task, i) => {
    logger.info('. ""', { i + 1: i + 1, title: task.title });
    logger.info('From:', { join('/'): task.detected_from.split('/').slice(-2).join('/') });
    logger.info('Confidence: %', { toFixed(0): (task.confidence * 100).toFixed(0) });
    logger.info();
  });

  // Dismiss all Get Smart tasks
  const taskIds = tasks.map(t => t.id);

  const { error: updateError } = await supabase
    .from('tasks')
    .update({
      status: 'dismissed'
    })
    .in('id', taskIds);

  if (updateError) {
    logger.error('❌ Error dismissing tasks:', { arg0: updateError });
    return;
  }

  logger.info('═'.repeat(80));
  logger.info('✅ Successfully dismissed  false-positive tasks', { length: taskIds.length });
  logger.info();
  logger.debug('📝 Summary:');
  logger.info('- These tasks were extracted from Get Smart client briefs');
  logger.info('- They were strategic recommendations, not actionable to-dos');
  logger.info('- Vault watcher has been updated to skip /Get Smart/ folder');
  logger.info('- Future Get Smart edits will NOT create tasks');
  logger.info();
}

cleanupGetSmartTasks().catch(error => {
  logger.error('❌ Script failed', { error: error.message, stack: error.stack });
});
