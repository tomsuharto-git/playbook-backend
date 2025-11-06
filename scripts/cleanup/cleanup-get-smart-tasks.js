/**
 * Cleanup script to dismiss false-positive tasks from Get Smart strategic documents
 * These 172 tasks were created when vault watcher processed client briefs as meeting notes
 */

const { supabase } = require('./db/supabase-client');

async function cleanupGetSmartTasks() {
  console.log('\n🧹 Cleaning up Get Smart false-positive tasks...\n');

  // Fetch all pending tasks from Get Smart folder
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('status', 'pending')
    .ilike('detected_from', '%/Get Smart/%');

  if (error) {
    console.error('❌ Error fetching tasks:', error);
    return;
  }

  console.log(`📊 Found ${tasks.length} pending tasks from Get Smart folder\n`);

  if (tasks.length === 0) {
    console.log('✅ No tasks to clean up');
    return;
  }

  // Show sample tasks
  console.log('📋 Sample tasks (first 10):');
  console.log('─'.repeat(80));
  tasks.slice(0, 10).forEach((task, i) => {
    console.log(`${i + 1}. "${task.title}"`);
    console.log(`   From: ${task.detected_from.split('/').slice(-2).join('/')}`);
    console.log(`   Confidence: ${(task.confidence * 100).toFixed(0)}%`);
    console.log();
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
    console.error('❌ Error dismissing tasks:', updateError);
    return;
  }

  console.log('═'.repeat(80));
  console.log(`✅ Successfully dismissed ${taskIds.length} false-positive tasks`);
  console.log();
  console.log('📝 Summary:');
  console.log(`   - These tasks were extracted from Get Smart client briefs`);
  console.log(`   - They were strategic recommendations, not actionable to-dos`);
  console.log(`   - Vault watcher has been updated to skip /Get Smart/ folder`);
  console.log(`   - Future Get Smart edits will NOT create tasks`);
  console.log();
}

cleanupGetSmartTasks().catch(console.error);
