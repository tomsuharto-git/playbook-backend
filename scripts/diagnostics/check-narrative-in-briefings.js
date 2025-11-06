require('dotenv').config();
const { supabase } = require('./db/supabase-client');

async function checkBriefing() {
  console.log('🔍 Checking if briefings include narrative context...\n');

  // Get today's briefings
  const { data, error } = await supabase
    .from('daily_briefs')
    .select('calendar_events')
    .eq('date', '2025-10-13')
    .single();

  if (error || !data) {
    console.error('No briefings found:', error?.message);
    return;
  }

  // Find events with projects that have narratives
  const eventsWithProjects = data.calendar_events.filter(e =>
    ['Baileys', 'ITA Airlines', 'Therabody', '72andSunny', 'Nuveen', 'TIAA'].includes(e.project_name)
  );

  console.log(`Found ${eventsWithProjects.length} events with narrative-rich projects\n`);

  eventsWithProjects.forEach(event => {
    console.log(`📅 ${event.summary}`);
    console.log(`   Project: ${event.project_name}`);
    console.log(`   Has briefing: ${event.ai_briefing ? 'YES' : 'NO'}`);
    if (event.ai_briefing) {
      const briefingPreview = event.ai_briefing.substring(0, 600);
      console.log(`   Briefing preview:\n${briefingPreview}...\n`);
    }
  });
}

checkBriefing().then(() => process.exit(0));
