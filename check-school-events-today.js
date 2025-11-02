require('dotenv').config();
const { supabase } = require('./db/supabase-client');

async function checkTodayForSchoolEvents() {
  console.log('📅 Checking today (2025-10-13) for School events...\n');

  const { data, error } = await supabase
    .from('daily_briefs')
    .select('calendar_events')
    .eq('date', '2025-10-13')
    .single();

  if (error || !data) {
    console.error('❌ No briefing found:', error?.message);
    return;
  }

  const schoolEvents = data.calendar_events.filter(e =>
    e.project_name === 'School' ||
    e.summary?.toLowerCase().includes('school') ||
    e.summary?.toLowerCase().includes('no school')
  );

  if (schoolEvents.length === 0) {
    console.log('⚠️  No School-related events found today');
    return;
  }

  console.log(`Found ${schoolEvents.length} School-related events:\n`);
  schoolEvents.forEach((event, idx) => {
    console.log(`${idx + 1}. ${event.summary}`);
    console.log(`   Project: ${event.project_name || 'None'}`);
    console.log(`   Has briefing: ${event.ai_briefing ? 'YES' : 'NO'}`);
    if (event.ai_briefing) {
      console.log(`   Briefing: ${event.ai_briefing.substring(0, 150)}...`);
    }
    console.log('');
  });
}

checkTodayForSchoolEvents().then(() => process.exit(0));
