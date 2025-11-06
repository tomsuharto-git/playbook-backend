const logger = require('../../utils/logger');

const { supabase } = require('./db/supabase-client');

(async () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const { data } = await supabase.from('daily_briefs').select('*').eq('date', today).single();

  const events = data?.calendar_events || [];

  logger.info('=== WORK/LIFE CATEGORIZATION STATUS ===\n');
  logger.info('Total events: \n', { length: events.length });

  // Check categorization logic
  const google = events.filter(e => e.calendar_category === 'Google');
  const outlookWithAttendees = events.filter(e => e.calendar_category === 'Outlook' && e.attendees?.length > 0);
  const outlookNoAttendees = events.filter(e => e.calendar_category === 'Outlook' && (!e.attendees || e.attendees.length === 0));

  logger.info('Google events (all → Life):', { length: google.length });
  logger.info('Outlook + attendees (→ Work):', { length: outlookWithAttendees.length });
  logger.info('Outlook + no attendees (→ AI assessed): \n', { length: outlookNoAttendees.length });

  if (outlookNoAttendees.length > 0) {
    logger.info('=== Outlook events without attendees (AI assessed) ===\n');
    outlookNoAttendees.forEach(e => {
      logger.info('📅 ""', { summary: e.summary });
      logger.info('Has project:', { project_name + ')' : 'NO': !!e.project_name ? 'YES (' + e.project_name + ')' : 'NO' });
      logger.info('Project context:', { project_work_life_context || 'NOT SET (defaults to Work)': e.project_work_life_context || 'NOT SET (defaults to Work)' });
      logger.info('Final classification:', { project_work_life_context === 'Life' ? '🏠 LIFE' : '💼 WORK': e.project_work_life_context === 'Life' ? '🏠 LIFE' : '💼 WORK' });
      logger.info('');
    });
  }

  logger.info('=== CATEGORIZATION LOGIC ===');
  logger.info('Rule 1: All Google Calendar events → Life (no AI briefings)');
  logger.info('Rule 2: Outlook + attendees → Work (with AI briefings)');
  logger.info('Rule 3: Outlook + no attendees → Check project_work_life_context field');
  logger.info('        - If project context = "Life" → Life (no briefing)');
  logger.info('        - Otherwise → Work (with briefing)');
  logger.info('');
  logger.info('✅ This logic is ACTIVE in generate-briefings.js:144-164\n');

  process.exit(0);
})();
