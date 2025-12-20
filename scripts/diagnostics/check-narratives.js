const logger = require('../../utils/logger');
const { supabase } = require('../../db/supabase-client');

(async () => {
  logger.debug('\n🔍 Checking project narratives...\n');

  // Check total narratives
  const { data: allNarratives, error: allError, count } = await supabase
    .from('project_narratives')
    .select('id, project_id, headline, source, date, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(20);

  if (allError) {
    logger.error('❌ Error fetching narratives:', { error: allError.message });
    process.exit(1);
  }

  logger.debug('📊 Total narratives in database:', { count: count });
  logger.debug('📝 Showing latest narratives:', { length: allNarratives?.length || 0 });

  if (allNarratives && allNarratives.length > 0) {
    allNarratives.forEach((n, i) => {
      logger.info(`${i + 1}. Project ID: ${n.project_id}`);
      logger.info(`   Source: ${n.source} | Date: ${new Date(n.date).toLocaleDateString()}`);
      logger.info(`   Headline: ${n.headline}`);
      logger.info(`   Created: ${new Date(n.created_at).toLocaleString()}\n`);
    });
  } else {
    logger.info('ℹ️  No narratives found in database');
  }

  // Get project names
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name');

  // Count narratives by project
  const { data: countByProject } = await supabase
    .from('project_narratives')
    .select('project_id');

  if (countByProject && projects) {
    const projectCounts = {};
    countByProject.forEach(n => {
      projectCounts[n.project_id] = (projectCounts[n.project_id] || 0) + 1;
    });

    logger.info('\n📈 Narratives by project:');
    Object.entries(projectCounts)
      .sort(([, a], [, b]) => b - a)
      .forEach(([pid, count]) => {
        const project = projects.find(p => p.id === parseInt(pid));
        logger.info(`${project?.name || 'Unknown'} (ID: ${pid}): ${count} narratives`);
      });
  }

  process.exit(0);
})();
