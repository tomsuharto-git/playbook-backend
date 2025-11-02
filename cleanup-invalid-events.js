/**
 * Cleanup Invalid Events
 * Removes events with no title or no time from daily_briefs table
 * LAYER 4 DEFENSE: Automatic recovery from bad data
 */

const { supabase } = require('./db/supabase-client');

async function cleanupInvalidEvents() {
  console.log('🧹 [LAYER 4] Cleaning up invalid events from daily_briefs...\n');

  try {
    // Fetch all daily briefs
    const { data: briefs, error } = await supabase
      .from('daily_briefs')
      .select('*');

    if (error) {
      console.error('Error fetching briefs:', error);
      return { success: false, error: error.message };
    }

    console.log(`Found ${briefs.length} daily briefs to check`);

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
          console.log(`  🚫 [LAYER 4] Removing event with invalid title: "${title}" from ${brief.date}`);
          return false;
        }

        if (!hasValidTime) {
          console.log(`  🚫 [LAYER 4] Removing event with no time: "${title}" from ${brief.date}`);
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

        console.log(`  ✅ [LAYER 4] ${brief.date}: Removed ${removed} invalid events, kept ${validEvents.length}`);
        totalRemoved += removed;
        totalKept += validEvents.length;
      } else {
        totalKept += validEvents.length;
      }
    }

    if (totalRemoved > 0) {
      console.log(`\n🛡️  [LAYER 4] Cleanup complete! Removed ${totalRemoved} invalid events, kept ${totalKept}\n`);
    } else {
      console.log(`\n✅ [LAYER 4] No invalid events found (all ${totalKept} events valid)\n`);
    }

    return { success: true, removed: totalRemoved, kept: totalKept };
  } catch (err) {
    console.error('Error during cleanup:', err);
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
