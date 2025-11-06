const logger = require('../../utils/logger');

/**
 * Comprehensive cleanup of all false-positive tasks from Get Smart and strategic documentation
 */

const { supabase } = require('./db/supabase-client');

async function cleanupAllStrategicDocTasks() {
  logger.info('\n🧹 Comprehensive cleanup of strategic documentation false-positive tasks...\n');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Fetch ALL pending tasks from Get Smart and strategic documentation folders
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('status', 'pending')
    .eq('auto_detected', false)  // These were created manually/via API
    .gte('created_at', today.toISOString());

  if (error) {
    logger.error('❌ Error fetching tasks:', { arg0: error });
    return;
  }

  // Filter tasks from strategic documentation
  const strategicDocTasks = tasks.filter(task => {
    const path = task.detected_from || '';
    return path.includes('/Get Smart/') ||
           path.includes('/Synthetic Panels/') ||
           path.includes('DEPLOYMENT') ||
           path.includes('README') ||
           path.includes('QUICK-START') ||
           path.includes('TEMPLATE');
  });

  logger.debug('📊 Found  pending tasks from strategic documentation created today\n', { length: strategicDocTasks.length });

  if (strategicDocTasks.length === 0) {
    logger.info('✅ No tasks to clean up');
    return;
  }

  // Group by folder
  const tasksByFolder = {};
  strategicDocTasks.forEach(task => {
    const pathParts = task.detected_from?.split('/') || [];
    const folder = pathParts.length > 3 ? pathParts.slice(-3, -1).join('/') : 'unknown';
    if (!tasksByFolder[folder]) {
      tasksByFolder[folder] = [];
    }
    tasksByFolder[folder].push(task);
  });

  logger.info('📁 Tasks by folder:');
  logger.info('─'.repeat(80));
  Object.entries(tasksByFolder)
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([folder, folderTasks]) => {
      const count = folderTasks.length.toString().padStart(3);
      logger.info('tasks |', { count: count, folder: folder });
    });
  logger.info();

  // Dismiss all strategic doc tasks
  const taskIds = strategicDocTasks.map(t => t.id);

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
  logger.debug('📝 Root Cause Analysis:');
  logger.info('- Tasks were created via manual API (/api/tasks POST) with auto_detected: false');
  logger.info('- Source: Get Smart strategic briefs and deployment documentation');
  logger.info('- These files contain instructional content for Claude, not personal actions for Tom');
  logger.info();
  logger.info('✅ Existing Protections:');
  logger.info('- Vault watcher already excludes /Get Smart/ folder (vault-watcher.js:132-135)');
  logger.info('- Auto-detection will NOT create tasks from these files');
  logger.info();
  logger.warn('⚠️  Prevention:');
  logger.info('- These tasks were likely created during a Claude Code session');
  logger.info('- Avoid manually extracting tasks from strategic/instructional documents');
  logger.info('- Only create tasks from actual meeting notes and work sessions');
  logger.info();
}

cleanupAllStrategicDocTasks().catch(error => {
  logger.error('❌ Script failed', { error: error.message, stack: error.stack });
});
