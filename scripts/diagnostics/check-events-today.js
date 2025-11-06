const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function checkEvents() {
  const today = '2025-10-29';
  const tomorrow = '2025-10-30';

  console.log('\nChecking events for Oct 29-30, 2025...\n');

  const { data: events, error } = await supabase
    .from('events')
    .select('id, title, start_time, end_time, calendar_source')
    .gte('start_time', today + 'T00:00:00Z')
    .lte('start_time', tomorrow + 'T23:59:59Z')
    .order('start_time');

  if (error) {
    console.error('Error:', error);
    return;
  }

  const count = events ? events.length : 0;
  console.log(`Found ${count} events:\n`);

  if (events) {
    events.forEach(e => {
      console.log(`- ${e.title} (${e.calendar_source})`);
      console.log(`  ${e.start_time}`);
    });
  }
}

checkEvents();
