const logger = require('../utils/logger');

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

  logger.info('\n🔧 Fixing briefings for ...', { todayET: todayET });

  try {
    // Delete today's entry from daily_briefs
    const { error } = await supabase
      .from('daily_briefs')
      .delete()
      .eq('date', todayET);

    if (error) {
      logger.error('❌ Error deleting:', { arg0: error });
      return;
    }

    logger.info('✅ Deleted cached entry for today');
    logger.info('💡 Briefings will regenerate on next job run (6pm ET)');
    logger.info('   Or restart the backend server to trigger immediate generation');

  } catch (err) {
    logger.error('❌ Error:', { arg0: err });
  }
}

fixTodaysBriefings();
