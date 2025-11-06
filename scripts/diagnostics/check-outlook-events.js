const logger = require('../../utils/logger');

const { supabase } = require('./db/supabase-client');

(async () => {
  const { data, error } = await supabase
    .from('daily_briefs')
    .select('date, calendar_events')
    .in('date', ['2025-10-12', '2025-10-13']);

  if (error) {
    logger.error('Error:', { arg0: error });
  } else {
    data.forEach(day => {
      const outlookEvents = day.calendar_events.filter(e => e.calendar_category === 'Outlook');

      logger.info('\n', { repeat(60): '='.repeat(60) });
      logger.info(':  Outlook events', { date: day.date, length: outlookEvents.length });
      logger.info('='.repeat(60));

      outlookEvents.forEach((e, i) => {
        const title = e.subject || e.summary || '(NO TITLE)';
        const startTime = e.start?.dateTime || e.start?.date || 'No time';
        const endTime = e.end?.dateTime || e.end?.date || 'No time';

        logger.info('\n.', { i+1: i+1, title: title });
        logger.info('Start:', { startTime: startTime });
        logger.info('End:', { endTime: endTime });
        logger.info('ID:', { id: e.id });
      });
    });
  }
  process.exit(0);
})();
