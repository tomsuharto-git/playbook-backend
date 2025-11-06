const logger = require('../../utils/logger');

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function checkNarrativeSources() {
  // Get ITA Airways project
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('name', 'ITA Airways')
    .single();

  if (!project) {
    logger.info('ITA Airways project not found');
    return;
  }

  // Get all meeting notes for ITA
  const { data: notes } = await supabase
    .from('meeting_notes')
    .select('*')
    .eq('project_id', project.id)
    .order('created_at', { ascending: false });

  logger.info('\n📋 ITA Airways Narrative Entries:\n');
  notes?.forEach(note => {
    logger.info('Title:', { title: note.title });
    logger.info('Source:', { source: note.source });
    logger.info('Date:', { date: note.date });
    logger.info('Created:', { created_at: note.created_at });
    logger.info('---\n');
  });

  // Also check CAVA
  const { data: cavaProject } = await supabase
    .from('projects')
    .select('id')
    .eq('name', 'CAVA')
    .single();

  if (cavaProject) {
    const { data: cavaNotes } = await supabase
      .from('meeting_notes')
      .select('*')
      .eq('project_id', cavaProject.id)
      .order('created_at', { ascending: false });

    logger.info('\n📋 CAVA Narrative Entries:\n');
    cavaNotes?.forEach(note => {
      logger.info('Title:', { title: note.title });
      logger.info('Source:', { source: note.source });
      logger.info('Date:', { date: note.date });
      logger.info('Created:', { created_at: note.created_at });
      logger.info('---\n');
    });
  }
}

checkNarrativeSources();
