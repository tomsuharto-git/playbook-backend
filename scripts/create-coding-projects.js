const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function createCodingProjects() {
  console.log('\n✨ Creating New Coding Projects\n');
  console.log('='.repeat(70));

  const projectsToCreate = [
    {
      name: 'TBOY',
      project_color: '#FF6B6B', // Red/coral
      tag: 'Code',
      context: 'Work',
      status: 'active'
    },
    {
      name: 'Get Smart',
      project_color: '#4ECDC4', // Teal
      tag: 'Code',
      context: 'Work',
      status: 'active'
    },
    {
      name: 'Impersonas',
      project_color: '#95E1D3', // Mint green
      tag: 'Code',
      context: 'Work',
      status: 'active'
    }
  ];

  for (const projectData of projectsToCreate) {
    console.log(`\n📌 Creating: ${projectData.name}`);

    const { data: existing } = await supabase
      .from('projects')
      .select('id, name')
      .eq('name', projectData.name)
      .maybeSingle();

    if (existing) {
      console.log(`   ⚠️  Project already exists - skipping`);
      continue;
    }

    const { data, error } = await supabase
      .from('projects')
      .insert(projectData)
      .select()
      .single();

    if (error) {
      console.error(`   ❌ Error creating project:`, error);
    } else {
      console.log(`   ✅ Created successfully (ID: ${data.id})`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('\n🎉 Projects created! Now running mapping backfill...\n');
}

createCodingProjects();
