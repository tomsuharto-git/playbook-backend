const logger = require('../../utils/logger');

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function checkMeetingDetails() {
  logger.info('\n📋 Checking meeting note details...\n');

  // Get ITA Airways project
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('name', 'ITA Airways')
    .single();

  // Get meeting notes with actual dates (not null)
  const { data: notes } = await supabase
    .from('meeting_notes')
    .select('*')
    .eq('project_id', project.id)
    .not('date', 'is', null)
    .order('date', { ascending: false });

  logger.info('ITA Airways Meeting Notes:\n');
  notes?.forEach(note => {
    logger.info('Title:', { title: note.title });
    logger.info('Date:', { date: note.date });
    logger.info('Key Points:');
    logger.info('---\n');
  });
}

checkMeetingDetails();
