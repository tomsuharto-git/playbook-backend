const { supabase } = require('./db/supabase-client');

async function autoCleanupDuplicates() {
  console.log('\n🧹 Auto Duplicate Task Cleanup\n');
  console.log('═'.repeat(80));

  // Get all pending email-based tasks
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('status', 'pending')
    .like('detected_from', 'email:%')
    .order('detected_from')
    .order('created_at');

  if (!tasks || tasks.length === 0) {
    console.log('✅ No pending email-based tasks found.');
    return;
  }

  console.log(`Found ${tasks.length} pending email-based tasks\n`);

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
    console.log('✅ No duplicate tasks found!');
    return;
  }

  console.log(`❌ Found ${duplicateGroups.length} emails with duplicate tasks:\n`);

  let totalDuplicates = 0;
  const toKeep = [];
  const toDismiss = [];

  duplicateGroups.forEach(([emailSource, tasks], idx) => {
    const emailId = emailSource.replace('email:', '').substring(0, 50);
    console.log(`${idx + 1}. Email: ${emailId}...`);
    console.log(`   ${tasks.length} tasks:\n`);

    tasks.forEach((task, i) => {
      console.log(`   [${i + 1}] ${task.title}`);
      console.log(`       Created: ${new Date(task.created_at).toLocaleString()}`);
    });

    // Strategy: Keep the OLDEST task (first created), dismiss the rest
    const oldest = tasks[0]; // Already sorted by created_at
    const duplicates = tasks.slice(1);

    toKeep.push(oldest);
    toDismiss.push(...duplicates);
    totalDuplicates += duplicates.length;

    console.log(`\n   ✅ KEEPING:    ${oldest.title}`);
    console.log(`   ❌ DISMISSING: ${duplicates.length} duplicate(s)\n`);
  });

  console.log('═'.repeat(80));
  console.log(`\n📊 Summary:`);
  console.log(`   Tasks to keep: ${toKeep.length}`);
  console.log(`   Tasks to dismiss: ${toDismiss.length}\n`);

  console.log('🚀 Starting cleanup...\n');

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
      console.error(`   ❌ Error dismissing "${task.title}":`, error.message);
    } else {
      dismissed++;
      console.log(`   ✅ Dismissed: ${task.title}`);
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log(`\n🎉 Cleanup complete!`);
  console.log(`   Dismissed: ${dismissed} tasks`);
  console.log(`   Kept: ${toKeep.length} tasks\n`);
}

autoCleanupDuplicates().catch(error => {
  console.error('\n❌ Error:', error);
  process.exit(1);
});
