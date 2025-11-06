const logger = require('../../utils/logger');

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function checkOct14Entry() {
  logger.info('\n📋 Checking Oct 14 Creative Development Progress entry...\n');

  const { data: note } = await supabase
    .from('meeting_notes')
    .select('*')
    .eq('title', 'Creative Development Progress')
    .single();

  if (note) {
    logger.info('Full entry:');
    logger.info(JSON.stringify(note, { arg0: null });
  } else {
    logger.info('Entry not found');
  }
}

checkOct14Entry();
