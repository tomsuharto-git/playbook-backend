// Check which calendar/event tables exist
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function checkTables() {
  console.log('\n🔍 Checking Event/Calendar Tables...\n');

  // Check calendar_events table
  const { data: ce, error: ceError, count: ceCount } = await supabase
    .from('calendar_events')
    .select('*', { count: 'exact', head: true });

  if (ceError) {
    console.log('❌ calendar_events table: NOT FOUND');
    console.log('   Error:', ceError.message);
  } else {
    console.log('✅ calendar_events table: EXISTS');
    console.log(`   Records: ${ceCount || 0}`);
  }

  // Check events table (Phase 2)
  const { data: ev, error: evError, count: evCount } = await supabase
    .from('events')
    .select('*', { count: 'exact', head: true });

  if (evError) {
    console.log('❌ events table: NOT FOUND');
    console.log('   Error:', evError.message);
  } else {
    console.log('✅ events table: EXISTS');
    console.log(`   Records: ${evCount || 0}`);
  }

  console.log('\n');
}

checkTables();
