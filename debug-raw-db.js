/**
 * Debug script to examine raw database structure
 */

const { supabase } = require('./db/supabase-client');
const fs = require('fs');

async function debugRawDb() {
  const now = new Date();
  const etFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York'
  });
  const todayET = etFormatter.format(now);

  console.log(`\n🔍 Fetching raw database record for ${todayET}\n`);

  try {
    const { data, error } = await supabase
      .from('daily_briefs')
      .select('*')
      .eq('date', todayET)
      .single();

    if (error) {
      console.error('❌ Error:', error);
      return;
    }

    if (!data) {
      console.log('❌ No record found');
      return;
    }

    // Save full record to file
    fs.writeFileSync('./temp-db-record.json', JSON.stringify(data, null, 2));
    console.log('💾 Saved full record to temp-db-record.json\n');

    console.log('📊 Record metadata:');
    console.log(`  - date: ${data.date}`);
    console.log(`  - created_at: ${data.created_at}`);
    console.log(`  - updated_at: ${data.updated_at}`);
    console.log(`  - calendar_events type: ${typeof data.calendar_events}`);
    console.log(`  - calendar_events is array: ${Array.isArray(data.calendar_events)}`);
    console.log(`  - calendar_events length: ${data.calendar_events?.length || 0}`);

    if (data.calendar_events && data.calendar_events.length > 0) {
      console.log('\n📋 First event raw:');
      const firstEvent = data.calendar_events[0];
      console.log(JSON.stringify(firstEvent, null, 2));

      console.log('\n📋 First event keys:', Object.keys(firstEvent));
      console.log(`    - Has 'summary': ${firstEvent.hasOwnProperty('summary')}`);
      console.log(`    - summary value: ${firstEvent.summary}`);
      console.log(`    - Has 'start': ${firstEvent.hasOwnProperty('start')}`);
      console.log(`    - start value:`, firstEvent.start);

      // Check if events have wrong structure
      if (!firstEvent.hasOwnProperty('summary')) {
        console.log('\n⚠️  Events missing "summary" field!');
        console.log('    This suggests data structure corruption.');
      }

      // Look for alternative field names
      console.log('\n🔍 Checking for alternative field names:');
      ['subject', 'title', 'name'].forEach(field => {
        if (firstEvent.hasOwnProperty(field)) {
          console.log(`    ✅ Found "${field}": ${firstEvent[field]}`);
        }
      });
    }

  } catch (err) {
    console.error('❌ Exception:', err);
  }

  process.exit(0);
}

debugRawDb();
