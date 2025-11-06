const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function checkOct14Entry() {
  console.log('\n📋 Checking Oct 14 Creative Development Progress entry...\n');

  const { data: note } = await supabase
    .from('meeting_notes')
    .select('*')
    .eq('title', 'Creative Development Progress')
    .single();

  if (note) {
    console.log('Full entry:');
    console.log(JSON.stringify(note, null, 2));
  } else {
    console.log('Entry not found');
  }
}

checkOct14Entry();
