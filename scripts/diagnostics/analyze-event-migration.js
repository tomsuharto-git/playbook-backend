// Detailed analysis for migrating calendar_events to events (Phase 2)
const logger = require('../../utils/logger');

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function analyzeEventMigration() {
  logger.info('\n🔬 DETAILED MIGRATION ANALYSIS\n');
  logger.info('='.repeat(80));

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

    logger.debug('\n📊 DATA SUMMARY');
    logger.info('-'.repeat(80));
    logger.info('calendar_events:  records', { length || 0: calendarEvents?.length || 0 });
    logger.info('events:           records', { length || 0: events?.length || 0 });

    if (!calendarEvents || !events) {
      logger.error('❌ Could not fetch data from one or both tables');
      return;
    }

    // 1. Analyze time distribution
    logger.info('\n📅 TIME DISTRIBUTION');
    logger.info('-'.repeat(80));

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
      logger.info('\ncalendar_events event date range:');
      logger.info('Earliest:', { split('T')[0]: calMin.toISOString().split('T')[0] });
      logger.info('Latest:', { split('T')[0]: calMax.toISOString().split('T')[0] });
    }

    if (eventDates.length > 0) {
      const evMin = new Date(Math.min(...eventDates));
      const evMax = new Date(Math.max(...eventDates));
      logger.info('\nevents event date range:');
      logger.info('Earliest:', { split('T')[0]: evMin.toISOString().split('T')[0] });
      logger.info('Latest:', { split('T')[0]: evMax.toISOString().split('T')[0] });
    }

    // 2. Analyze sources/categories
    logger.debug('\n🔍 DATA SOURCES');
    logger.info('-'.repeat(80));

    const calendarSources = {};
    calendarEvents.forEach(e => {
      const source = e.source || 'unknown';
      calendarSources[source] = (calendarSources[source] || 0) + 1;
    });

    logger.info('\ncalendar_events by source:');
    Object.entries(calendarSources).forEach(([source, count]) => {
      logger.info(':  events', { source: source, count: count });
    });

    const eventSources = {};
    events.forEach(e => {
      const source = e.calendar_source || 'unknown';
      eventSources[source] = (eventSources[source] || 0) + 1;
    });

    logger.info('\nevents by calendar_source:');
    Object.entries(eventSources).forEach(([source, count]) => {
      logger.info(':  events', { source: source, count: count });
    });

    // 3. Check for title/summary overlap
    logger.info('\n🔗 CONTENT OVERLAP ANALYSIS');
    logger.info('-'.repeat(80));

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

    logger.info('\nTitle matches:  out of  calendar_events', { matchCount: matchCount, length: calendarEvents.length });
    logger.info('Match rate: %', { length * 100): Math.round(matchCount / calendarEvents.length * 100) });

    if (matchedTitles.length > 0) {
      logger.info('\nSample matching titles:');
      matchedTitles.forEach(title => logger.info('-', { title: title });
    }

    // 4. Compare project associations
    logger.info('\n📂 PROJECT ASSOCIATIONS');
    logger.info('-'.repeat(80));

    const calendarWithProjects = calendarEvents.filter(e => e.project_id).length;
    const eventsWithProjects = events.filter(e => e.project_id).length;

    logger.info('\ncalendar_events with project_id: / (%)', { calendarWithProjects: calendarWithProjects, length: calendarEvents.length, length*100): Math.round(calendarWithProjects/calendarEvents.length*100) });
    logger.info('events with project_id:          / (%)', { eventsWithProjects: eventsWithProjects, length: events.length, length*100): Math.round(eventsWithProjects/events.length*100) });

    // 5. Identify unique characteristics
    logger.info('\n🎯 KEY DIFFERENCES');
    logger.info('-'.repeat(80));

    logger.info('\ncalendar_events unique features:');
    logger.info('  - Has enriched_attendees field');
    logger.info('  - Has project_name, project_color, project_work_life_context');
    logger.info('  - Has calendar_category field');
    logger.info('  - Has ai_briefing field');
    logger.info('- Uses complex start/end objects:', { start): JSON.stringify(calendarEvents[0]?.start) });

    logger.info('\nevents unique features:');
    logger.info('  - Has briefing and briefing_type fields');
    logger.info('  - Has category field (different from calendar_category)');
    logger.info('  - Uses simple timestamp fields for start_time/end_time');
    logger.info('  - Attendees stored as JSON with enriched LinkedIn data');

    // 6. Check for recent vs historical data
    logger.info('\n⏰ RECENCY ANALYSIS');
    logger.info('-'.repeat(80));

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

    logger.info('\ncalendar_events:');
    logger.info('Future events:', { futureCalendar: futureCalendar });
    logger.info('Past/current:', { length - futureCalendar: calendarEvents.length - futureCalendar });

    logger.info('\nevents:');
    logger.info('Future events:', { futureEvents: futureEvents });
    logger.info('Past/current:', { length - futureEvents: events.length - futureEvents });

    // 7. Migration recommendation
    logger.info('\n💡 MIGRATION RECOMMENDATION');
    logger.info('-'.repeat(80));

    logger.info('\nBased on the analysis:');

    if (matchCount / calendarEvents.length < 0.1) {
      logger.info('\n✅ Tables contain DIFFERENT data sets');
      logger.info('   → calendar_events appears to be current/future events');
      logger.info('   → events appears to be historical + enriched events');
      logger.info('   → RECOMMENDATION: Keep both tables but update routes');
    } else {
      logger.warn('\n⚠️  Tables have significant overlap');
      logger.info('   → Some events exist in both tables');
      logger.info('   → RECOMMENDATION: Consolidate and migrate missing events');
    }

    logger.info('\nSuggested migration path:');
    logger.info('1. Create migration script to copy calendar_events → events');
    logger.info('2. Map fields correctly:');
    logger.info('   - summary → title');
    logger.info('   - start/end objects → start_time/end_time timestamps');
    logger.info('   - external_id → keep as reference');
    logger.info('   - source → calendar_source');
    logger.info('3. Update backend/routes/calendar.js to query "events"');
    logger.info('4. Test with both tables in parallel');
    logger.info('5. Deprecate calendar_events once verified');

    logger.info('\n='.repeat(80));
    logger.info('✅ Analysis complete!\n');

  } catch (error) {
    logger.error('❌ Error during analysis:', { arg0: error });
  }
}

analyzeEventMigration();
