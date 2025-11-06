const logger = require('../../utils/logger');

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function checkPowerRankings() {
  logger.debug('\n📊 Current Project Power Rankings:\n');

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, power_ranking, status, created_at')
    .eq('status', 'active')
    .order('power_ranking', { ascending: false, nullsFirst: false });

  projects?.forEach((project, index) => {
    logger.info('.', { index + 1: index + 1, name: project.name });
    logger.info('Power Ranking:', { power_ranking: project.power_ranking });
    logger.info('Created:', { created_at: project.created_at });
    logger.info('');
  });
}

checkPowerRankings();
