require('dotenv').config();
const { supabase } = require('./db/supabase-client');

async function check() {
  const { data: oct13 } = await supabase
    .from('daily_briefs')
    .select('calendar_events')
    .eq('date', '2025-10-13')
    .single();

  console.log('🔍 Checking duplicate events for Oct 13:\n');

  // Group by title
  const grouped = {};
  oct13.calendar_events.forEach(e => {
    if (!grouped[e.summary]) grouped[e.summary] = [];
    grouped[e.summary].push(e);
  });

  // Show duplicates with start times
  Object.entries(grouped).forEach(([title, events]) => {
    if (events.length > 1) {
      console.log(`\n📅 ${title}:`);
      events.forEach(e => {
        const startTime = e.start?.dateTime || e.start?.date || 'No time';
        console.log(`  [${e.calendar_category}] Start: ${startTime}`);
        console.log(`    Dedup key: "${title.toLowerCase().trim()}|${startTime}"`);
      });
    }
  });
}

check();
