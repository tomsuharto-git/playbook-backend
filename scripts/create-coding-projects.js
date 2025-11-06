const logger = require('../utils/logger');

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function createCodingProjects() {
  logger.info('\n✨ Creating New Coding Projects\n');
  logger.info('='.repeat(70));

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
    logger.info('\n📌 Creating:', { name: projectData.name });

    const { data: existing } = await supabase
      .from('projects')
      .select('id, name')
      .eq('name', projectData.name)
      .maybeSingle();

    if (existing) {
      logger.warn('⚠️  Project already exists - skipping');
      continue;
    }

    const { data, error } = await supabase
      .from('projects')
      .insert(projectData)
      .select()
      .single();

    if (error) {
      logger.error('❌ Error creating project:');
    } else {
      logger.info('✅ Created successfully (ID: )', { id: data.id });
    }
  }

  logger.info('\n' + '='.repeat(70));
  logger.info('\n🎉 Projects created! Now running mapping backfill...\n');
}

createCodingProjects();
