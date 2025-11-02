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

  console.log('\n🔍 Found Christine tasks:', tasks);

  if (tasks && tasks.length > 1) {
    // Keep the most recent, delete the other
    const toDelete = tasks[1];
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', toDelete.id);

    if (error) {
      console.error('❌ Error:', error);
    } else {
      console.log(`\n✅ Deleted older task: "${toDelete.title}"`);
      console.log(`✅ Kept most recent: "${tasks[0].title}"`);
      console.log('\n💡 Now only 1 Christine task remains!\n');
    }
  }
  process.exit(0);
}

removeDuplicate().catch(err => {
  console.error(err);
  process.exit(1);
});
