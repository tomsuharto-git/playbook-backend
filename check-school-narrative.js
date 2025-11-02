require('dotenv').config();
const { supabase } = require('./db/supabase-client');

async function checkSchoolNarrative() {
  console.log('🔍 Checking School project narrative logs...\n');

  const { data: project, error } = await supabase
    .from('projects')
    .select('id, name, narrative, objectives')
    .ilike('name', '%school%')
    .single();

  if (error || !project) {
    console.log('❌ No School project found:', error?.message);
    return;
  }

  console.log('📁 Project:', project.name);
  console.log('📊 Narrative entries:', project.narrative?.length || 0);
  console.log('📊 Objectives:', project.objectives?.length || 0);

  if (project.narrative && project.narrative.length > 0) {
    console.log('\n📝 NARRATIVE LOGS:\n');
    project.narrative.forEach((entry, idx) => {
      console.log(`${idx + 1}. [${entry.date}] ${entry.headline} (source: ${entry.source || 'unknown'})`);
      if (entry.bullets && entry.bullets.length > 0) {
        entry.bullets.forEach(b => console.log(`   - ${b}`));
      }
      console.log('');
    });
  } else {
    console.log('\n⚠️  No narrative entries found');
  }

  if (project.objectives && project.objectives.length > 0) {
    console.log('\n📋 OBJECTIVES:\n');
    project.objectives.forEach((obj, idx) => {
      console.log(`${idx + 1}. ${typeof obj === 'string' ? obj : JSON.stringify(obj)}`);
    });
  }
}

checkSchoolNarrative().then(() => process.exit(0));
