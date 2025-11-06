const logger = require('../../utils/logger');

require('dotenv').config();
const { supabase } = require('./db/supabase-client');

async function checkNoSchoolBriefing() {
  logger.info('📅 Checking "No School" briefing with new narrative context...\n');

  const { data, error } = await supabase
    .from('daily_briefs')
    .select('calendar_events')
    .eq('date', '2025-10-13')
    .single();

  if (error || !data) {
    logger.error('❌ Error:');
    return;
  }

  const noSchool = data.calendar_events.find(e =>
    e.summary === 'No School'
  );

  if (!noSchool) {
    logger.error('❌ No School event not found');
    return;
  }

  logger.info('📚 No School Event:');
  logger.info('   Project:', { arg0: noSchool.project_name });
  logger.info('   Has briefing:');
  logger.debug('\n📝 Full Briefing:\n');
  logger.info(noSchool.ai_briefing || 'No briefing available');
}

checkNoSchoolBriefing().then(() => process.exit(0));
