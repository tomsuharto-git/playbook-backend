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

  const eventsWithProjects = data.calendar_events.filter(e => e.project_name);
  logger.info('\nFound  events with projects:\n', { length: eventsWithProjects.length });

  eventsWithProjects.slice(0, 3).forEach(e => {
    logger.info('📅', { summary: e.summary });
    logger.info('Project:', { project_name: e.project_name });
    logger.info('Has briefing:', { ai_briefing ? 'YES' : 'NO': e.ai_briefing ? 'YES' : 'NO' });
    if (e.ai_briefing) {
      logger.info('Briefing preview:\n   \n', { substring(0, 400): e.ai_briefing.substring(0, 400) });
    }
  });

  process.exit(0);
})();
