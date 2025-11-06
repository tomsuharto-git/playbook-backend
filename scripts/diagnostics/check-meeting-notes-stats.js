const { supabase } = require('./db/supabase-client');

(async () => {
  // Get total meeting notes
  const { data: allNotes, count: totalCount } = await supabase
    .from('meeting_notes')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  console.log(`\n📊 Meeting Notes Statistics:`);
  console.log(`   Total meeting notes: ${totalCount}`);

  const analyzed = allNotes.filter(n => n.analyzed).length;
  const withAnalysis = allNotes.filter(n => n.analysis).length;
  const withNarrative = allNotes.filter(n => n.analysis && n.analysis.narrative).length;

  console.log(`   Analyzed: ${analyzed}`);
  console.log(`   With analysis object: ${withAnalysis}`);
  console.log(`   With narrative in analysis: ${withNarrative}`);

  // Check recent notes with narratives
  console.log(`\n📝 Recent meeting notes WITH narratives:`);
  allNotes
    .filter(n => n.analysis && n.analysis.narrative && n.analysis.narrative.headline)
    .slice(0, 10)
    .forEach(n => {
      console.log(`   • ${n.title} (${n.date || 'no date'})`);
      console.log(`     Project ID: ${n.project_id || 'none'}`);
      console.log(`     Narrative: ${n.analysis.narrative.headline}`);
    });

  // Check recent notes WITHOUT narratives
  console.log(`\n❌ Recent meeting notes WITHOUT narratives:`);
  allNotes
    .filter(n => !n.analysis || !n.analysis.narrative || !n.analysis.narrative.headline)
    .slice(0, 10)
    .forEach(n => {
      console.log(`   • ${n.title} (${n.date || 'no date'})`);
      console.log(`     Project ID: ${n.project_id || 'none'}`);
      console.log(`     Has analysis: ${!!n.analysis}`);
    });

  process.exit(0);
})();
