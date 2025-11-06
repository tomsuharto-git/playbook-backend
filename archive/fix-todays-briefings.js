/**
 * Fix Today's Missing Briefings
 * Deletes today's cached briefings so they regenerate with briefings
 */

const { supabase } = require('./db/supabase-client');

async function fixTodaysBriefings() {
  // Get today's date in ET
  const etFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York'
  });
  const todayET = etFormatter.format(new Date());

  console.log(`\n🔧 Fixing briefings for ${todayET}...`);

  try {
    // Delete today's entry from daily_briefs
    const { error } = await supabase
      .from('daily_briefs')
      .delete()
      .eq('date', todayET);

    if (error) {
      console.error('❌ Error deleting:', error);
      return;
    }

    console.log('✅ Deleted cached entry for today');
    console.log('💡 Briefings will regenerate on next job run (6pm ET)');
    console.log('   Or restart the backend server to trigger immediate generation');

  } catch (err) {
    console.error('❌ Error:', err);
  }
}

fixTodaysBriefings();
