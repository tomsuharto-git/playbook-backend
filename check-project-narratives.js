const { supabase } = require('./db/supabase-client');

(async () => {
  console.log('\n🔍 Checking project narratives in projects table...\n');

  // Check if narrative column exists and has data
  const { data: projects, error } = await supabase
    .from('projects')
    .select('id, name, narrative, tag')
    .order('name');

  if (error) {
    console.log('❌ Error fetching projects:', error);
    process.exit(1);
  }

  console.log(`📊 Found ${projects?.length || 0} projects\n`);

  let narrativeCount = 0;
  let totalNarratives = 0;

  projects.forEach(p => {
    const narratives = p.narrative || [];
    if (narratives.length > 0) {
      narrativeCount++;
      totalNarratives += narratives.length;
      console.log(`✅ ${p.name} (${p.tag || 'No tag'}): ${narratives.length} narratives`);
      narratives.slice(0, 2).forEach(n => {
        console.log(`   - ${n.date}: ${n.headline} (${n.source})`);
      });
      if (narratives.length > 2) {
        console.log(`   ... and ${narratives.length - 2} more`);
      }
      console.log('');
    }
  });

  console.log(`\n📈 Summary:`);
  console.log(`   Projects with narratives: ${narrativeCount}/${projects.length}`);
  console.log(`   Total narrative entries: ${totalNarratives}`);

  if (narrativeCount === 0) {
    console.log('\n⚠️  No narratives found in any projects!');
    console.log('   The narrative field may need to be populated.');
  }

  process.exit(0);
})();
