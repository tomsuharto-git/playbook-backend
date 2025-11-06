const logger = require('../../utils/logger');

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function removeDuplicate() {
  // Find both Christine tasks
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, created_at')
    .or('title.eq.Share phone number with Christine,title.eq.Send phone number to Christine')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  logger.debug('\n🔍 Found Christine tasks:', { arg0: tasks });

  if (tasks && tasks.length > 1) {
    // Keep the most recent, delete the other
    const toDelete = tasks[1];
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', toDelete.id);

    if (error) {
      logger.error('❌ Error:', { arg0: error });
    } else {
      logger.info('\n✅ Deleted older task: ""', { title: toDelete.title });
      logger.info('✅ Kept most recent: ""', { title: tasks[0].title });
      logger.info('\n💡 Now only 1 Christine task remains!\n');
    }
  }
  process.exit(0);
}

removeDuplicate().catch(err => {
  logger.error(err);
  process.exit(1);
});
