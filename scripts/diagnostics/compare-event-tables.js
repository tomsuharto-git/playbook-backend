// Compare calendar_events (old) vs events (Phase 2) tables
const logger = require('../../utils/logger');

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function compareEventTables() {
  logger.debug('\n🔍 Comparing calendar_events vs events tables\n');
  logger.info('='.repeat(80));

  try {
    // 1. Get record counts
    logger.debug('\n📊 RECORD COUNTS');
    logger.info('-'.repeat(80));

    const { count: calendarCount } = await supabase
      .from('calendar_events')
      .select('*', { count: 'exact', head: true });

    const { count: eventsCount } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true });

    logger.info('calendar_events:  records', { calendarCount: calendarCount });
    logger.info('events:           records', { eventsCount: eventsCount });
    logger.info('Difference:       records (%)', { calendarCount - eventsCount: calendarCount - eventsCount, round((calendarCount - eventsCount) / calendarCount * 100): Math.round((calendarCount - eventsCount) / calendarCount * 100) });

    // 2. Sample records from calendar_events
    logger.info('\n📋 SAMPLE: calendar_events (first 3 records)');
    logger.info('-'.repeat(80));

    const { data: calendarSample } = await supabase
      .from('calendar_events')
      .select('*')
      .limit(3);

    if (calendarSample && calendarSample.length > 0) {
      logger.info('\nColumns in calendar_events:');
      logger.info(Object.keys(calendarSample[0]).join(', '));
      logger.info('\nSample record:');
      logger.info(JSON.stringify(calendarSample[0], { arg0: null });
    }

    // 3. Sample records from events
    logger.info('\n📋 SAMPLE: events (first 3 records)');
    logger.info('-'.repeat(80));

    const { data: eventsSample } = await supabase
      .from('events')
      .select('*')
      .limit(3);

    if (eventsSample && eventsSample.length > 0) {
      logger.info('\nColumns in events:');
      logger.info(Object.keys(eventsSample[0]).join(', '));
      logger.info('\nSample record:');
      logger.info(JSON.stringify(eventsSample[0], { arg0: null });
    }

    // 4. Check for external_id overlap
    logger.info('\n🔗 EXTERNAL ID OVERLAP ANALYSIS');
    logger.info('-'.repeat(80));

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

      logger.info('\nEvents in calendar_events:  unique external_ids', { size: calendarExternalIds.size });
      logger.info('Events in events:           unique external_event_ids', { size: eventsExternalIds.size });
      logger.info('\nOnly in calendar_events:    events', { length: onlyInCalendar.length });
      logger.info('Only in events:             events', { length: onlyInEvents.length });

      if (onlyInCalendar.length > 0) {
        logger.info('\n📌 Sample events ONLY in calendar_events (first 5):');
        onlyInCalendar.slice(0, 5).forEach((e, i) => {
          logger.info('.  ()', { i + 1: i + 1, summary: e.summary, start: e.start?.dateTime || e.start });
        });
      }

      if (onlyInEvents.length > 0) {
        logger.info('\n📌 Sample events ONLY in events (first 5):');
        onlyInEvents.slice(0, 5).forEach((e, i) => {
          logger.info('.  ()', { i + 1: i + 1, title: e.title, start_time: e.start_time });
        });
      }
    }

    // 5. Date range comparison
    logger.info('\n📅 DATE RANGE COMPARISON');
    logger.info('-'.repeat(80));

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
      logger.info('\ncalendar_events:');
      logger.info('First event:', { start: firstCalendar.start?.dateTime || firstCalendar.start });
      logger.info('Last event:', { start: lastCalendar.start?.dateTime || lastCalendar.start });
      logger.info('First created:', { created_at: calendarDates[0].created_at });
    }

    if (eventsDates && eventsDates.length > 0) {
      logger.info('\nevents:');
      logger.info('First event:', { start_time: eventsDates[0].start_time });
      logger.info('Last event:', { start_time: eventsDates[eventsDates.length - 1].start_time });
      logger.info('First created:', { created_at: eventsDates[0].created_at });
    }

    // 6. Schema differences summary
    logger.info('\n📐 SCHEMA DIFFERENCES SUMMARY');
    logger.info('-'.repeat(80));

    if (calendarSample && calendarSample.length > 0 && eventsSample && eventsSample.length > 0) {
      const calendarCols = Object.keys(calendarSample[0]);
      const eventsCols = Object.keys(eventsSample[0]);

      logger.info('\nColumns only in calendar_events:');
      const onlyInCalendarCols = calendarCols.filter(col => !eventsCols.includes(col));
      onlyInCalendarCols.forEach(col => logger.info('-', { col: col });

      logger.info('\nColumns only in events:');
      const onlyInEventsCols = eventsCols.filter(col => !calendarCols.includes(col));
      onlyInEventsCols.forEach(col => logger.info('-', { col: col });

      logger.info('\nCommon concept columns (may have different names):');
      logger.info('  calendar_events     →     events');
      logger.info('  ---------------           ------');
      logger.info('  external_id         →     external_event_id');
      logger.info('  summary             →     title');
      logger.info('  start               →     start_time');
      logger.info('  end                 →     end_time');
    }

    // 7. Recommendations
    logger.info('\n💡 MIGRATION RECOMMENDATIONS');
    logger.info('-'.repeat(80));
    logger.info('\nBased on the analysis above:');
    logger.info('1. Check if the missing events are historical or future');
    logger.info('2. Determine if calendar_events has data that needs to be preserved');
    logger.info('3. Update backend/routes/calendar.js to query from "events" instead');
    logger.info('4. Consider migrating missing events if they\'re important');
    logger.info('5. Once migration is verified, calendar_events can be deprecated');

    logger.info('\n='.repeat(80));
    logger.info('✅ Comparison complete!\n');

  } catch (error) {
    logger.error('❌ Error comparing tables:', { arg0: error });
  }
}

compareEventTables();
