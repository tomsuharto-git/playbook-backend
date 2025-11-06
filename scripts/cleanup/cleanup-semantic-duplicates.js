const { supabase } = require('./db/supabase-client');

/**
 * Calculate similarity between two strings
 */
function calculateSimilarity(str1, str2) {
  const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const norm1 = normalize(str1);
  const norm2 = normalize(str2);

  const words1 = new Set(norm1.split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(norm2.split(/\s+/).filter(w => w.length > 2));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

async function cleanupSemanticDuplicates() {
  console.log('\n🧹 Semantic Duplicate Task Cleanup\n');
  console.log('═'.repeat(80));

  // Get all pending email-based tasks
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('status', 'pending')
    .like('detected_from', 'email:%')
    .order('created_at');

  if (!tasks || tasks.length === 0) {
    console.log('✅ No pending email-based tasks found.');
    return;
  }

  console.log(`Found ${tasks.length} pending email-based tasks\n`);

  // Group by title similarity (90%+ similar)
  const groups = [];
  const processed = new Set();

  for (let i = 0; i < tasks.length; i++) {
    if (processed.has(i)) continue;

    const group = [tasks[i]];
    processed.add(i);

    for (let j = i + 1; j < tasks.length; j++) {
      if (processed.has(j)) continue;

      const similarity = calculateSimilarity(tasks[i].title, tasks[j].title);
      if (similarity >= 0.70) {  // Lowered from 0.85 to catch more variations
        group.push(tasks[j]);
        processed.add(j);
      }
    }

    if (group.length > 1) {
      groups.push(group);
    }
  }

  if (groups.length === 0) {
    console.log('✅ No semantic duplicates found!');
    return;
  }

  console.log(`❌ Found ${groups.length} groups of similar tasks:\n`);

  const toDismiss = [];

  groups.forEach((group, idx) => {
    console.log(`${idx + 1}. "${group[0].title}"`);
    console.log(`   ${group.length} similar tasks:\n`);

    group.forEach((task, i) => {
      const emailId = task.detected_from.replace('email:', '').substring(0, 40);
      console.log(`   [${i + 1}] ${task.title}`);
      console.log(`       Created: ${new Date(task.created_at).toLocaleString()}`);
      console.log(`       Email: ...${emailId.slice(-15)}`);
    });

    // Keep the oldest, dismiss the rest
    const duplicates = group.slice(1);
    toDismiss.push(...duplicates);

    console.log(`\n   ✅ KEEPING:    Task #1 (oldest)`);
    console.log(`   ❌ DISMISSING: ${duplicates.length} duplicate(s)\n`);
  });

  console.log('═'.repeat(80));
  console.log(`\n📊 Summary:`);
  console.log(`   Tasks to keep: ${groups.length}`);
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
      console.error(`   ❌ Error: ${error.message}`);
    } else {
      dismissed++;
      console.log(`   ✅ Dismissed: ${task.title.substring(0, 60)}...`);
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log(`\n🎉 Cleanup complete!`);
  console.log(`   Dismissed: ${dismissed} tasks`);
  console.log(`   Kept: ${groups.length} unique tasks\n`);
}

cleanupSemanticDuplicates().catch(error => {
  console.error('\n❌ Error:', error);
  process.exit(1);
});
