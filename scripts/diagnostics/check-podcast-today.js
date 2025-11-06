const { supabase } = require('./db/supabase-client');

async function checkTodayPodcast() {
  const today = new Date().toISOString().split('T')[0];
  console.log(`Checking for podcast on ${today}...\n`);

  const { data, error } = await supabase
    .from('daily_podcasts')
    .select('*')
    .eq('date', today)
    .single();

  if (error) {
    console.log('❌ No podcast found for today');
    console.log('Error:', error.message);
    return;
  }

  console.log('✅ Podcast record found:');
  console.log('Date:', data.date);
  console.log('Status:', data.status);
  console.log('Created at:', data.created_at);
  console.log('Completed at:', data.completed_at);
  console.log('Audio URL:', data.audio_url);
  console.log('Duration:', data.duration_seconds ? `${Math.floor(data.duration_seconds / 60)}m ${data.duration_seconds % 60}s` : 'N/A');
}

checkTodayPodcast().catch(console.error).finally(() => process.exit(0));
