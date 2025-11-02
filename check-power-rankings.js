const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function checkPowerRankings() {
  console.log('\n📊 Current Project Power Rankings:\n');

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, power_ranking, status, created_at')
    .eq('status', 'active')
    .order('power_ranking', { ascending: false, nullsFirst: false });

  projects?.forEach((project, index) => {
    console.log(`${index + 1}. ${project.name}`);
    console.log(`   Power Ranking: ${project.power_ranking}`);
    console.log(`   Created: ${project.created_at}`);
    console.log('');
  });
}

checkPowerRankings();
