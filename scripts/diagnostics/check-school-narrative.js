const logger = require('../../utils/logger');

require('dotenv').config();
const { supabase } = require('./db/supabase-client');

async function checkSchoolNarrative() {
  logger.debug('🔍 Checking School project narrative logs...\n');

  const { data: project, error } = await supabase
    .from('projects')
    .select('id, name, narrative, objectives')
    .ilike('name', '%school%')
    .single();

  if (error || !project) {
    logger.error('❌ No School project found:');
    return;
  }

  logger.info('📁 Project:', { arg0: project.name });
  logger.debug('📊 Narrative entries:');
  logger.debug('📊 Objectives:');

  if (project.narrative && project.narrative.length > 0) {
    logger.debug('\n📝 NARRATIVE LOGS:\n');
    project.narrative.forEach((entry, idx) => {
      logger.info('. []  (source: )', { idx + 1: idx + 1, date: entry.date, headline: entry.headline, source || 'unknown': entry.source || 'unknown' });
      if (entry.bullets && entry.bullets.length > 0) {
        entry.bullets.forEach(b => logger.info('-', { b: b });
      }
      logger.info('');
    });
  } else {
    logger.warn('\n⚠️  No narrative entries found');
  }

  if (project.objectives && project.objectives.length > 0) {
    logger.info('\n📋 OBJECTIVES:\n');
    project.objectives.forEach((obj, idx) => {
      logger.info('.', { idx + 1: idx + 1, stringify(obj): typeof obj === 'string' ? obj : JSON.stringify(obj) });
    });
  }
}

checkSchoolNarrative().then(() => process.exit(0));
