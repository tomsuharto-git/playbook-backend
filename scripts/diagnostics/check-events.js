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
      logger.info('\n:  events', { date: day.date, length: day.calendar_events.length });
      const googleCount = day.calendar_events.filter(e => e.calendar_category !== 'Outlook').length;
      const outlookCount = day.calendar_events.filter(e => e.calendar_category === 'Outlook').length;
      logger.info('Google: , Outlook:', { googleCount: googleCount, outlookCount: outlookCount });

      // Sample first 10 Outlook events
      logger.info('\n  First 10 Outlook events:');
      day.calendar_events
        .filter(e => e.calendar_category === 'Outlook')
        .slice(0, 10)
        .forEach((e, i) => {
          logger.info('.', { i+1: i+1, summary || '(NO SUMMARY FIELD)': e.summary || '(NO SUMMARY FIELD)' });
          if (!e.summary && e.subject) logger.info('subject field:', { subject: e.subject });
          if (!e.summary) {
            const keys = Object.keys(e).slice(0, 10);
            logger.info('available fields:', { join(', '): keys.join(', ') });
          }
        });
    });
  }
  process.exit(0);
})();
