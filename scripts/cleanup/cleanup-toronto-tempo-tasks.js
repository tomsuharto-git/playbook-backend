/**
 * Cleanup script to dismiss false-positive tasks from Toronto Tempo Get Smart strategic documents
 * These 210 tasks were created from strategic analysis documents (deployment guides, briefs, etc.)
 * that contain instructional content, not personal action items
 */

const { supabase } = require('./db/supabase-client');

async function cleanupTorontoTempoTasks() {
  console.log('\n🧹 Cleaning up Toronto Tempo Get Smart false-positive tasks...\n');

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
    console.error('❌ Error fetching tasks:', error);
    return;
  }

  console.log(`📊 Found ${tasks.length} pending tasks from Toronto Tempo folder created today\n`);

  if (tasks.length === 0) {
    console.log('✅ No tasks to clean up');
    return;
  }

  // Show sample tasks
  console.log('📋 Sample tasks (first 15):');
  console.log('─'.repeat(80));
  tasks.slice(0, 15).forEach((task, i) => {
    console.log(`${i + 1}. "${task.title}"`);
    const fileName = task.detected_from?.split('/').pop() || 'unknown';
    console.log(`   From: ${fileName}`);
    console.log(`   Confidence: ${task.confidence ? (task.confidence * 100).toFixed(0) + '%' : 'N/A'}`);
    console.log();
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

  console.log('📁 Tasks by source file:');
  console.log('─'.repeat(80));
  Object.entries(tasksByFile)
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([fileName, fileTasks]) => {
      console.log(`  ${fileTasks.length.toString().padStart(3)} tasks | ${fileName}`);
    });
  console.log();

  // Dismiss all Toronto Tempo tasks
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
  console.log(`   - These tasks were extracted from Toronto Tempo Get Smart strategic documents`);
  console.log(`   - They were deployment guides, strategic briefs, and technical documentation`);
  console.log(`   - These contain instructional content, not personal action items for Tom`);
  console.log(`   - Vault watcher already has /Get Smart/ folder exclusion (line 132-135)`);
  console.log(`   - Future Get Smart edits will NOT create tasks via auto-detection`);
  console.log();
  console.log('💡 Next step:');
  console.log(`   - Review how these tasks were created (manual API calls)`);
  console.log(`   - Ensure no workflows are automatically creating tasks from strategic docs`);
  console.log();
}

cleanupTorontoTempoTasks().catch(console.error);
