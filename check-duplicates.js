require('dotenv').config();
const { supabase } = require('./db/supabase-client');

async function check() {
  const { data } = await supabase
    .from('daily_briefs')
    .select('calendar_events')
    .eq('date', '2025-10-13')
    .single();

  const gmailEvents = data.calendar_events.filter(e => e.calendar_category !== 'Outlook');
  const outlookEvents = data.calendar_events.filter(e => e.calendar_category === 'Outlook');

  console.log('Checking why deduplication failed:\n');

  // Check one duplicate pair
  const gmailBaileys = gmailEvents.find(e => e.summary?.includes('Baileys'));
  const outlookBaileys = outlookEvents.find(e => e.summary?.includes('Baileys'));

  if (gmailBaileys && outlookBaileys) {
    console.log('Gmail Baileys event:');
    console.log(`  summary: "${gmailBaileys.summary}"`);
    console.log(`  start.dateTime: ${gmailBaileys.start?.dateTime}`);
    console.log(`  start.date: ${gmailBaileys.start?.date}`);

    console.log('\nOutlook Baileys event:');
    console.log(`  summary: "${outlookBaileys.summary}"`);
    console.log(`  start.dateTime: ${outlookBaileys.start?.dateTime}`);
    console.log(`  start.date: ${outlookBaileys.start?.date}`);

    const gmailKey = `${(gmailBaileys.summary || '').toLowerCase().trim()}|${gmailBaileys.start?.dateTime || gmailBaileys.start?.date || ''}`;
    const outlookKey = `${(outlookBaileys.summary || '').toLowerCase().trim()}|${outlookBaileys.start?.dateTime || outlookBaileys.start?.date || ''}`;

    console.log('\nDeduplication keys:');
    console.log(`  Gmail:   "${gmailKey}"`);
    console.log(`  Outlook: "${outlookKey}"`);
    console.log(`  Match:   ${gmailKey === outlookKey}`);
  }
}

check();
