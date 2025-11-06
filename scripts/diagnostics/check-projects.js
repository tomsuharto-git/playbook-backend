const logger = require('../../utils/logger');

const { supabase } = require('./db/supabase-client');

async function checkProjects() {
  const { data: projects, error } = await supabase
    .from('projects')
    .select('*')
    .order('name');

  if (error) {
    logger.error('Error:', { arg0: error });
    return;
  }

  logger.debug('\n📊 Found  projects\n', { length: projects.length });

  // Check structure
  if (projects.length > 0) {
    logger.info('Project fields:');
    logger.info();
  }

  // Show a few examples
  const examples = ['Insurance', 'Nuveen', 'Growth Diagnosis', 'Baileys'];
  examples.forEach(name => {
    const project = projects.find(p => p.name === name);
    if (project) {
      logger.info(':', { name: name });
      logger.info('Context:', { context || 'NONE': project.context || 'NONE' });
      logger.info('Color:', { color: project.color });
      logger.info('Active:', { is_active: project.is_active });
      logger.info();
    }
  });
}

checkProjects();
