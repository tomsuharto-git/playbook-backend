const logger = require('../../utils/logger');

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function checkFileProjectMapping() {
  logger.info('\n📂 Checking File-to-Project Mapping Accuracy\n');
  logger.info('='.repeat(70));

  // Get all meeting notes
  const { data: notes } = await supabase
    .from('meeting_notes')
    .select('id, file_path, project_id, title, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  // Get all projects
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name');

  const projectMap = new Map(projects.map(p => [p.id, p.name]));

  logger.debug('\n📊 Recent Files and Their Project Mappings:\n');

  let mappedCount = 0;
  let unmappedCount = 0;
  const projectCounts = new Map();

  notes.forEach(note => {
    const projectName = note.project_id ? projectMap.get(note.project_id) : null;

    // Extract relevant path parts for display
    const pathParts = note.file_path.split('/');
    const relevantPath = pathParts.slice(-4).join('/'); // Last 4 parts

    const status = projectName ? '✅' : '❌';
    logger.info('', { status: status, relevantPath: relevantPath });
    logger.info('Project:', { projectName || 'UNMAPPED': projectName || 'UNMAPPED' });
    logger.info('Title:', { title: note.title });
    logger.info('Created:', { toLocaleDateString(): new Date(note.created_at).toLocaleDateString() });
    logger.info('');

    if (projectName) {
      mappedCount++;
      projectCounts.set(projectName, (projectCounts.get(projectName) || 0) + 1);
    } else {
      unmappedCount++;
    }
  });

  logger.info('='.repeat(70));
  logger.info('\n📈 Mapping Statistics:\n');
  logger.info('Total files analyzed:', { length: notes.length });
  logger.info('Successfully mapped:  (%)', { mappedCount: mappedCount, length * 100): Math.round(mappedCount / notes.length * 100) });
  logger.info('Unmapped:  (%)', { unmappedCount: unmappedCount, length * 100): Math.round(unmappedCount / notes.length * 100) });

  logger.debug('\n📊 Files per Project:\n');
  const sortedProjects = [...projectCounts.entries()].sort((a, b) => b[1] - a[1]);
  sortedProjects.forEach(([project, count]) => {
    logger.info(':  files', { project: project, count: count });
  });

  // Check for patterns in unmapped files
  logger.debug('\n🔍 Unmapped File Patterns:\n');
  const unmappedPaths = notes.filter(n => !n.project_id).map(n => n.file_path);

  if (unmappedPaths.length > 0) {
    const pathSamples = unmappedPaths.slice(0, 5);
    pathSamples.forEach(path => {
      logger.info('', { path: path });
    });

    if (unmappedPaths.length > 5) {
      logger.info('... and  more', { length - 5: unmappedPaths.length - 5 });
    }
  } else {
    logger.info('  No unmapped files!');
  }

  // File creation frequency analysis
  logger.info('\n\n📅 File Creation Frequency (Last 30 Days):\n');
  logger.info('='.repeat(70));

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: recentNotes } = await supabase
    .from('meeting_notes')
    .select('project_id, created_at')
    .gte('created_at', thirtyDaysAgo.toISOString());

  const projectFrequency = new Map();

  recentNotes.forEach(note => {
    if (note.project_id) {
      const projectName = projectMap.get(note.project_id);
      if (projectName) {
        projectFrequency.set(projectName, (projectFrequency.get(projectName) || 0) + 1);
      }
    }
  });

  const sortedFrequency = [...projectFrequency.entries()].sort((a, b) => b[1] - a[1]);

  sortedFrequency.forEach(([project, count]) => {
    const filesPerWeek = (count / 30 * 7).toFixed(1);
    const bar = '█'.repeat(Math.min(count, 20));
    logger.info('files (/week)', { padEnd(20): project.padEnd(20), bar: bar, count: count, filesPerWeek: filesPerWeek });
  });
}

checkFileProjectMapping();
