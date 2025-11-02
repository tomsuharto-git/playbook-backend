const { supabase } = require('./db/supabase-client');

async function checkProjects() {
  const { data: projects, error } = await supabase
    .from('projects')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`\n📊 Found ${projects.length} projects\n`);

  // Check structure
  if (projects.length > 0) {
    console.log('Project fields:', Object.keys(projects[0]).join(', '));
    console.log();
  }

  // Show a few examples
  const examples = ['Insurance', 'Nuveen', 'Growth Diagnosis', 'Baileys'];
  examples.forEach(name => {
    const project = projects.find(p => p.name === name);
    if (project) {
      console.log(`${name}:`);
      console.log(`  Context: ${project.context || 'NONE'}`);
      console.log(`  Color: ${project.color}`);
      console.log(`  Active: ${project.is_active}`);
      console.log();
    }
  });
}

checkProjects();
