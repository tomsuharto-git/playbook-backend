require('dotenv').config();
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

async function runMigration() {
  logger.info('📦 Running migration_010_quality_control...\n');

  const sql = fs.readFileSync(
    path.join(__dirname, '../migrations/migration_010_quality_control.sql'),
    'utf8'
  );

  logger.warn('⚠️  This migration must be run directly in Supabase SQL Editor');
  logger.info('📋 Copy the SQL below and paste it into:');
  logger.info('   https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql/new\n');
  logger.info('=' .repeat(80));
  logger.info(sql);
  logger.info('=' .repeat(80));
  logger.info('\n✅ After running the SQL, the migration will be complete!');
  logger.debug('\n📝 This migration creates:');
  logger.info('   - qc_runs table (tracks QC agent executions)');
  logger.info('   - qc_actions table (audit trail for rollback)');
  logger.info('   - qc_alerts table (manual review queue)');
  logger.info('   - Helper functions: start_qc_run, complete_qc_run, log_qc_action, rollback_qc_action');
  logger.info('   - Views: qc_stats, qc_action_summary\n');
}

runMigration();
