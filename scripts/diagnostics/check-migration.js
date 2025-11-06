#!/usr/bin/env node

const logger = require('../../utils/logger');

/**
 * Check if Phase 1 migration tables exist
 */

const { supabase } = require('./db/supabase-client');

async function checkTables() {
  logger.debug('\n🔍 Checking for new tables...\n');

  const tables = [
    { name: 'events', description: 'Calendar events and meetings' },
    { name: 'narratives', description: 'Project timeline and context' },
    { name: 'news', description: 'News articles (placeholder)' }
  ];

  let allExist = true;

  for (const table of tables) {
    try {
      // Try to query the table (will fail if it doesn't exist)
      const { count, error } = await supabase
        .from(table.name)
        .select('*', { count: 'exact', head: true });

      if (error) {
        logger.error('❌ : NOT FOUND', { name: table.name });
        logger.info('', { description: table.description });
        allExist = false;
      } else {
        logger.info('✅ : EXISTS ( records)', { name: table.name, count || 0: count || 0 });
        logger.info('', { description: table.description });
      }
    } catch (err) {
      logger.error('❌ : ERROR -', { name: table.name, message: err.message });
      allExist = false;
    }
  }

  logger.info('\n' + '='.repeat(50));

  if (allExist) {
    logger.info('✅ All tables exist! Migration successful.');
    logger.info('\nYou can now run: node test-phase1.js');
  } else {
    logger.warn('⚠️  Some tables are missing.');
    logger.info('\nPlease run the migration in Supabase Dashboard:');
    logger.info('1. Go to: https://supabase.com/dashboard/project/oavmcziiaksutuntwlbl');
    logger.info('2. Click "SQL Editor" in the left sidebar');
    logger.info('3. Copy contents of: migrations/migration_009_three_entity_architecture.sql');
    logger.info('4. Paste and click "Run"');
  }

  logger.info('='.repeat(50) + '\n');
}

checkTables().catch(error => {
  logger.error('❌ Script failed', { error: error.message, stack: error.stack });
});