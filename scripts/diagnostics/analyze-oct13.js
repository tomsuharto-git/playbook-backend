require('dotenv').config();
const { supabase } = require('./db/supabase-client');

async function check() {
  const { data } = await supabase
    .from('daily_briefs')
    .select('calendar_events')
    .eq('date', '2025-10-13')
    .single();

  const gmailEvents = data.calendar_events.filter(e => e.calendar_category !== 'Outlook');

  console.log('Analyzing Gmail events on Oct 13:\n');

  // Check multi-day events
  const multiDay = gmailEvents.filter(e => {
    if (!e.start?.date || e.start?.dateTime) return false;
    const start = e.start.date;
    const end = e.end?.date;
    return start !== end;
  });

  console.log('Multi-day all-day events:');
  multiDay.forEach(e => {
    console.log(`  - ${e.summary}`);
    console.log(`    Start: ${e.start.date}`);
    console.log(`    End: ${e.end.date}`);
  });

  // Check late-night events
  const lateNight = gmailEvents.filter(e => {
    const time = e.start?.dateTime;
    if (!time) return false;
    const date = new Date(time);
    const etFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
    const etDate = etFormatter.format(date);
    return etDate !== '2025-10-13';
  });

  console.log('\nEvents with wrong date (timezone issue):');
  lateNight.forEach(e => {
    const time = e.start?.dateTime;
    const date = new Date(time);
    const etFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
    const etDate = etFormatter.format(date);
    console.log(`  - ${e.summary}`);
    console.log(`    Stored time: ${time}`);
    console.log(`    Actual ET date: ${etDate}`);
  });

  // Check duplicates
  const outlookEvents = data.calendar_events.filter(e => e.calendar_category === 'Outlook');
  const duplicates = gmailEvents.filter(gmail =>
    outlookEvents.some(outlook =>
      (gmail.summary || '').toLowerCase().trim() === (outlook.summary || '').toLowerCase().trim()
    )
  );

  console.log('\nDuplicates (exist in both Gmail and Outlook):');
  duplicates.forEach(e => console.log(`  - ${e.summary}`));

  console.log(`\nSummary:`);
  console.log(`  Total Gmail events: ${gmailEvents.length}`);
  console.log(`  Multi-day spanning: ${multiDay.length}`);
  console.log(`  Wrong date (late-night): ${lateNight.length}`);
  console.log(`  Duplicates: ${duplicates.length}`);
  console.log(`  Correct unique events: ${gmailEvents.length - lateNight.length - duplicates.length}`);
}

check();
