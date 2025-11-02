const { supabase } = require('./db/supabase-client');
const readline = require('readline');

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
  console.log('\n🧹 Duplicate Task Cleanup Tool\n');
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
    console.log('✅ No duplicate tasks found!');
    rl.close();
    return;
  }

  console.log(`\n❌ Found ${duplicateGroups.length} emails with duplicate tasks:\n`);

  let totalDuplicates = 0;
  const toKeep = [];
  const toDismiss = [];

  duplicateGroups.forEach(([emailSource, tasks], idx) => {
    const emailId = emailSource.replace('email:', '').substring(0, 50);
    console.log(`\n${idx + 1}. Email: ${emailId}...`);
    console.log(`   ${tasks.length} tasks found:\n`);

    tasks.forEach((task, i) => {
      console.log(`   [${i + 1}] ${task.title}`);
      console.log(`       Created: ${new Date(task.created_at).toLocaleString()}`);
      console.log(`       ID: ${task.id}`);
    });

    // Strategy: Keep the OLDEST task (first created), dismiss the rest
    const oldest = tasks[0]; // Already sorted by created_at
    const duplicates = tasks.slice(1);

    toKeep.push(oldest);
    toDismiss.push(...duplicates);
    totalDuplicates += duplicates.length;

    console.log(`\n   ✅ KEEP:    ${oldest.title} (${new Date(oldest.created_at).toLocaleDateString()})`);
    console.log(`   ❌ DISMISS: ${duplicates.length} duplicate(s)`);
  });

  console.log('\n' + '═'.repeat(80));
  console.log(`\n📊 Summary:`);
  console.log(`   Total tasks: ${tasks.length}`);
  console.log(`   Tasks to keep: ${toKeep.length}`);
  console.log(`   Tasks to dismiss: ${toDismiss.length}`);
  console.log('\n' + '═'.repeat(80));

  // Ask for confirmation
  const answer = await ask('\n⚠️  Proceed with cleanup? (yes/no): ');

  if (answer.toLowerCase() !== 'yes') {
    console.log('\n❌ Cleanup cancelled.');
    rl.close();
    return;
  }

  console.log('\n🚀 Starting cleanup...\n');

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
      console.error(`   ❌ Error dismissing "${task.title}":`, error.message);
    } else {
      dismissed++;
      console.log(`   ✅ Dismissed: ${task.title}`);
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log(`\n🎉 Cleanup complete!`);
  console.log(`   Dismissed: ${dismissed} tasks`);
  console.log(`   Kept: ${toKeep.length} tasks`);
  console.log('\n💡 Tip: Run list-pending-tasks.js to verify results\n');

  rl.close();
}

cleanupDuplicates().catch(error => {
  console.error('\n❌ Error:', error);
  rl.close();
  process.exit(1);
});
