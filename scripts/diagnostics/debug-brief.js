const logger = require('../../utils/logger');

const { supabase } = require('./db/supabase-client');

(async () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  logger.info('Checking Brief for:', { arg0: today });

  const { data, error } = await supabase
    .from('daily_briefs')
    .select('*')
    .eq('date', today)
    .single();

  if (error) {
    logger.error('Error:', { arg0: error.message });
    process.exit(1);
  }

  if (!data) {
    logger.info('No brief found for today');
    process.exit(0);
  }

  const events = data.calendar_events || [];
  logger.info('\nTotal events:', { arg0: events.length });

  logger.info('\n=== ALL EVENTS ===');
  events.forEach((e, i) => {
    logger.info('. "" -', { i+1: i+1, summary: e.summary, date || 'NO TIME': e.start?.dateTime || e.start?.date || 'NO TIME' });
    logger.info('Category:', { calendar_category || 'unknown': e.calendar_category || 'unknown' });
    logger.info('Attendees:', { length || 0: e.attendees?.length || 0 });
  });

  const invalidEvents = events.filter(e => {
    const title = e.summary || '';
    return !title || title.trim() === '' || title === 'No Title' || !e.start?.dateTime && !e.start?.date;
  });

  logger.info('\n=== INVALID EVENTS ===');
  logger.info('Found:', { arg0: invalidEvents.length });
  invalidEvents.forEach(e => {
    logger.info('  - Title:');
    logger.info('    Time:');
  });

  process.exit(0);
})();
