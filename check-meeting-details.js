const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function checkMeetingDetails() {
  console.log('\n📋 Checking meeting note details...\n');

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

  console.log('ITA Airways Meeting Notes:\n');
  notes?.forEach(note => {
    console.log(`Title: ${note.title}`);
    console.log(`Date: ${note.date}`);
    console.log(`Key Points:`, note.key_points);
    console.log(`---\n`);
  });
}

checkMeetingDetails();
