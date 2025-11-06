const logger = require('../../utils/logger');

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function cleanupNoTitleEvents() {
  logger.info('\n🧹 Cleaning up "No Title" events from daily briefs...\n');

  // Fetch all daily_briefs records
  const { data: briefs, error: fetchError } = await supabase
    .from('daily_briefs')
    .select('date, calendar_events');

  if (fetchError) {
    logger.error('❌ Error fetching briefs:', { arg0: fetchError });
    return;
  }

  logger.info('Found  daily brief records', { length || 0: briefs?.length || 0 });

  let totalNoTitle = 0;
  let updatedDates = [];

  // Process each brief
  for (const brief of briefs || []) {
    if (!brief.calendar_events || brief.calendar_events.length === 0) continue;

    // Filter out "No Title" events
    const originalCount = brief.calendar_events.length;
    const cleanedEvents = brief.calendar_events.filter(event =>
      event.summary && event.summary.trim() !== '' && event.summary !== 'No Title'
    );

    const removedCount = originalCount - cleanedEvents.length;

    if (removedCount > 0) {
      // Update the brief with cleaned events
      const { error: updateError } = await supabase
        .from('daily_briefs')
        .update({ calendar_events: cleanedEvents })
        .eq('date', brief.date);

      if (updateError) {
        logger.error('❌ Error updating :', { date: brief.date });
      } else {
        logger.info('✅ : Removed  "No Title" event(s)', { date: brief.date, removedCount: removedCount });
        totalNoTitle += removedCount;
        updatedDates.push(brief.date);
      }
    }
  }

  logger.info('\n✨ Cleanup complete!');
  logger.info('Total "No Title" events removed:', { totalNoTitle: totalNoTitle });
  logger.info('Dates updated:', { length: updatedDates.length });
}

cleanupNoTitleEvents();
