/**
 * Debug Brief API Issue
 * Find out why events aren't being returned
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function debugBriefData() {
  console.log('🔍 Debugging Brief API Issue\n');

  // Get today and tomorrow
  const dates = ['2025-11-02', '2025-11-03'];

  for (const date of dates) {
    console.log('='.repeat(60));
    console.log(`📅 Date: ${date}`);
    console.log('='.repeat(60));

    // Get daily_brief for this date
    const { data: brief, error } = await supabase
      .from('daily_briefs')
      .select('*')
      .eq('date', date)
      .single();

    if (error) {
      console.log('❌ Error fetching brief:', error.message);
      continue;
    }

    console.log('\n1. daily_briefs record:');
    console.log(`   event_ids: ${JSON.stringify(brief.event_ids)}`);
    console.log(`   event_ids length: ${brief.event_ids?.length || 0}`);
    console.log(`   calendar_events (JSONB) length: ${brief.calendar_events?.length || 0}`);

    if (brief.event_ids && brief.event_ids.length > 0) {
      console.log('\n2. Checking if events exist with these IDs:');
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('id, title, calendar_id, start_time')
        .in('id', brief.event_ids);

      if (eventsError) {
        console.log(`   ❌ Error: ${eventsError.message}`);
      } else {
        console.log(`   ✅ Found ${events?.length || 0} events in events table`);
        events?.forEach(e => {
          console.log(`      - ${e.title} (id: ${e.id})`);
        });
      }

      if (!events || events.length === 0) {
        console.log('\n   ❌ ISSUE FOUND: event_ids exist in daily_briefs but no matching events!');
        console.log('   💡 This is why the brief page shows no events');
        console.log('\n   🔧 SOLUTION: Use calendar_events JSONB fallback');
      }
    }

    if (brief.calendar_events && brief.calendar_events.length > 0) {
      console.log('\n3. ✅ Fallback available: calendar_events JSONB has', brief.calendar_events.length, 'events');
      brief.calendar_events.forEach((e, i) => {
        console.log(`      ${i+1}. ${e.summary || e.title || 'No title'}`);
      });
    }

    console.log('\n');
  }

  console.log('='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log('The issue: event_ids in daily_briefs don\'t match events in events table');
  console.log('The fix: Modify calendar.js route to use calendar_events JSONB as primary source');
  console.log('='.repeat(60));
}

debugBriefData().catch(err => {
  console.error('\n❌ Script error:', err);
  process.exit(1);
});
