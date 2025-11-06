const logger = require('../utils/logger');

const { supabase } = require('./db/supabase-client');

(async () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  logger.info('==========================================');
  logger.info('   FORENSIC ANALYSIS - BRIEF PAGE BUG');
  logger.info('==========================================\n');
  logger.info('Date being checked:', { arg0: today });
  logger.info('Current ET time:');

  // 1. Check database state
  logger.info('\n--- DATABASE CHECK ---');
  const { data, error } = await supabase
    .from('daily_briefs')
    .select('*')
    .eq('date', today)
    .single();

  if (error) {
    logger.error('ERROR fetching from database:', { arg0: error.message });
    process.exit(1);
  }

  if (!data) {
    logger.info('NO DATA found in database for today');
    process.exit(0);
  }

  logger.info('Database record last updated:', { arg0: data.updated_at });
  logger.info('Total events in database:');

  const events = data.calendar_events || [];

  // 2. Analyze each event
  logger.info('\n--- EVENT ANALYSIS ---');
  let validCount = 0;
  let invalidCount = 0;

  events.forEach((e, i) => {
    const summary = e.summary || e.subject || null;
    const startTime = e.start?.dateTime || e.start?.date || null;
    const isValid = summary && startTime;

    if (isValid) {
      validCount++;
    } else {
      invalidCount++;
      logger.info('\nINVALID EVENT #:', { i+1: i+1 });
      logger.info('Summary:', { summary || 'MISSING': summary || 'MISSING' });
      logger.info('Start:', { startTime || 'MISSING': startTime || 'MISSING' });
      logger.info('Category:', { calendar_category || 'unknown': e.calendar_category || 'unknown' });
      logger.info('Raw keys:', { join(', '): Object.keys(e).join(', ') });
    }
  });

  logger.info('\nSummary:  valid,  invalid', { validCount: validCount, invalidCount: invalidCount });

  // 3. Check what frontend would receive
  logger.info('\n--- FRONTEND API CHECK ---');
  logger.info('Testing: GET /api/calendar/briefings endpoint...');

  const axios = require('axios');
  try {
    const response = await axios.get('http://localhost:3001/api/calendar/briefings', {
      params: { days: 2 }
    });

    const todayBrief = response.data.find(b => b.date === today);
    if (todayBrief) {
      logger.info('API returned  events for today', { length || 0: todayBrief.events?.length || 0 });

      const apiInvalid = todayBrief.events?.filter(e => !e.summary || !e.start?.dateTime && !e.start?.date) || [];
      if (apiInvalid.length > 0) {
        logger.info('WARNING: API is serving  invalid events!', { length: apiInvalid.length });
        apiInvalid.forEach((e, i) => {
          logger.info('Invalid #:  -', { i+1: i+1, summary || 'NO SUMMARY': e.summary || 'NO SUMMARY', date || 'NO TIME': e.start?.dateTime || e.start?.date || 'NO TIME' });
        });
      } else {
        logger.info('✓ API events appear valid');
      }
    } else {
      logger.info('WARNING: API did not return data for today');
    }
  } catch (err) {
    logger.info('ERROR calling API:', { arg0: err.message });
  }

  // 4. Check for concurrent writes
  logger.info('\n--- CONCURRENT WRITE CHECK ---');
  const { data: allBriefs } = await supabase
    .from('daily_briefs')
    .select('date, updated_at')
    .order('updated_at', { ascending: false })
    .limit(5);

  logger.info('Recent database updates:');
  allBriefs?.forEach(b => {
    logger.info(':', { date: b.date, updated_at: b.updated_at });
  });

  logger.info('\n==========================================');
  logger.info('   END FORENSIC ANALYSIS');
  logger.info('==========================================\n');

  process.exit(0);
})();
