const logger = require('../../utils/logger');

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Cache projects list
let projectsCache = null;

// Helper to find project by name with fuzzy matching
const findProject = (name) => {
  if (!name || name.endsWith('.md')) return null;

  const nameLower = name.toLowerCase();

  // Special case: "Synthetic Panels" -> "Impersonas"
  if (nameLower === 'synthetic panels') {
    return projectsCache.find(p => p.name.toLowerCase() === 'impersonas');
  }

  // Exact match first
  let match = projectsCache.find(p => p.name.toLowerCase() === nameLower);
  if (match) return match;

  // Partial match (name contains search term or vice versa)
  match = projectsCache.find(p => {
    const projectLower = p.name.toLowerCase();
    return projectLower.includes(nameLower) || nameLower.includes(projectLower);
  });

  return match;
};

// Same logic as improved vault-watcher
async function extractProjectFromPath(filepath) {
  const pathParts = filepath.split('/');

  // Strategy 1: Check for "Clients" folder
  const clientIndex = pathParts.indexOf('Clients');
  if (clientIndex >= 0) {
    for (let i = 1; i <= 4; i++) {
      const potentialClientName = pathParts[clientIndex + i];
      const project = findProject(potentialClientName);
      if (project) return project;
    }
  }

  // Strategy 2: Check for "Get Smart" folder
  const getSmartIndex = pathParts.indexOf('Get Smart');
  if (getSmartIndex >= 0) {
    for (let i = 1; i <= 3; i++) {
      const potentialName = pathParts[getSmartIndex + i];
      const project = findProject(potentialName);
      if (project) return project;
    }
  }

  // Strategy 3: Check for "Claude Code" projects
  const claudeCodeIndex = pathParts.indexOf('Claude Code');
  if (claudeCodeIndex >= 0) {
    for (let i = 1; i <= 2; i++) {
      const projectName = pathParts[claudeCodeIndex + i];
      const project = findProject(projectName);
      if (project) return project;
    }
  }

  // Strategy 4: Check for "Projects" folder
  const projectIndex = pathParts.indexOf('Projects');
  if (projectIndex >= 0 && pathParts[projectIndex + 1]) {
    const project = findProject(pathParts[projectIndex + 1]);
    if (project) return project;
  }

  // Strategy 5: Check for LIFE subfolders (but skip Email Notes)
  const lifeIndex = pathParts.indexOf('LIFE');
  if (lifeIndex >= 0 && pathParts[lifeIndex + 1]) {
    const lifeCategoryName = pathParts[lifeIndex + 1];

    // Skip Email Notes
    if (lifeCategoryName === 'Email Notes') return null;

    const project = findProject(lifeCategoryName);
    if (project) return project;
  }

  // Strategy 6: Scan all path parts
  for (const part of pathParts) {
    const project = findProject(part);
    if (project) return project;
  }

  return null;
}

async function backfillProjectMappings() {
  logger.info('\n🔄 Backfilling Project Mappings for Existing Meeting Notes\n');
  logger.info('='.repeat(70));

  // Load projects cache
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .eq('status', 'active');

  projectsCache = projects || [];
  logger.debug('\n📊 Loaded  active projects\n', { length: projectsCache.length });

  // Get all meeting notes (with or without project mapping)
  const { data: notes } = await supabase
    .from('meeting_notes')
    .select('id, file_path, project_id, title')
    .order('created_at', { ascending: false });

  logger.debug('📝 Found  total meeting notes\n', { length: notes.length });

  let updatedCount = 0;
  let alreadyMappedCount = 0;
  let stillUnmappedCount = 0;
  let skippedCount = 0;

  for (const note of notes) {
    // Skip ai-task-manager files
    if (note.file_path.includes('/ai-task-manager/')) {
      skippedCount++;
      continue;
    }

    // Skip Email Notes
    if (note.file_path.includes('/Email Notes/')) {
      skippedCount++;
      continue;
    }

    // Try to find project
    const project = await extractProjectFromPath(note.file_path);

    if (project) {
      if (!note.project_id) {
        // Update unmapped note with new mapping
        await supabase
          .from('meeting_notes')
          .update({ project_id: project.id })
          .eq('id', note.id);

        logger.info('✅ Mapped:  →', { title: note.title, name: project.name });
        updatedCount++;
      } else if (note.project_id !== project.id) {
        // Fix incorrect mapping
        const { data: oldProject } = await supabase
          .from('projects')
          .select('name')
          .eq('id', note.project_id)
          .single();

        await supabase
          .from('meeting_notes')
          .update({ project_id: project.id })
          .eq('id', note.id);

        logger.info('🔄 Remapped:', { title: note.title });
        logger.info('→', { name || 'Unknown': oldProject?.name || 'Unknown', name: project.name });
        updatedCount++;
      } else {
        // Already correctly mapped
        alreadyMappedCount++;
      }
    } else {
      // Still can't map
      if (!note.project_id) {
        const pathParts = note.file_path.split('/');
        const relevantPath = pathParts.slice(-3).join('/');
        logger.error('❌ Still unmapped:', { relevantPath: relevantPath });
        stillUnmappedCount++;
      }
    }
  }

  logger.info('\n' + '='.repeat(70));
  logger.info('\n📈 Backfill Summary:\n');
  logger.info('Total notes processed:', { length: notes.length });
  logger.info('Newly mapped:', { updatedCount: updatedCount });
  logger.info('Already mapped correctly:', { alreadyMappedCount: alreadyMappedCount });
  logger.info('Still unmapped:', { stillUnmappedCount: stillUnmappedCount });
  logger.info('Skipped (technical files):', { skippedCount: skippedCount });
  logger.info('\nMapping accuracy: %', { length - skippedCount) * 100): Math.round((updatedCount + alreadyMappedCount) / (notes.length - skippedCount) * 100) });

  logger.info('\n✨ Backfill complete!\n');
}

backfillProjectMappings();
