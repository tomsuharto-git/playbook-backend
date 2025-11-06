const logger = require('../../utils/logger');

/**
 * Debug script to check today's briefings in the database
 */

const { supabase } = require('./db/supabase-client');

async function debugTodaysBriefs() {
  // Get today's date in ET
  const now = new Date();
  const etFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York'
  });
  const todayET = etFormatter.format(now);

  logger.debug('\n🔍 Checking briefings for: \n', { todayET: todayET });

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
      logger.error('❌ No briefings found for today');
      return;
    }

    const events = data.calendar_events || [];
    logger.debug('📊 Total events:', { length: events.length });

    // Count events with "No Title"
    const noTitleEvents = events.filter(e => e.summary === 'No Title');
    logger.warn('\n⚠️  Events with "No Title":', { length: noTitleEvents.length });

    // Count events with actual titles
    const titledEvents = events.filter(e => e.summary && e.summary !== 'No Title');
    logger.info('✅ Events with titles:', { length: titledEvents.length });

    // Show all event titles
    logger.info('\n📋 All events:');
    events.forEach((event, i) => {
      const time = event.start?.dateTime || event.start?.date || 'No time';
      const title = event.summary || 'UNDEFINED';
      const source = event.calendar_category || 'Unknown';
      const id = event.id || 'No ID';
      logger.info('. []  - "" (ID: ...)', { i + 1: i + 1, source: source, time: time, title: title, substring(0, 20): id.substring(0, 20) });
    });

    // Show when this was last updated
    logger.info('\n🕐 Last updated:', { created_at || 'Unknown': data.updated_at || data.created_at || 'Unknown' });

    // Check for duplicate IDs
    const idMap = new Map();
    events.forEach(event => {
      const id = event.id;
      if (idMap.has(id)) {
        idMap.set(id, idMap.get(id) + 1);
      } else {
        idMap.set(id, 1);
      }
    });

    const duplicates = Array.from(idMap.entries()).filter(([id, count]) => count > 1);
    if (duplicates.length > 0) {
      logger.warn('\n⚠️  Duplicate event IDs found:', { length: duplicates.length });
      duplicates.forEach(([id, count]) => {
        logger.info(':  occurrences', { id: id, count: count });
      });
    }

  } catch (err) {
    logger.error('❌ Exception:', { arg0: err });
  }

  process.exit(0);
}

debugTodaysBriefs();
