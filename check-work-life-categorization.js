const { supabase } = require('./db/supabase-client');

(async () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const { data } = await supabase.from('daily_briefs').select('*').eq('date', today).single();

  const events = data?.calendar_events || [];

  console.log('=== WORK/LIFE CATEGORIZATION STATUS ===\n');
  console.log(`Total events: ${events.length}\n`);

  // Check categorization logic
  const google = events.filter(e => e.calendar_category === 'Google');
  const outlookWithAttendees = events.filter(e => e.calendar_category === 'Outlook' && e.attendees?.length > 0);
  const outlookNoAttendees = events.filter(e => e.calendar_category === 'Outlook' && (!e.attendees || e.attendees.length === 0));

  console.log(`Google events (all → Life): ${google.length}`);
  console.log(`Outlook + attendees (→ Work): ${outlookWithAttendees.length}`);
  console.log(`Outlook + no attendees (→ AI assessed): ${outlookNoAttendees.length}\n`);

  if (outlookNoAttendees.length > 0) {
    console.log('=== Outlook events without attendees (AI assessed) ===\n');
    outlookNoAttendees.forEach(e => {
      console.log(`📅 "${e.summary}"`);
      console.log(`   Has project: ${!!e.project_name ? 'YES (' + e.project_name + ')' : 'NO'}`);
      console.log(`   Project context: ${e.project_work_life_context || 'NOT SET (defaults to Work)'}`);
      console.log(`   Final classification: ${e.project_work_life_context === 'Life' ? '🏠 LIFE' : '💼 WORK'}`);
      console.log('');
    });
  }

  console.log('=== CATEGORIZATION LOGIC ===');
  console.log('Rule 1: All Google Calendar events → Life (no AI briefings)');
  console.log('Rule 2: Outlook + attendees → Work (with AI briefings)');
  console.log('Rule 3: Outlook + no attendees → Check project_work_life_context field');
  console.log('        - If project context = "Life" → Life (no briefing)');
  console.log('        - Otherwise → Work (with briefing)');
  console.log('');
  console.log('✅ This logic is ACTIVE in generate-briefings.js:144-164\n');

  process.exit(0);
})();
