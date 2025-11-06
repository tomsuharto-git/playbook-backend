const logger = require('../../utils/logger');

/**
 * Check Phase 2 table status
 */

const { supabase } = require('./db/supabase-client');

async function checkTables() {
  logger.debug('\n🔍 Checking Phase 2 Table Status...\n');

  // Check if narratives table exists
  const { data: narratives, error: narrativesError } = await supabase
    .from('narratives')
    .select('*')
    .limit(1);

  logger.error('📝 Narratives table:');
  if (!narrativesError) {
    const { count } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true });
    logger.info('   Row count:', { arg0: count });
  } else {
    logger.error('   Error:', { arg0: narrativesError.message });
  }

  // Check events table
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('*')
    .limit(1);

  logger.error('\n📅 Events table:');
  if (!eventsError) {
    const { count } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true });
    logger.info('   Row count:', { arg0: count });
  } else {
    logger.error('   Error:', { arg0: eventsError.message });
  }

  // Check projects.narrative field
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, narrative, ai_insights')
    .limit(5);

  logger.info('\n🎯 Projects with JSONB data:\n');
  projects?.forEach(p => {
    logger.info(':', { name: p.name });
    logger.info('- Narrative entries:', { length || 0: p.narrative?.length || 0 });
    logger.info('- AI Insights milestones:', { length || 0: p.ai_insights?.milestones?.length || 0 });
  });

  logger.info('\n═'.repeat(80));
  logger.debug('\n📊 SUMMARY:\n');
  logger.info('   Phase 2 Migration Status:');
  logger.error('- Events table:', { eventsError ? 'NOT CREATED' : 'CREATED': eventsError ? 'NOT CREATED' : 'CREATED' });
  logger.error('- Narratives table:', { narrativesError ? 'NOT CREATED' : 'CREATED': narrativesError ? 'NOT CREATED' : 'CREATED' });
  logger.info('\n   Current Data Location:');
  logger.info('     - Narratives: Still in projects.narrative JSONB field');
  logger.info('     - Milestones: Still in projects.ai_insights.milestones JSONB field');
  logger.info('\n');
}

checkTables().catch(error => {
  logger.error('❌ Script failed', { error: error.message, stack: error.stack });
});
