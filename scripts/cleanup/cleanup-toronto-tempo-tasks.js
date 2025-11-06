const logger = require('../../utils/logger');

/**
 * Cleanup script to dismiss false-positive tasks from Toronto Tempo Get Smart strategic documents
 * These 210 tasks were created from strategic analysis documents (deployment guides, briefs, etc.)
 * that contain instructional content, not personal action items
 */

const { supabase } = require('./db/supabase-client');

async function cleanupTorontoTempoTasks() {
  logger.info('\n🧹 Cleaning up Toronto Tempo Get Smart false-positive tasks...\n');

  // Fetch all pending tasks from Toronto Tempo folder created today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('status', 'pending')
    .eq('auto_detected', false)  // These were created manually/via API
    .ilike('detected_from', '%/Toronto-Tempo-2025-10/%')
    .gte('created_at', today.toISOString());

  if (error) {
    logger.error('❌ Error fetching tasks:', { arg0: error });
    return;
  }

  logger.debug('📊 Found  pending tasks from Toronto Tempo folder created today\n', { length: tasks.length });

  if (tasks.length === 0) {
    logger.info('✅ No tasks to clean up');
    return;
  }

  // Show sample tasks
  logger.info('📋 Sample tasks (first 15):');
  logger.info('─'.repeat(80));
  tasks.slice(0, 15).forEach((task, i) => {
    logger.info('. ""', { i + 1: i + 1, title: task.title });
    const fileName = task.detected_from?.split('/').pop() || 'unknown';
    logger.info('From:', { fileName: fileName });
    logger.info('Confidence:', { toFixed(0) + '%' : 'N/A': task.confidence ? (task.confidence * 100).toFixed(0) + '%' : 'N/A' });
    logger.info();
  });

  // Group by source file
  const tasksByFile = {};
  tasks.forEach(task => {
    const fileName = task.detected_from?.split('/').pop() || 'unknown';
    if (!tasksByFile[fileName]) {
      tasksByFile[fileName] = [];
    }
    tasksByFile[fileName].push(task);
  });

  logger.info('📁 Tasks by source file:');
  logger.info('─'.repeat(80));
  Object.entries(tasksByFile)
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([fileName, fileTasks]) => {
      logger.info('tasks |', { padStart(3): fileTasks.length.toString().padStart(3), fileName: fileName });
    });
  logger.info();

  // Dismiss all Toronto Tempo tasks
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
  logger.info('- These tasks were extracted from Toronto Tempo Get Smart strategic documents');
  logger.info('- They were deployment guides, strategic briefs, and technical documentation');
  logger.info('- These contain instructional content, not personal action items for Tom');
  logger.info('- Vault watcher already has /Get Smart/ folder exclusion (line 132-135)');
  logger.info('- Future Get Smart edits will NOT create tasks via auto-detection');
  logger.info();
  logger.info('💡 Next step:');
  logger.info('- Review how these tasks were created (manual API calls)');
  logger.info('- Ensure no workflows are automatically creating tasks from strategic docs');
  logger.info();
}

cleanupTorontoTempoTasks().catch(error => {
  logger.error('❌ Script failed', { error: error.message, stack: error.stack });
});
