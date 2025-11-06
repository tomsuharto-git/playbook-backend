const logger = require('../../utils/logger');

const { supabase } = require('./db/supabase-client');

(async () => {
  const { data } = await supabase
    .from('projects')
    .select('name, narrative')
    .in('name', ['ITA Airways', 'CAVA', 'Nuveen'])
    .order('name');

  data.forEach(p => {
    logger.info('\n📋 :', { name: p.name });
    if (p.narrative && p.narrative.length > 0) {
      logger.info('Total narratives:', { length: p.narrative.length });
      p.narrative.slice(0, 5).forEach((n, i) => {
        logger.info('. Source:', { i+1: i+1, source || 'undefined': n.source || 'undefined' });
        logger.info('Date:', { date: n.date });
        logger.info('Headline:', { headline: n.headline });
      });
    } else {
      logger.info('  No narratives');
    }
  });
  process.exit(0);
})();
