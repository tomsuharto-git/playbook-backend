const { supabase } = require('./db/supabase-client');

(async () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  console.log('Checking briefings for:', today);

  const { data, error } = await supabase
    .from('daily_briefs')
    .select('calendar_events')
    .eq('date', today)
    .single();

  if (error || !data) {
    console.log('No briefings found for today');
    process.exit(0);
  }

  const eventsWithBriefings = data.calendar_events.filter(e => e.ai_briefing);
  console.log(`\nFound ${eventsWithBriefings.length} events WITH briefings:\n`);

  eventsWithBriefings.forEach(e => {
    console.log(`📅 ${e.summary}`);
    console.log(`   Project: ${e.project_name || 'None'}`);
    console.log(`   Calendar: ${e.calendar_category}`);
    console.log(`   Attendees: ${e.attendees?.length || 0}`);
    console.log(`   Briefing:\n   ${e.ai_briefing}\n`);
  });

  const eventsWithoutBriefings = data.calendar_events.filter(e => !e.ai_briefing);
  console.log(`\n\nFound ${eventsWithoutBriefings.length} events WITHOUT briefings:\n`);

  eventsWithoutBriefings.forEach(e => {
    console.log(`📅 ${e.summary}`);
    console.log(`   Project: ${e.project_name || 'None'}`);
    console.log(`   Calendar: ${e.calendar_category}`);
    console.log(`   Attendees: ${e.attendees?.length || 0}\n`);
  });

  process.exit(0);
})();
