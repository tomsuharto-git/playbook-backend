require('dotenv').config();
const { supabase } = require('./db/supabase-client');

async function checkNoSchoolBriefing() {
  console.log('📅 Checking "No School" briefing with new narrative context...\n');

  const { data, error } = await supabase
    .from('daily_briefs')
    .select('calendar_events')
    .eq('date', '2025-10-13')
    .single();

  if (error || !data) {
    console.error('❌ Error:', error?.message);
    return;
  }

  const noSchool = data.calendar_events.find(e =>
    e.summary === 'No School'
  );

  if (!noSchool) {
    console.log('❌ No School event not found');
    return;
  }

  console.log('📚 No School Event:');
  console.log('   Project:', noSchool.project_name);
  console.log('   Has briefing:', noSchool.ai_briefing ? 'YES' : 'NO');
  console.log('\n📝 Full Briefing:\n');
  console.log(noSchool.ai_briefing || 'No briefing available');
}

checkNoSchoolBriefing().then(() => process.exit(0));
