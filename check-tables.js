// Quick script to check if Phase 2 tables exist in Supabase
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function checkTables() {
  console.log('\n🔍 Checking Phase 2 Tables in Supabase...\n');

  try {
    // Check events table
    const { data: events, error: eventsError, count: eventsCount } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true });

    if (eventsError) {
      console.log('❌ events table: NOT FOUND');
      console.log('   Error:', eventsError.message);
    } else {
      console.log('✅ events table: EXISTS');
      console.log(`   Records: ${eventsCount || 0}`);
    }

    // Check narratives table
    const { data: narratives, error: narrativesError, count: narrativesCount } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true });

    if (narrativesError) {
      console.log('❌ narratives table: NOT FOUND');
      console.log('   Error:', narrativesError.message);
    } else {
      console.log('✅ narratives table: EXISTS');
      console.log(`   Records: ${narrativesCount || 0}`);
    }

    // Check news table
    const { data: news, error: newsError, count: newsCount } = await supabase
      .from('news')
      .select('*', { count: 'exact', head: true });

    if (newsError) {
      console.log('❌ news table: NOT FOUND');
      console.log('   Error:', newsError.message);
    } else {
      console.log('✅ news table: EXISTS');
      console.log(`   Records: ${newsCount || 0}`);
    }

    console.log('\n---\n');

    // Summary
    const tablesExist = !eventsError && !narrativesError && !newsError;
    if (tablesExist) {
      console.log('✅ All Phase 2 tables exist!');
      if (eventsCount === 0 && narrativesCount === 0) {
        console.log('⚠️  Tables are empty - data migration may be needed');
      } else {
        console.log('✅ Tables have data - migration appears complete!');
      }
    } else {
      console.log('❌ Some tables are missing - migration needs to be run');
    }

  } catch (error) {
    console.error('Error checking tables:', error);
  }
}

checkTables();
