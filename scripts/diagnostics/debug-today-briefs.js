/**
 * Debug script to check today's briefings in the database
 */

const { supabase } = require('./db/supabase-client');

async function debugTodaysBriefs() {
  // Get today's date in ET
  const now = new Date();
  const etFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York'
  });
  const todayET = etFormatter.format(now);

  console.log(`\n🔍 Checking briefings for: ${todayET}\n`);

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
      console.log('❌ No briefings found for today');
      return;
    }

    const events = data.calendar_events || [];
    console.log(`📊 Total events: ${events.length}`);

    // Count events with "No Title"
    const noTitleEvents = events.filter(e => e.summary === 'No Title');
    console.log(`\n⚠️  Events with "No Title": ${noTitleEvents.length}`);

    // Count events with actual titles
    const titledEvents = events.filter(e => e.summary && e.summary !== 'No Title');
    console.log(`✅ Events with titles: ${titledEvents.length}`);

    // Show all event titles
    console.log('\n📋 All events:');
    events.forEach((event, i) => {
      const time = event.start?.dateTime || event.start?.date || 'No time';
      const title = event.summary || 'UNDEFINED';
      const source = event.calendar_category || 'Unknown';
      const id = event.id || 'No ID';
      console.log(`  ${i + 1}. [${source}] ${time} - "${title}" (ID: ${id.substring(0, 20)}...)`);
    });

    // Show when this was last updated
    console.log(`\n🕐 Last updated: ${data.updated_at || data.created_at || 'Unknown'}`);

    // Check for duplicate IDs
    const idMap = new Map();
    events.forEach(event => {
      const id = event.id;
      if (idMap.has(id)) {
        idMap.set(id, idMap.get(id) + 1);
      } else {
        idMap.set(id, 1);
      }
    });

    const duplicates = Array.from(idMap.entries()).filter(([id, count]) => count > 1);
    if (duplicates.length > 0) {
      console.log(`\n⚠️  Duplicate event IDs found: ${duplicates.length}`);
      duplicates.forEach(([id, count]) => {
        console.log(`    ${id}: ${count} occurrences`);
      });
    }

  } catch (err) {
    console.error('❌ Exception:', err);
  }

  process.exit(0);
}

debugTodaysBriefs();
