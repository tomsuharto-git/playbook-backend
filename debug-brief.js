const { supabase } = require('./db/supabase-client');

(async () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  console.log('Checking Brief for:', today);

  const { data, error } = await supabase
    .from('daily_briefs')
    .select('*')
    .eq('date', today)
    .single();

  if (error) {
    console.log('Error:', error.message);
    process.exit(1);
  }

  if (!data) {
    console.log('No brief found for today');
    process.exit(0);
  }

  const events = data.calendar_events || [];
  console.log('\nTotal events:', events.length);

  console.log('\n=== ALL EVENTS ===');
  events.forEach((e, i) => {
    console.log(`${i+1}. "${e.summary}" - ${e.start?.dateTime || e.start?.date || 'NO TIME'}`);
    console.log(`   Category: ${e.calendar_category || 'unknown'}`);
    console.log(`   Attendees: ${e.attendees?.length || 0}`);
  });

  const invalidEvents = events.filter(e => {
    const title = e.summary || '';
    return !title || title.trim() === '' || title === 'No Title' || !e.start?.dateTime && !e.start?.date;
  });

  console.log('\n=== INVALID EVENTS ===');
  console.log('Found:', invalidEvents.length);
  invalidEvents.forEach(e => {
    console.log('  - Title:', e.summary || 'EMPTY');
    console.log('    Time:', e.start?.dateTime || e.start?.date || 'NO TIME');
  });

  process.exit(0);
})();
