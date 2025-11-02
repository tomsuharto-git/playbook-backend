require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkBriefings() {
  console.log('🔍 Checking briefing data for today vs tomorrow...\n');

  // Get both days
  const { data, error } = await supabase
    .from('daily_briefs')
    .select('date, calendar_events')
    .in('date', ['2025-10-13', '2025-10-14'])
    .order('date');

  if (error) {
    console.error('Error:', error);
    return;
  }

  for (const day of data) {
    console.log(`📅 ${day.date}`);
    console.log(`   Total events: ${day.calendar_events?.length || 0}`);

    if (day.calendar_events && day.calendar_events.length > 0) {
      const eventsWithBriefings = day.calendar_events.filter(e => e.ai_briefing);
      const workEvents = day.calendar_events.filter(e => e.calendar_category === 'Outlook');
      const lifeEvents = day.calendar_events.filter(e => e.calendar_category === 'Google');

      console.log(`   Events with briefings: ${eventsWithBriefings.length}`);
      console.log(`   Work events: ${workEvents.length}`);
      console.log(`   Life events: ${lifeEvents.length}`);

      // Show first 3 events as examples
      console.log('\n   Sample events:');
      for (let i = 0; i < Math.min(3, day.calendar_events.length); i++) {
        const event = day.calendar_events[i];
        console.log(`   ${i + 1}. "${event.summary || event.subject}"`);
        console.log(`      - Category: ${event.calendar_category}`);
        console.log(`      - Has briefing: ${event.ai_briefing ? 'YES' : 'NO'}`);
        if (event.ai_briefing) {
          console.log(`      - Briefing preview: ${event.ai_briefing.substring(0, 80)}...`);
        }
      }
    }
    console.log('');
  }
}

checkBriefings().then(() => process.exit(0));
