/**
 * Debug script to examine raw database structure
 */

const { supabase } = require('./db/supabase-client');
const fs = require('fs');
const logger = require('../../utils/logger');

async function debugRawDb() {
  const now = new Date();
  const etFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York'
  });
  const todayET = etFormatter.format(now);

  logger.debug('\n🔍 Fetching raw database record for \n', { todayET: todayET });

  try {
    const { data, error } = await supabase
      .from('daily_briefs')
      .select('*')
      .eq('date', todayET)
      .single();

    if (error) {
      logger.error('❌ Error:', { arg0: error });
      return;
    }

    if (!data) {
      logger.error('❌ No record found');
      return;
    }

    // Save full record to file
    fs.writeFileSync('./temp-db-record.json', JSON.stringify(data, null, 2));
    logger.info('💾 Saved full record to temp-db-record.json\n');

    logger.debug('📊 Record metadata:');
    logger.info('- date:', { date: data.date });
    logger.info('- created_at:', { created_at: data.created_at });
    logger.info('- updated_at:', { updated_at: data.updated_at });
    logger.info('- calendar_events type:', { calendar_events: typeof data.calendar_events });
    logger.info('- calendar_events is array:', { calendar_events): Array.isArray(data.calendar_events) });
    logger.info('- calendar_events length:', { length || 0: data.calendar_events?.length || 0 });

    if (data.calendar_events && data.calendar_events.length > 0) {
      logger.info('\n📋 First event raw:');
      const firstEvent = data.calendar_events[0];
      logger.info(JSON.stringify(firstEvent, { arg0: null });

      logger.info('\n📋 First event keys:');
      logger.info('- Has 'summary':', { hasOwnProperty('summary'): firstEvent.hasOwnProperty('summary') });
      logger.info('- summary value:', { summary: firstEvent.summary });
      logger.info('- Has 'start':', { hasOwnProperty('start'): firstEvent.hasOwnProperty('start') });
      logger.info('- start value:');

      // Check if events have wrong structure
      if (!firstEvent.hasOwnProperty('summary')) {
        logger.warn('\n⚠️  Events missing "summary" field!');
        logger.info('    This suggests data structure corruption.');
      }

      // Look for alternative field names
      logger.debug('\n🔍 Checking for alternative field names:');
      ['subject', 'title', 'name'].forEach(field => {
        if (firstEvent.hasOwnProperty(field)) {
          logger.info('✅ Found "":', { field: field, firstEvent[field]: firstEvent[field] });
        }
      });
    }

  } catch (err) {
    logger.error('❌ Exception:', { arg0: err });
  }

  process.exit(0);
}

debugRawDb();
