const { supabase } = require('./db/supabase-client');

(async () => {
  console.log('🗑️  Deleting corrupted briefings...\n');

  const datesToDelete = ['2025-10-20', '2025-10-21'];

  for (const date of datesToDelete) {
    console.log(`Deleting: ${date}`);

    const { error } = await supabase
      .from('daily_briefs')
      .delete()
      .eq('date', date);

    if (error) {
      console.error(`  ❌ Error:`, error.message);
    } else {
      console.log(`  ✅ Deleted`);
    }
  }

  console.log('\n✅ Cleanup complete!\n');
  process.exit(0);
})();
