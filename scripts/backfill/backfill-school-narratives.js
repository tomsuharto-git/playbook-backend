require('dotenv').config();
const { supabase } = require('./db/supabase-client');

async function backfillSchoolNarratives() {
  console.log('📚 Backfilling School narratives from Oct 8th email notes...\n');

  // Get School project
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, name, narrative')
    .ilike('name', '%school%')
    .single();

  if (projectError || !project) {
    console.error('❌ School project not found:', projectError?.message);
    return;
  }

  console.log(`📁 Found project: ${project.name}`);
  console.log(`📊 Current narrative entries: ${project.narrative?.length || 0}\n`);

  // Define narratives to backfill (extracted from email notes)
  const narrativesToAdd = [
    {
      date: '2025-10-08',
      headline: 'School district announces $20.2M budget crisis, special election Dec 9',
      bullets: [
        '$13.6M loan approved to cover 2024-2025 deficit',
        'Two ballot questions: $12.6M for past deficit, $7.6M for current year',
        'If Question 2 fails: 100+ staff cuts, elimination of programs, sports, busing',
        'Community engagement meetings coming weeks'
      ],
      source: 'email'
    },
    {
      date: '2025-10-08',
      headline: 'PTA Budget Meeting scheduled for Oct 16',
      bullets: [
        'Meeting on October 16th at Northeast, 8:30pm',
        'In-person and Zoom options available',
        'Need quorum to pass budget - your voice matters',
        'Must renew PTA membership to continue receiving newsletters'
      ],
      source: 'email'
    }
  ];

  // Add to existing narrative (most recent first)
  const existingNarrative = project.narrative || [];
  const mergedNarrative = [...narrativesToAdd, ...existingNarrative];

  // Update database
  const { error: updateError } = await supabase
    .from('projects')
    .update({
      narrative: mergedNarrative,
      last_activity: new Date().toISOString()
    })
    .eq('id', project.id);

  if (updateError) {
    console.error('❌ Error updating project:', updateError.message);
    return;
  }

  console.log('✅ Successfully backfilled School narratives:');
  console.log(`   Added: ${narrativesToAdd.length} entries`);
  console.log(`   Total: ${mergedNarrative.length} entries\n`);

  console.log('📝 Backfilled entries:');
  narrativesToAdd.forEach((entry, idx) => {
    console.log(`\n${idx + 1}. [${entry.date}] ${entry.headline}`);
    entry.bullets.forEach(b => console.log(`   - ${b}`));
  });
}

backfillSchoolNarratives()
  .then(() => {
    console.log('\n✅ Backfill complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });
