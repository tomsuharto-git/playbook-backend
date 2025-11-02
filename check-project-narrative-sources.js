const { supabase } = require('./db/supabase-client');

(async () => {
  const { data } = await supabase
    .from('projects')
    .select('name, narrative')
    .in('name', ['ITA Airways', 'CAVA', 'Nuveen'])
    .order('name');

  data.forEach(p => {
    console.log(`\n📋 ${p.name}:`);
    if (p.narrative && p.narrative.length > 0) {
      console.log(`   Total narratives: ${p.narrative.length}`);
      p.narrative.slice(0, 5).forEach((n, i) => {
        console.log(`  ${i+1}. Source: ${n.source || 'undefined'}`);
        console.log(`     Date: ${n.date}`);
        console.log(`     Headline: ${n.headline}`);
      });
    } else {
      console.log('  No narratives');
    }
  });
  process.exit(0);
})();
