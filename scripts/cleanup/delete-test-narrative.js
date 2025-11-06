const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function deleteTestNarrative() {
  console.log('\n🗑️  Deleting test narrative entry...\n');

  const { data, error } = await supabase
    .from('meeting_notes')
    .delete()
    .eq('title', 'Test Narrative Log Creation')
    .select();

  if (error) {
    console.error('❌ Error deleting:', error);
    return;
  }

  if (data && data.length > 0) {
    console.log('✅ Successfully deleted:');
    data.forEach(item => {
      console.log(`   - ${item.title} (${item.created_at})`);
    });
  } else {
    console.log('⚠️  No matching entry found');
  }
}

deleteTestNarrative();
