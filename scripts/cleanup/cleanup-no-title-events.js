const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function cleanupNoTitleEvents() {
  console.log('\n🧹 Cleaning up "No Title" events from daily briefs...\n');

  // Fetch all daily_briefs records
  const { data: briefs, error: fetchError } = await supabase
    .from('daily_briefs')
    .select('date, calendar_events');

  if (fetchError) {
    console.error('❌ Error fetching briefs:', fetchError);
    return;
  }

  console.log(`Found ${briefs?.length || 0} daily brief records`);

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
        console.error(`❌ Error updating ${brief.date}:`, updateError);
      } else {
        console.log(`✅ ${brief.date}: Removed ${removedCount} "No Title" event(s)`);
        totalNoTitle += removedCount;
        updatedDates.push(brief.date);
      }
    }
  }

  console.log(`\n✨ Cleanup complete!`);
  console.log(`   Total "No Title" events removed: ${totalNoTitle}`);
  console.log(`   Dates updated: ${updatedDates.length}`);
}

cleanupNoTitleEvents();
