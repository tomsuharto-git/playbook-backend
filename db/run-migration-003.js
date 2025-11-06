require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function runMigration() {
  console.log('📦 Running migration_003_recurring_tasks...\n');

  const sql = fs.readFileSync('./db/migration_003_recurring_tasks.sql', 'utf8');

  console.log('⚠️  This migration must be run directly in Supabase SQL Editor');
  console.log('📋 Copy the SQL below and paste it into:');
  console.log('   https://supabase.com/dashboard/project/oavmcziiaksutuntwlbl/sql/new\n');
  console.log('=' .repeat(60));
  console.log(sql);
  console.log('=' .repeat(60));
  console.log('\n✅ After running the SQL, the migration will be complete!');
}

runMigration();
