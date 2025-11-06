/**
 * Check Phase 2 table status
 */

const { supabase } = require('./db/supabase-client');

async function checkTables() {
  console.log('\n🔍 Checking Phase 2 Table Status...\n');

  // Check if narratives table exists
  const { data: narratives, error: narrativesError } = await supabase
    .from('narratives')
    .select('*')
    .limit(1);

  console.log('📝 Narratives table:', narrativesError ? '❌ DOES NOT EXIST' : '✅ EXISTS');
  if (!narrativesError) {
    const { count } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true });
    console.log('   Row count:', count);
  } else {
    console.log('   Error:', narrativesError.message);
  }

  // Check events table
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('*')
    .limit(1);

  console.log('\n📅 Events table:', eventsError ? '❌ DOES NOT EXIST' : '✅ EXISTS');
  if (!eventsError) {
    const { count } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true });
    console.log('   Row count:', count);
  } else {
    console.log('   Error:', eventsError.message);
  }

  // Check projects.narrative field
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, narrative, ai_insights')
    .limit(5);

  console.log('\n🎯 Projects with JSONB data:\n');
  projects?.forEach(p => {
    console.log(`   ${p.name}:`);
    console.log(`      - Narrative entries: ${p.narrative?.length || 0}`);
    console.log(`      - AI Insights milestones: ${p.ai_insights?.milestones?.length || 0}`);
  });

  console.log('\n═'.repeat(80));
  console.log('\n📊 SUMMARY:\n');
  console.log('   Phase 2 Migration Status:');
  console.log(`     - Events table: ${eventsError ? 'NOT CREATED' : 'CREATED'}`);
  console.log(`     - Narratives table: ${narrativesError ? 'NOT CREATED' : 'CREATED'}`);
  console.log('\n   Current Data Location:');
  console.log('     - Narratives: Still in projects.narrative JSONB field');
  console.log('     - Milestones: Still in projects.ai_insights.milestones JSONB field');
  console.log('\n');
}

checkTables().catch(console.error);
