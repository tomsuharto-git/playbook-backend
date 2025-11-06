const logger = require('../../utils/logger');

const { supabase } = require('./db/supabase-client');

(async () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  logger.info('Checking briefings for:', { arg0: today });

  const { data, error } = await supabase
    .from('daily_briefs')
    .select('calendar_events')
    .eq('date', today)
    .single();

  if (error || !data) {
    logger.info('No briefings found for today');
    process.exit(0);
  }

  const eventsWithBriefings = data.calendar_events.filter(e => e.ai_briefing);
  logger.info('\nFound  events WITH briefings:\n', { length: eventsWithBriefings.length });

  eventsWithBriefings.forEach(e => {
    logger.info('📅', { summary: e.summary });
    logger.info('Project:', { project_name || 'None': e.project_name || 'None' });
    logger.info('Calendar:', { calendar_category: e.calendar_category });
    logger.info('Attendees:', { length || 0: e.attendees?.length || 0 });
    logger.info('Briefing:\n   \n', { ai_briefing: e.ai_briefing });
  });

  const eventsWithoutBriefings = data.calendar_events.filter(e => !e.ai_briefing);
  logger.info('\n\nFound  events WITHOUT briefings:\n', { length: eventsWithoutBriefings.length });

  eventsWithoutBriefings.forEach(e => {
    logger.info('📅', { summary: e.summary });
    logger.info('Project:', { project_name || 'None': e.project_name || 'None' });
    logger.info('Calendar:', { calendar_category: e.calendar_category });
    logger.info('Attendees: \n', { length || 0: e.attendees?.length || 0 });
  });

  process.exit(0);
})();
