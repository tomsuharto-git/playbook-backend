const logger = require('../../utils/logger');

require('dotenv').config();
const { supabase } = require('./db/supabase-client');

async function checkTodayForSchoolEvents() {
  logger.info('📅 Checking today (2025-10-13) for School events...\n');

  const { data, error } = await supabase
    .from('daily_briefs')
    .select('calendar_events')
    .eq('date', '2025-10-13')
    .single();

  if (error || !data) {
    logger.error('❌ No briefing found:');
    return;
  }

  const schoolEvents = data.calendar_events.filter(e =>
    e.project_name === 'School' ||
    e.summary?.toLowerCase().includes('school') ||
    e.summary?.toLowerCase().includes('no school')
  );

  if (schoolEvents.length === 0) {
    logger.warn('⚠️  No School-related events found today');
    return;
  }

  logger.info('Found  School-related events:\n', { length: schoolEvents.length });
  schoolEvents.forEach((event, idx) => {
    logger.info('.', { idx + 1: idx + 1, summary: event.summary });
    logger.info('Project:', { project_name || 'None': event.project_name || 'None' });
    logger.info('Has briefing:', { ai_briefing ? 'YES' : 'NO': event.ai_briefing ? 'YES' : 'NO' });
    if (event.ai_briefing) {
      logger.info('Briefing: ...', { substring(0, 150): event.ai_briefing.substring(0, 150) });
    }
    logger.info('');
  });
}

checkTodayForSchoolEvents().then(() => process.exit(0));
