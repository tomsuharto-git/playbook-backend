#!/usr/bin/env node

/**
 * Check if Phase 1 migration tables exist
 */

const { supabase } = require('./db/supabase-client');

async function checkTables() {
  console.log('\n🔍 Checking for new tables...\n');

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
        console.log(`❌ ${table.name}: NOT FOUND`);
        console.log(`   ${table.description}`);
        allExist = false;
      } else {
        console.log(`✅ ${table.name}: EXISTS (${count || 0} records)`);
        console.log(`   ${table.description}`);
      }
    } catch (err) {
      console.log(`❌ ${table.name}: ERROR - ${err.message}`);
      allExist = false;
    }
  }

  console.log('\n' + '='.repeat(50));

  if (allExist) {
    console.log('✅ All tables exist! Migration successful.');
    console.log('\nYou can now run: node test-phase1.js');
  } else {
    console.log('⚠️  Some tables are missing.');
    console.log('\nPlease run the migration in Supabase Dashboard:');
    console.log('1. Go to: https://supabase.com/dashboard/project/oavmcziiaksutuntwlbl');
    console.log('2. Click "SQL Editor" in the left sidebar');
    console.log('3. Copy contents of: migrations/migration_009_three_entity_architecture.sql');
    console.log('4. Paste and click "Run"');
  }

  console.log('='.repeat(50) + '\n');
}

checkTables().catch(console.error);