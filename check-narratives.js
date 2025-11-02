const { supabase } = require('./db/supabase-client');

(async () => {
  console.log('\n🔍 Checking project narratives...\n');

  // Check total narratives
  const { data: allNarratives, error: allError, count } = await supabase
    .from('project_narratives')
    .select('id, project_id, headline, source, date, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(20);

  if (allError) {
    console.log('❌ Error fetching narratives:', allError);
    process.exit(1);
  }

  console.log(`📊 Total narratives in database: ${count}`);
  console.log(`📝 Showing latest ${allNarratives?.length || 0} narratives:\n`);

  if (allNarratives && allNarratives.length > 0) {
    allNarratives.forEach((n, i) => {
      console.log(`${i + 1}. Project ID: ${n.project_id}`);
      console.log(`   Source: ${n.source} | Date: ${new Date(n.date).toLocaleDateString()}`);
      console.log(`   Headline: ${n.headline}`);
      console.log(`   Created: ${new Date(n.created_at).toLocaleString()}\n`);
    });
  } else {
    console.log('ℹ️  No narratives found in database');
  }

  // Get project names
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name');

  // Count narratives by project
  const { data: countByProject } = await supabase
    .from('project_narratives')
    .select('project_id');

  if (countByProject && projects) {
    const projectCounts = {};
    countByProject.forEach(n => {
      projectCounts[n.project_id] = (projectCounts[n.project_id] || 0) + 1;
    });

    console.log('\n📈 Narratives by project:');
    Object.entries(projectCounts)
      .sort(([, a], [, b]) => b - a)
      .forEach(([pid, count]) => {
        const project = projects.find(p => p.id === parseInt(pid));
        console.log(`  ${project?.name || 'Unknown'} (ID: ${pid}): ${count} narratives`);
      });
  }

  process.exit(0);
})();
