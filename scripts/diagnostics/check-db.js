require('dotenv').config();
const { supabase } = require('./db/supabase-client');

async function check() {
  const { data, error } = await supabase
    .from('daily_briefs')
    .select('date, calendar_events')
    .in('date', ['2025-10-12', '2025-10-13'])
    .order('date');

  if (error) {
    console.error('Error:', error);
    return;
  }

  data.forEach(row => {
    const outlook = row.calendar_events.filter(e => e.calendar_category === 'Outlook');
    const gmail = row.calendar_events.filter(e => e.calendar_category !== 'Outlook');
    console.log(`${row.date}: ${row.calendar_events.length} total (${outlook.length} Outlook + ${gmail.length} Gmail)`);

    if (outlook.length > 0) {
      console.log('  Outlook events:');
      outlook.slice(0, 5).forEach(e => console.log(`    - ${e.summary}`));
    }
  });
}

check();
