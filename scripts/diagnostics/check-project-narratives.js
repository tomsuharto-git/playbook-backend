const logger = require('../../utils/logger');

const { supabase } = require('./db/supabase-client');

(async () => {
  logger.debug('\n🔍 Checking project narratives in projects table...\n');

  // Check if narrative column exists and has data
  const { data: projects, error } = await supabase
    .from('projects')
    .select('id, name, narrative, tag')
    .order('name');

  if (error) {
    logger.error('❌ Error fetching projects:', { arg0: error });
    process.exit(1);
  }

  logger.debug('📊 Found  projects\n', { length || 0: projects?.length || 0 });

  let narrativeCount = 0;
  let totalNarratives = 0;

  projects.forEach(p => {
    const narratives = p.narrative || [];
    if (narratives.length > 0) {
      narrativeCount++;
      totalNarratives += narratives.length;
      logger.info('✅  ():  narratives', { name: p.name, tag || 'No tag': p.tag || 'No tag', length: narratives.length });
      narratives.slice(0, 2).forEach(n => {
        logger.info('- :  ()', { date: n.date, headline: n.headline, source: n.source });
      });
      if (narratives.length > 2) {
        logger.info('... and  more', { length - 2: narratives.length - 2 });
      }
      logger.info('');
    }
  });

  logger.info('\n📈 Summary:');
  logger.info('Projects with narratives: /', { narrativeCount: narrativeCount, length: projects.length });
  logger.info('Total narrative entries:', { totalNarratives: totalNarratives });

  if (narrativeCount === 0) {
    logger.warn('\n⚠️  No narratives found in any projects!');
    logger.info('   The narrative field may need to be populated.');
  }

  process.exit(0);
})();
