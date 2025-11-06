const logger = require('../../utils/logger');

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function deleteTestNarrative() {
  logger.info('\n🗑️  Deleting test narrative entry...\n');

  const { data, error } = await supabase
    .from('meeting_notes')
    .delete()
    .eq('title', 'Test Narrative Log Creation')
    .select();

  if (error) {
    logger.error('❌ Error deleting:', { arg0: error });
    return;
  }

  if (data && data.length > 0) {
    logger.info('✅ Successfully deleted:');
    data.forEach(item => {
      logger.info('-  ()', { title: item.title, created_at: item.created_at });
    });
  } else {
    logger.warn('⚠️  No matching entry found');
  }
}

deleteTestNarrative();
