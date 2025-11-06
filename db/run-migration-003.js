require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const logger = require('../utils/logger');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function runMigration() {
  logger.info('📦 Running migration_003_recurring_tasks...\n');

  const sql = fs.readFileSync('./db/migration_003_recurring_tasks.sql', 'utf8');

  logger.warn('⚠️  This migration must be run directly in Supabase SQL Editor');
  logger.info('📋 Copy the SQL below and paste it into:');
  logger.info('   https://supabase.com/dashboard/project/oavmcziiaksutuntwlbl/sql/new\n');
  logger.info('=' .repeat(60));
  logger.info(sql);
  logger.info('=' .repeat(60));
  logger.info('\n✅ After running the SQL, the migration will be complete!');
}

runMigration();
