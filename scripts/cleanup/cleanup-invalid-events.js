const logger = require('../../utils/logger');

/**
 * Cleanup Invalid Events
 * Removes events with no title or no time from daily_briefs table
 * LAYER 4 DEFENSE: Automatic recovery from bad data
 */

const { supabase } = require('./db/supabase-client');

async function cleanupInvalidEvents() {
  logger.info('🧹 [LAYER 4] Cleaning up invalid events from daily_briefs...\n');

  try {
    // Fetch all daily briefs
    const { data: briefs, error } = await supabase
      .from('daily_briefs')
      .select('*');

    if (error) {
      logger.error('Error fetching briefs:', { arg0: error });
      return { success: false, error: error.message };
    }

    logger.info('Found  daily briefs to check', { length: briefs.length });

    let totalRemoved = 0;
    let totalKept = 0;

    for (const brief of briefs) {
      const events = brief.calendar_events || [];

      // Filter out invalid events
      const validEvents = events.filter(event => {
        const title = event.summary || '';
        const hasValidTitle = title && title.trim() !== '' && title !== 'No Title' && title.trim() !== 'No Title';
        const hasValidTime = event.start?.dateTime || event.start?.date;

        if (!hasValidTitle) {
          logger.info('🚫 [LAYER 4] Removing event with invalid title: "" from', { title: title, date: brief.date });
          return false;
        }

        if (!hasValidTime) {
          logger.info('🚫 [LAYER 4] Removing event with no time: "" from', { title: title, date: brief.date });
          return false;
        }

        return true;
      });

      const removed = events.length - validEvents.length;
      if (removed > 0) {
        // Update the brief with cleaned events
        await supabase
          .from('daily_briefs')
          .update({ calendar_events: validEvents })
          .eq('date', brief.date);

        logger.info('✅ [LAYER 4] : Removed  invalid events, kept', { date: brief.date, removed: removed, length: validEvents.length });
        totalRemoved += removed;
        totalKept += validEvents.length;
      } else {
        totalKept += validEvents.length;
      }
    }

    if (totalRemoved > 0) {
      logger.info('\n🛡️  [LAYER 4] Cleanup complete! Removed  invalid events, kept \n', { totalRemoved: totalRemoved, totalKept: totalKept });
    } else {
      logger.info('\n✅ [LAYER 4] No invalid events found (all  events valid)\n', { totalKept: totalKept });
    }

    return { success: true, removed: totalRemoved, kept: totalKept };
  } catch (err) {
    logger.error('Error during cleanup:', { arg0: err });
    return { success: false, error: err.message };
  }
}

// Allow direct execution or import as module
if (require.main === module) {
  cleanupInvalidEvents().then((result) => {
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = { cleanupInvalidEvents };
