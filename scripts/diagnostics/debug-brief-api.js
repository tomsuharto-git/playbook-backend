const logger = require('../../utils/logger');

/**
 * Debug Brief API Issue
 * Find out why events aren't being returned
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function debugBriefData() {
  logger.debug('🔍 Debugging Brief API Issue\n');

  // Get today and tomorrow
  const dates = ['2025-11-02', '2025-11-03'];

  for (const date of dates) {
    logger.info('='.repeat(60));
    logger.info('📅 Date:', { date: date });
    logger.info('='.repeat(60));

    // Get daily_brief for this date
    const { data: brief, error } = await supabase
      .from('daily_briefs')
      .select('*')
      .eq('date', date)
      .single();

    if (error) {
      logger.error('❌ Error fetching brief:', { arg0: error.message });
      continue;
    }

    logger.info('\n1. daily_briefs record:');
    logger.info('event_ids:', { event_ids): JSON.stringify(brief.event_ids) });
    logger.info('event_ids length:', { length || 0: brief.event_ids?.length || 0 });
    logger.info('calendar_events (JSONB) length:', { length || 0: brief.calendar_events?.length || 0 });

    if (brief.event_ids && brief.event_ids.length > 0) {
      logger.info('\n2. Checking if events exist with these IDs:');
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('id, title, calendar_id, start_time')
        .in('id', brief.event_ids);

      if (eventsError) {
        logger.error('❌ Error:', { message: eventsError.message });
      } else {
        logger.info('✅ Found  events in events table', { length || 0: events?.length || 0 });
        events?.forEach(e => {
          logger.info('-  (id: )', { title: e.title, id: e.id });
        });
      }

      if (!events || events.length === 0) {
        logger.error('\n   ❌ ISSUE FOUND: event_ids exist in daily_briefs but no matching events!');
        logger.info('   💡 This is why the brief page shows no events');
        logger.info('\n   🔧 SOLUTION: Use calendar_events JSONB fallback');
      }
    }

    if (brief.calendar_events && brief.calendar_events.length > 0) {
      logger.info('\n3. ✅ Fallback available: calendar_events JSONB has', { arg0: brief.calendar_events.length });
      brief.calendar_events.forEach((e, i) => {
        logger.info('.', { i+1: i+1, title || 'No title': e.summary || e.title || 'No title' });
      });
    }

    logger.info('\n');
  }

  logger.info('='.repeat(60));
  logger.debug('📊 SUMMARY');
  logger.info('='.repeat(60));
  logger.info('The issue: event_ids in daily_briefs don\'t match events in events table');
  logger.info('The fix: Modify calendar.js route to use calendar_events JSONB as primary source');
  logger.info('='.repeat(60));
}

debugBriefData().catch(err => {
  logger.error('\n❌ Script error:', { arg0: err });
  process.exit(1);
});
