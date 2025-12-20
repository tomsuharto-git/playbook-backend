const logger = require('../../utils/logger');
require('dotenv').config();
const { supabase } = require('../../db/supabase-client');

async function checkBriefing() {
  logger.debug('🔍 Checking if briefings include narrative context...\n');

  // Get recent briefings
  const { data, error } = await supabase
    .from('daily_briefs')
    .select('calendar_events, date')
    .order('date', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    logger.error('No briefings found:', { error: error?.message });
    return;
  }

  logger.info(`Checking briefing from: ${data.date}\n`);

  // Find events with projects that have narratives
  const eventsWithProjects = data.calendar_events.filter(e =>
    ['Baileys', 'ITA Airlines', 'Therabody', '72andSunny', 'Nuveen', 'TIAA'].includes(e.project_name)
  );

  logger.info(`Found ${eventsWithProjects.length} events with narrative-rich projects\n`);

  eventsWithProjects.forEach(event => {
    logger.info(`📅 ${event.summary}`);
    logger.info(`   Project: ${event.project_name}`);
    logger.info(`   Has briefing: ${event.ai_briefing ? 'YES' : 'NO'}`);
    if (event.ai_briefing) {
      const briefingPreview = event.ai_briefing.substring(0, 600);
      logger.info(`   Briefing preview:\n${briefingPreview}...\n`);
    }
  });
}

checkBriefing().then(() => process.exit(0));
