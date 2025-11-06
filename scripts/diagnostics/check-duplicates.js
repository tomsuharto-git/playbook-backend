const logger = require('../../utils/logger');

require('dotenv').config();
const { supabase } = require('./db/supabase-client');

async function check() {
  const { data } = await supabase
    .from('daily_briefs')
    .select('calendar_events')
    .eq('date', '2025-10-13')
    .single();

  const gmailEvents = data.calendar_events.filter(e => e.calendar_category !== 'Outlook');
  const outlookEvents = data.calendar_events.filter(e => e.calendar_category === 'Outlook');

  logger.error('Checking why deduplication failed:\n');

  // Check one duplicate pair
  const gmailBaileys = gmailEvents.find(e => e.summary?.includes('Baileys'));
  const outlookBaileys = outlookEvents.find(e => e.summary?.includes('Baileys'));

  if (gmailBaileys && outlookBaileys) {
    logger.info('Gmail Baileys event:');
    logger.info('summary: ""', { summary: gmailBaileys.summary });
    logger.info('start.dateTime:', { dateTime: gmailBaileys.start?.dateTime });
    logger.info('start.date:', { date: gmailBaileys.start?.date });

    logger.info('\nOutlook Baileys event:');
    logger.info('summary: ""', { summary: outlookBaileys.summary });
    logger.info('start.dateTime:', { dateTime: outlookBaileys.start?.dateTime });
    logger.info('start.date:', { date: outlookBaileys.start?.date });

    const gmailKey = `${(gmailBaileys.summary || '').toLowerCase().trim()}|${gmailBaileys.start?.dateTime || gmailBaileys.start?.date || ''}`;
    const outlookKey = `${(outlookBaileys.summary || '').toLowerCase().trim()}|${outlookBaileys.start?.dateTime || outlookBaileys.start?.date || ''}`;

    logger.info('\nDeduplication keys:');
    logger.info('Gmail:   ""', { gmailKey: gmailKey });
    logger.info('Outlook: ""', { outlookKey: outlookKey });
    logger.info('Match:', { gmailKey === outlookKey: gmailKey === outlookKey });
  }
}

check();
