const logger = require('../../utils/logger');

require('dotenv').config();
const { supabase } = require('./db/supabase-client');

(async () => {
  logger.info('Checking ITA Airlines project narrative logs...\n');

  // Find ITA project
  const { data: projects, error: projError } = await supabase
    .from('projects')
    .select('id, name, status, narrative, created_at')
    .ilike('name', '%ITA%')
    .order('created_at', { ascending: false });

  if (projError) {
    logger.error('Error:', { arg0: projError });
    return;
  }

  if (!projects || projects.length === 0) {
    logger.error('❌ No ITA Airlines project found in database');
    return;
  }

  const project = projects[0];
  logger.info('=== ITA AIRLINES PROJECT ===');
  logger.info('ID:', { arg0: project.id });
  logger.info('Name:', { arg0: project.name });
  logger.info('Status:');
  logger.info('Created:', { arg0: project.created_at });
  logger.info();

  if (project.narrative && Array.isArray(project.narrative)) {
    logger.info('=== NARRATIVE LOGS IN DATABASE ===');
    logger.info('Total entries:', { length: project.narrative.length });
    logger.info();

    const last5 = project.narrative.slice(0, 5);
    last5.forEach((entry, idx) => {
      logger.info('--- Narrative Log  ---', { idx + 1: idx + 1 });
      logger.info('Date:', { date || 'No date': entry.date || 'No date' });
      logger.info('Source:', { source || 'unknown': entry.source || 'unknown' });
      logger.info('Headline:', { headline || 'No headline': entry.headline || 'No headline' });
      if (entry.bullets && entry.bullets.length > 0) {
        logger.info('Bullets:');
        entry.bullets.forEach(bullet => logger.info('•', { bullet: bullet });
      }
      logger.info();
    });

    logger.info('These are the exact narrative logs that would be included in your briefing context.');
  } else {
    logger.warn('⚠️  NO NARRATIVE LOGS IN DATABASE');
    logger.info('The narrative field is empty or null.');
    logger.info('This means NO narrative context was provided to the AI when generating your briefing.');
  }
})();
