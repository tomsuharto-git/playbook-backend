const logger = require('../../utils/logger');

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function checkFullStructure() {
  logger.info('\n📋 Checking full meeting note structure...\n');

  // Get ITA Airways project
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('name', 'ITA Airways')
    .single();

  // Get one meeting note to see all available fields
  const { data: notes } = await supabase
    .from('meeting_notes')
    .select('*')
    .eq('project_id', project.id)
    .eq('title', 'Meeting Notes')
    .single();

  logger.info('Full Meeting Note Structure:');
  logger.info(JSON.stringify(notes, { arg0: null });
}

checkFullStructure();
