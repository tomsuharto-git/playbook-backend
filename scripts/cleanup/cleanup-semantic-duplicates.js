const logger = require('../../utils/logger');

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
  logger.info('\n🧹 Semantic Duplicate Task Cleanup\n');
  logger.info('═'.repeat(80));

  // Get all pending email-based tasks
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('status', 'pending')
    .like('detected_from', 'email:%')
    .order('created_at');

  if (!tasks || tasks.length === 0) {
    logger.info('✅ No pending email-based tasks found.');
    return;
  }

  logger.info('Found  pending email-based tasks\n', { length: tasks.length });

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
    logger.info('✅ No semantic duplicates found!');
    return;
  }

  logger.error('❌ Found  groups of similar tasks:\n', { length: groups.length });

  const toDismiss = [];

  groups.forEach((group, idx) => {
    logger.info('. ""', { idx + 1: idx + 1, title: group[0].title });
    logger.info('similar tasks:\n', { length: group.length });

    group.forEach((task, i) => {
      const emailId = task.detected_from.replace('email:', '').substring(0, 40);
      logger.info('[]', { i + 1: i + 1, title: task.title });
      logger.info('Created:', { toLocaleString(): new Date(task.created_at).toLocaleString() });
      logger.info('Email: ...', { slice(-15): emailId.slice(-15) });
    });

    // Keep the oldest, dismiss the rest
    const duplicates = group.slice(1);
    toDismiss.push(...duplicates);

    logger.info('\n   ✅ KEEPING:    Task #1 (oldest)');
    logger.error('❌ DISMISSING:  duplicate(s)\n', { length: duplicates.length });
  });

  logger.info('═'.repeat(80));
  logger.debug('\n📊 Summary:');
  logger.info('Tasks to keep:', { length: groups.length });
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
      logger.error('❌ Error:', { message: error.message });
    } else {
      dismissed++;
      logger.info('✅ Dismissed: ...', { substring(0, 60): task.title.substring(0, 60) });
    }
  }

  logger.info('\n' + '═'.repeat(80));
  logger.info('\n🎉 Cleanup complete!');
  logger.info('Dismissed:  tasks', { dismissed: dismissed });
  logger.info('Kept:  unique tasks\n', { length: groups.length });
}

cleanupSemanticDuplicates().catch(error => {
  logger.error('\n❌ Error:', { arg0: error });
  process.exit(1);
});
