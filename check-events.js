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
      console.log(`\n${day.date}: ${day.calendar_events.length} events`);
      const googleCount = day.calendar_events.filter(e => e.calendar_category !== 'Outlook').length;
      const outlookCount = day.calendar_events.filter(e => e.calendar_category === 'Outlook').length;
      console.log(`  Google: ${googleCount}, Outlook: ${outlookCount}`);

      // Sample first 10 Outlook events
      console.log('\n  First 10 Outlook events:');
      day.calendar_events
        .filter(e => e.calendar_category === 'Outlook')
        .slice(0, 10)
        .forEach((e, i) => {
          console.log(`    ${i+1}. ${e.summary || '(NO SUMMARY FIELD)'}`);
          if (!e.summary && e.subject) console.log(`       subject field: ${e.subject}`);
          if (!e.summary) {
            const keys = Object.keys(e).slice(0, 10);
            console.log(`       available fields: ${keys.join(', ')}`);
          }
        });
    });
  }
  process.exit(0);
})();
