require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('📦 Running migration_010_quality_control...\n');

  const sql = fs.readFileSync(
    path.join(__dirname, '../migrations/migration_010_quality_control.sql'),
    'utf8'
  );

  console.log('⚠️  This migration must be run directly in Supabase SQL Editor');
  console.log('📋 Copy the SQL below and paste it into:');
  console.log('   https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql/new\n');
  console.log('=' .repeat(80));
  console.log(sql);
  console.log('=' .repeat(80));
  console.log('\n✅ After running the SQL, the migration will be complete!');
  console.log('\n📝 This migration creates:');
  console.log('   - qc_runs table (tracks QC agent executions)');
  console.log('   - qc_actions table (audit trail for rollback)');
  console.log('   - qc_alerts table (manual review queue)');
  console.log('   - Helper functions: start_qc_run, complete_qc_run, log_qc_action, rollback_qc_action');
  console.log('   - Views: qc_stats, qc_action_summary\n');
}

runMigration();
