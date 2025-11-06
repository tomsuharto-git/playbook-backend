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

  logger.info('Analyzing Gmail events on Oct 13:\n');

  // Check multi-day events
  const multiDay = gmailEvents.filter(e => {
    if (!e.start?.date || e.start?.dateTime) return false;
    const start = e.start.date;
    const end = e.end?.date;
    return start !== end;
  });

  logger.info('Multi-day all-day events:');
  multiDay.forEach(e => {
    logger.info('-', { summary: e.summary });
    logger.info('Start:', { date: e.start.date });
    logger.info('End:', { date: e.end.date });
  });

  // Check late-night events
  const lateNight = gmailEvents.filter(e => {
    const time = e.start?.dateTime;
    if (!time) return false;
    const date = new Date(time);
    const etFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
    const etDate = etFormatter.format(date);
    return etDate !== '2025-10-13';
  });

  logger.info('\nEvents with wrong date (timezone issue):');
  lateNight.forEach(e => {
    const time = e.start?.dateTime;
    const date = new Date(time);
    const etFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
    const etDate = etFormatter.format(date);
    logger.info('-', { summary: e.summary });
    logger.info('Stored time:', { time: time });
    logger.info('Actual ET date:', { etDate: etDate });
  });

  // Check duplicates
  const outlookEvents = data.calendar_events.filter(e => e.calendar_category === 'Outlook');
  const duplicates = gmailEvents.filter(gmail =>
    outlookEvents.some(outlook =>
      (gmail.summary || '').toLowerCase().trim() === (outlook.summary || '').toLowerCase().trim()
    )
  );

  logger.info('\nDuplicates (exist in both Gmail and Outlook):');
  duplicates.forEach(e => logger.info('-', { summary: e.summary });

  logger.info('\nSummary:');
  logger.info('Total Gmail events:', { length: gmailEvents.length });
  logger.info('Multi-day spanning:', { length: multiDay.length });
  logger.info('Wrong date (late-night):', { length: lateNight.length });
  logger.info('Duplicates:', { length: duplicates.length });
  logger.info('Correct unique events:', { length: gmailEvents.length - lateNight.length - duplicates.length });
}

check();
