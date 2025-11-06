const logger = require('../../utils/logger');

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkBriefings() {
  logger.debug('🔍 Checking briefing data for today vs tomorrow...\n');

  // Get both days
  const { data, error } = await supabase
    .from('daily_briefs')
    .select('date, calendar_events')
    .in('date', ['2025-10-13', '2025-10-14'])
    .order('date');

  if (error) {
    logger.error('Error:', { arg0: error });
    return;
  }

  for (const day of data) {
    logger.info('📅', { date: day.date });
    logger.info('Total events:', { length || 0: day.calendar_events?.length || 0 });

    if (day.calendar_events && day.calendar_events.length > 0) {
      const eventsWithBriefings = day.calendar_events.filter(e => e.ai_briefing);
      const workEvents = day.calendar_events.filter(e => e.calendar_category === 'Outlook');
      const lifeEvents = day.calendar_events.filter(e => e.calendar_category === 'Google');

      logger.info('Events with briefings:', { length: eventsWithBriefings.length });
      logger.info('Work events:', { length: workEvents.length });
      logger.info('Life events:', { length: lifeEvents.length });

      // Show first 3 events as examples
      logger.info('\n   Sample events:');
      for (let i = 0; i < Math.min(3, day.calendar_events.length); i++) {
        const event = day.calendar_events[i];
        logger.info('. ""', { i + 1: i + 1, subject: event.summary || event.subject });
        logger.info('- Category:', { calendar_category: event.calendar_category });
        logger.info('- Has briefing:', { ai_briefing ? 'YES' : 'NO': event.ai_briefing ? 'YES' : 'NO' });
        if (event.ai_briefing) {
          logger.info('- Briefing preview: ...', { substring(0, 80): event.ai_briefing.substring(0, 80) });
        }
      }
    }
    logger.info('');
  }
}

checkBriefings().then(() => process.exit(0));
