// Detailed analysis for migrating calendar_events to events (Phase 2)
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function analyzeEventMigration() {
  console.log('\n🔬 DETAILED MIGRATION ANALYSIS\n');
  console.log('='.repeat(80));

  try {
    // Get all data from both tables
    const { data: calendarEvents } = await supabase
      .from('calendar_events')
      .select('*')
      .order('created_at', { ascending: true });

    const { data: events } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: true });

    console.log('\n📊 DATA SUMMARY');
    console.log('-'.repeat(80));
    console.log(`calendar_events: ${calendarEvents?.length || 0} records`);
    console.log(`events:          ${events?.length || 0} records`);

    if (!calendarEvents || !events) {
      console.log('❌ Could not fetch data from one or both tables');
      return;
    }

    // 1. Analyze time distribution
    console.log('\n📅 TIME DISTRIBUTION');
    console.log('-'.repeat(80));

    // Parse dates from calendar_events (handles both dateTime and date formats)
    const calendarDates = calendarEvents
      .map(e => {
        if (e.start?.dateTime) return new Date(e.start.dateTime);
        if (e.start?.date) return new Date(e.start.date);
        return null;
      })
      .filter(d => d !== null);

    const eventDates = events
      .map(e => e.start_time ? new Date(e.start_time) : null)
      .filter(d => d !== null);

    if (calendarDates.length > 0) {
      const calMin = new Date(Math.min(...calendarDates));
      const calMax = new Date(Math.max(...calendarDates));
      console.log(`\ncalendar_events event date range:`);
      console.log(`  Earliest: ${calMin.toISOString().split('T')[0]}`);
      console.log(`  Latest:   ${calMax.toISOString().split('T')[0]}`);
    }

    if (eventDates.length > 0) {
      const evMin = new Date(Math.min(...eventDates));
      const evMax = new Date(Math.max(...eventDates));
      console.log(`\nevents event date range:`);
      console.log(`  Earliest: ${evMin.toISOString().split('T')[0]}`);
      console.log(`  Latest:   ${evMax.toISOString().split('T')[0]}`);
    }

    // 2. Analyze sources/categories
    console.log('\n🔍 DATA SOURCES');
    console.log('-'.repeat(80));

    const calendarSources = {};
    calendarEvents.forEach(e => {
      const source = e.source || 'unknown';
      calendarSources[source] = (calendarSources[source] || 0) + 1;
    });

    console.log('\ncalendar_events by source:');
    Object.entries(calendarSources).forEach(([source, count]) => {
      console.log(`  ${source}: ${count} events`);
    });

    const eventSources = {};
    events.forEach(e => {
      const source = e.calendar_source || 'unknown';
      eventSources[source] = (eventSources[source] || 0) + 1;
    });

    console.log('\nevents by calendar_source:');
    Object.entries(eventSources).forEach(([source, count]) => {
      console.log(`  ${source}: ${count} events`);
    });

    // 3. Check for title/summary overlap
    console.log('\n🔗 CONTENT OVERLAP ANALYSIS');
    console.log('-'.repeat(80));

    const calendarTitles = new Set(calendarEvents.map(e => e.summary?.toLowerCase().trim()));
    const eventTitles = new Set(events.map(e => e.title?.toLowerCase().trim()));

    let matchCount = 0;
    const matchedTitles = [];
    calendarEvents.forEach(e => {
      const title = e.summary?.toLowerCase().trim();
      if (title && eventTitles.has(title)) {
        matchCount++;
        if (matchedTitles.length < 5) {
          matchedTitles.push(e.summary);
        }
      }
    });

    console.log(`\nTitle matches: ${matchCount} out of ${calendarEvents.length} calendar_events`);
    console.log(`Match rate: ${Math.round(matchCount / calendarEvents.length * 100)}%`);

    if (matchedTitles.length > 0) {
      console.log('\nSample matching titles:');
      matchedTitles.forEach(title => console.log(`  - ${title}`));
    }

    // 4. Compare project associations
    console.log('\n📂 PROJECT ASSOCIATIONS');
    console.log('-'.repeat(80));

    const calendarWithProjects = calendarEvents.filter(e => e.project_id).length;
    const eventsWithProjects = events.filter(e => e.project_id).length;

    console.log(`\ncalendar_events with project_id: ${calendarWithProjects}/${calendarEvents.length} (${Math.round(calendarWithProjects/calendarEvents.length*100)}%)`);
    console.log(`events with project_id:          ${eventsWithProjects}/${events.length} (${Math.round(eventsWithProjects/events.length*100)}%)`);

    // 5. Identify unique characteristics
    console.log('\n🎯 KEY DIFFERENCES');
    console.log('-'.repeat(80));

    console.log('\ncalendar_events unique features:');
    console.log('  - Has enriched_attendees field');
    console.log('  - Has project_name, project_color, project_work_life_context');
    console.log('  - Has calendar_category field');
    console.log('  - Has ai_briefing field');
    console.log(`  - Uses complex start/end objects: ${JSON.stringify(calendarEvents[0]?.start)}`);

    console.log('\nevents unique features:');
    console.log('  - Has briefing and briefing_type fields');
    console.log('  - Has category field (different from calendar_category)');
    console.log('  - Uses simple timestamp fields for start_time/end_time');
    console.log('  - Attendees stored as JSON with enriched LinkedIn data');

    // 6. Check for recent vs historical data
    console.log('\n⏰ RECENCY ANALYSIS');
    console.log('-'.repeat(80));

    const now = new Date();
    const futureCalendar = calendarEvents.filter(e => {
      const date = e.start?.dateTime ? new Date(e.start.dateTime) :
                   e.start?.date ? new Date(e.start.date) : null;
      return date && date > now;
    }).length;

    const futureEvents = events.filter(e => {
      const date = e.start_time ? new Date(e.start_time) : null;
      return date && date > now;
    }).length;

    console.log(`\ncalendar_events:`);
    console.log(`  Future events:     ${futureCalendar}`);
    console.log(`  Past/current:      ${calendarEvents.length - futureCalendar}`);

    console.log(`\nevents:`);
    console.log(`  Future events:     ${futureEvents}`);
    console.log(`  Past/current:      ${events.length - futureEvents}`);

    // 7. Migration recommendation
    console.log('\n💡 MIGRATION RECOMMENDATION');
    console.log('-'.repeat(80));

    console.log('\nBased on the analysis:');

    if (matchCount / calendarEvents.length < 0.1) {
      console.log('\n✅ Tables contain DIFFERENT data sets');
      console.log('   → calendar_events appears to be current/future events');
      console.log('   → events appears to be historical + enriched events');
      console.log('   → RECOMMENDATION: Keep both tables but update routes');
    } else {
      console.log('\n⚠️  Tables have significant overlap');
      console.log('   → Some events exist in both tables');
      console.log('   → RECOMMENDATION: Consolidate and migrate missing events');
    }

    console.log('\nSuggested migration path:');
    console.log('1. Create migration script to copy calendar_events → events');
    console.log('2. Map fields correctly:');
    console.log('   - summary → title');
    console.log('   - start/end objects → start_time/end_time timestamps');
    console.log('   - external_id → keep as reference');
    console.log('   - source → calendar_source');
    console.log('3. Update backend/routes/calendar.js to query "events"');
    console.log('4. Test with both tables in parallel');
    console.log('5. Deprecate calendar_events once verified');

    console.log('\n='.repeat(80));
    console.log('✅ Analysis complete!\n');

  } catch (error) {
    console.error('❌ Error during analysis:', error);
  }
}

analyzeEventMigration();
