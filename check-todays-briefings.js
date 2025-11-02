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

  const eventsWithProjects = data.calendar_events.filter(e => e.project_name);
  console.log(`\nFound ${eventsWithProjects.length} events with projects:\n`);

  eventsWithProjects.slice(0, 3).forEach(e => {
    console.log(`📅 ${e.summary}`);
    console.log(`   Project: ${e.project_name}`);
    console.log(`   Has briefing: ${e.ai_briefing ? 'YES' : 'NO'}`);
    if (e.ai_briefing) {
      console.log(`   Briefing preview:\n   ${e.ai_briefing.substring(0, 400)}\n`);
    }
  });

  process.exit(0);
})();
