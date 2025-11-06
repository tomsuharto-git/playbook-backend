const { supabase } = require('./db/supabase-client');

(async () => {
  const { data, error } = await supabase
    .from('daily_briefs')
    .select('date, calendar_events')
    .in('date', ['2025-10-12', '2025-10-13']);

  if (error) {
    console.error('Error:', error);
  } else {
    data.forEach(day => {
      const outlookEvents = day.calendar_events.filter(e => e.calendar_category === 'Outlook');

      console.log(`\n${'='.repeat(60)}`);
      console.log(`${day.date}: ${outlookEvents.length} Outlook events`);
      console.log('='.repeat(60));

      outlookEvents.forEach((e, i) => {
        const title = e.subject || e.summary || '(NO TITLE)';
        const startTime = e.start?.dateTime || e.start?.date || 'No time';
        const endTime = e.end?.dateTime || e.end?.date || 'No time';

        console.log(`\n${i+1}. ${title}`);
        console.log(`   Start: ${startTime}`);
        console.log(`   End: ${endTime}`);
        console.log(`   ID: ${e.id}`);
      });
    });
  }
  process.exit(0);
})();
