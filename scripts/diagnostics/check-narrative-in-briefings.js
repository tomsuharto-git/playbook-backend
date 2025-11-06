const logger = require('../../utils/logger');

require('dotenv').config();
const { supabase } = require('./db/supabase-client');

async function checkBriefing() {
  logger.debug('🔍 Checking if briefings include narrative context...\n');

  // Get today's briefings
  const { data, error } = await supabase
    .from('daily_briefs')
    .select('calendar_events')
    .eq('date', '2025-10-13')
    .single();

  if (error || !data) {
    logger.error('No briefings found:');
    return;
  }

  // Find events with projects that have narratives
  const eventsWithProjects = data.calendar_events.filter(e =>
    ['Baileys', 'ITA Airlines', 'Therabody', '72andSunny', 'Nuveen', 'TIAA'].includes(e.project_name)
  );

  logger.info('Found  events with narrative-rich projects\n', { length: eventsWithProjects.length });

  eventsWithProjects.forEach(event => {
    logger.info('📅', { summary: event.summary });
    logger.info('Project:', { project_name: event.project_name });
    logger.info('Has briefing:', { ai_briefing ? 'YES' : 'NO': event.ai_briefing ? 'YES' : 'NO' });
    if (event.ai_briefing) {
      const briefingPreview = event.ai_briefing.substring(0, 600);
      logger.info('Briefing preview:\n...\n', { briefingPreview: briefingPreview });
    }
  });
}

checkBriefing().then(() => process.exit(0));
