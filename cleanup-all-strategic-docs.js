/**
 * Comprehensive cleanup of all false-positive tasks from Get Smart and strategic documentation
 */

const { supabase } = require('./db/supabase-client');

async function cleanupAllStrategicDocTasks() {
  console.log('\n🧹 Comprehensive cleanup of strategic documentation false-positive tasks...\n');

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
    console.error('❌ Error fetching tasks:', error);
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

  console.log(`📊 Found ${strategicDocTasks.length} pending tasks from strategic documentation created today\n`);

  if (strategicDocTasks.length === 0) {
    console.log('✅ No tasks to clean up');
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

  console.log('📁 Tasks by folder:');
  console.log('─'.repeat(80));
  Object.entries(tasksByFolder)
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([folder, folderTasks]) => {
      const count = folderTasks.length.toString().padStart(3);
      console.log(`  ${count} tasks | ${folder}`);
    });
  console.log();

  // Dismiss all strategic doc tasks
  const taskIds = strategicDocTasks.map(t => t.id);

  const { error: updateError } = await supabase
    .from('tasks')
    .update({
      status: 'dismissed'
    })
    .in('id', taskIds);

  if (updateError) {
    console.error('❌ Error dismissing tasks:', updateError);
    return;
  }

  console.log('═'.repeat(80));
  console.log(`✅ Successfully dismissed ${taskIds.length} false-positive tasks`);
  console.log();
  console.log('📝 Root Cause Analysis:');
  console.log(`   - Tasks were created via manual API (/api/tasks POST) with auto_detected: false`);
  console.log(`   - Source: Get Smart strategic briefs and deployment documentation`);
  console.log(`   - These files contain instructional content for Claude, not personal actions for Tom`);
  console.log();
  console.log('✅ Existing Protections:');
  console.log(`   - Vault watcher already excludes /Get Smart/ folder (vault-watcher.js:132-135)`);
  console.log(`   - Auto-detection will NOT create tasks from these files`);
  console.log();
  console.log('⚠️  Prevention:');
  console.log(`   - These tasks were likely created during a Claude Code session`);
  console.log(`   - Avoid manually extracting tasks from strategic/instructional documents`);
  console.log(`   - Only create tasks from actual meeting notes and work sessions`);
  console.log();
}

cleanupAllStrategicDocTasks().catch(console.error);
