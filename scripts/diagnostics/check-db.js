const logger = require('../../utils/logger');

require('dotenv').config();
const { supabase } = require('./db/supabase-client');

async function check() {
  const { data, error } = await supabase
    .from('daily_briefs')
    .select('date, calendar_events')
    .in('date', ['2025-10-12', '2025-10-13'])
    .order('date');

  if (error) {
    logger.error('Error:', { arg0: error });
    return;
  }

  data.forEach(row => {
    const outlook = row.calendar_events.filter(e => e.calendar_category === 'Outlook');
    const gmail = row.calendar_events.filter(e => e.calendar_category !== 'Outlook');
    logger.info(':  total ( Outlook +  Gmail)', { date: row.date, length: row.calendar_events.length, length: outlook.length, length: gmail.length });

    if (outlook.length > 0) {
      logger.info('  Outlook events:');
      outlook.slice(0, 5).forEach(e => logger.info('-', { summary: e.summary });
    }
  });
}

check();
