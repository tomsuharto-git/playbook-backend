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
    console.log('ITA Airways project not found');
    return;
  }

  // Get all meeting notes for ITA
  const { data: notes } = await supabase
    .from('meeting_notes')
    .select('*')
    .eq('project_id', project.id)
    .order('created_at', { ascending: false });

  console.log('\n📋 ITA Airways Narrative Entries:\n');
  notes?.forEach(note => {
    console.log(`Title: ${note.title}`);
    console.log(`Source: ${note.source}`);
    console.log(`Date: ${note.date}`);
    console.log(`Created: ${note.created_at}`);
    console.log(`---\n`);
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

    console.log('\n📋 CAVA Narrative Entries:\n');
    cavaNotes?.forEach(note => {
      console.log(`Title: ${note.title}`);
      console.log(`Source: ${note.source}`);
      console.log(`Date: ${note.date}`);
      console.log(`Created: ${note.created_at}`);
      console.log(`---\n`);
    });
  }
}

checkNarrativeSources();
