// Compare calendar_events (old) vs events (Phase 2) tables
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function compareEventTables() {
  console.log('\n🔍 Comparing calendar_events vs events tables\n');
  console.log('='.repeat(80));

  try {
    // 1. Get record counts
    console.log('\n📊 RECORD COUNTS');
    console.log('-'.repeat(80));

    const { count: calendarCount } = await supabase
      .from('calendar_events')
      .select('*', { count: 'exact', head: true });

    const { count: eventsCount } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true });

    console.log(`calendar_events: ${calendarCount} records`);
    console.log(`events:          ${eventsCount} records`);
    console.log(`Difference:      ${calendarCount - eventsCount} records (${Math.round((calendarCount - eventsCount) / calendarCount * 100)}%)`);

    // 2. Sample records from calendar_events
    console.log('\n📋 SAMPLE: calendar_events (first 3 records)');
    console.log('-'.repeat(80));

    const { data: calendarSample } = await supabase
      .from('calendar_events')
      .select('*')
      .limit(3);

    if (calendarSample && calendarSample.length > 0) {
      console.log('\nColumns in calendar_events:');
      console.log(Object.keys(calendarSample[0]).join(', '));
      console.log('\nSample record:');
      console.log(JSON.stringify(calendarSample[0], null, 2));
    }

    // 3. Sample records from events
    console.log('\n📋 SAMPLE: events (first 3 records)');
    console.log('-'.repeat(80));

    const { data: eventsSample } = await supabase
      .from('events')
      .select('*')
      .limit(3);

    if (eventsSample && eventsSample.length > 0) {
      console.log('\nColumns in events:');
      console.log(Object.keys(eventsSample[0]).join(', '));
      console.log('\nSample record:');
      console.log(JSON.stringify(eventsSample[0], null, 2));
    }

    // 4. Check for external_id overlap
    console.log('\n🔗 EXTERNAL ID OVERLAP ANALYSIS');
    console.log('-'.repeat(80));

    const { data: calendarIds } = await supabase
      .from('calendar_events')
      .select('external_id, summary, start');

    const { data: eventsIds } = await supabase
      .from('events')
      .select('external_event_id, title, start_time');

    if (calendarIds && eventsIds) {
      const calendarExternalIds = new Set(calendarIds.map(e => e.external_id));
      const eventsExternalIds = new Set(eventsIds.map(e => e.external_event_id));

      // Find events in calendar_events but NOT in events
      const onlyInCalendar = calendarIds.filter(e => !eventsExternalIds.has(e.external_id));

      // Find events in events but NOT in calendar_events
      const onlyInEvents = eventsIds.filter(e => !calendarExternalIds.has(e.external_event_id));

      console.log(`\nEvents in calendar_events: ${calendarExternalIds.size} unique external_ids`);
      console.log(`Events in events:          ${eventsExternalIds.size} unique external_event_ids`);
      console.log(`\nOnly in calendar_events:   ${onlyInCalendar.length} events`);
      console.log(`Only in events:            ${onlyInEvents.length} events`);

      if (onlyInCalendar.length > 0) {
        console.log('\n📌 Sample events ONLY in calendar_events (first 5):');
        onlyInCalendar.slice(0, 5).forEach((e, i) => {
          console.log(`  ${i + 1}. ${e.summary} (${e.start?.dateTime || e.start})`);
        });
      }

      if (onlyInEvents.length > 0) {
        console.log('\n📌 Sample events ONLY in events (first 5):');
        onlyInEvents.slice(0, 5).forEach((e, i) => {
          console.log(`  ${i + 1}. ${e.title} (${e.start_time})`);
        });
      }
    }

    // 5. Date range comparison
    console.log('\n📅 DATE RANGE COMPARISON');
    console.log('-'.repeat(80));

    const { data: calendarDates } = await supabase
      .from('calendar_events')
      .select('start, created_at')
      .order('start->dateTime', { ascending: true });

    const { data: eventsDates } = await supabase
      .from('events')
      .select('start_time, created_at')
      .order('start_time', { ascending: true });

    if (calendarDates && calendarDates.length > 0) {
      const firstCalendar = calendarDates[0];
      const lastCalendar = calendarDates[calendarDates.length - 1];
      console.log(`\ncalendar_events:`);
      console.log(`  First event:   ${firstCalendar.start?.dateTime || firstCalendar.start}`);
      console.log(`  Last event:    ${lastCalendar.start?.dateTime || lastCalendar.start}`);
      console.log(`  First created: ${calendarDates[0].created_at}`);
    }

    if (eventsDates && eventsDates.length > 0) {
      console.log(`\nevents:`);
      console.log(`  First event:   ${eventsDates[0].start_time}`);
      console.log(`  Last event:    ${eventsDates[eventsDates.length - 1].start_time}`);
      console.log(`  First created: ${eventsDates[0].created_at}`);
    }

    // 6. Schema differences summary
    console.log('\n📐 SCHEMA DIFFERENCES SUMMARY');
    console.log('-'.repeat(80));

    if (calendarSample && calendarSample.length > 0 && eventsSample && eventsSample.length > 0) {
      const calendarCols = Object.keys(calendarSample[0]);
      const eventsCols = Object.keys(eventsSample[0]);

      console.log('\nColumns only in calendar_events:');
      const onlyInCalendarCols = calendarCols.filter(col => !eventsCols.includes(col));
      onlyInCalendarCols.forEach(col => console.log(`  - ${col}`));

      console.log('\nColumns only in events:');
      const onlyInEventsCols = eventsCols.filter(col => !calendarCols.includes(col));
      onlyInEventsCols.forEach(col => console.log(`  - ${col}`));

      console.log('\nCommon concept columns (may have different names):');
      console.log('  calendar_events     →     events');
      console.log('  ---------------           ------');
      console.log('  external_id         →     external_event_id');
      console.log('  summary             →     title');
      console.log('  start               →     start_time');
      console.log('  end                 →     end_time');
    }

    // 7. Recommendations
    console.log('\n💡 MIGRATION RECOMMENDATIONS');
    console.log('-'.repeat(80));
    console.log('\nBased on the analysis above:');
    console.log('1. Check if the missing events are historical or future');
    console.log('2. Determine if calendar_events has data that needs to be preserved');
    console.log('3. Update backend/routes/calendar.js to query from "events" instead');
    console.log('4. Consider migrating missing events if they\'re important');
    console.log('5. Once migration is verified, calendar_events can be deprecated');

    console.log('\n='.repeat(80));
    console.log('✅ Comparison complete!\n');

  } catch (error) {
    console.error('❌ Error comparing tables:', error);
  }
}

compareEventTables();
