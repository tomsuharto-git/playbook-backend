const { supabase } = require('./db/supabase-client');

async function checkPodcastDetails() {
  console.log('Checking recent podcasts...\n');

  const { data, error } = await supabase
    .from('daily_podcasts')
    .select('*')
    .order('date', { ascending: false })
    .limit(5);

  if (error) {
    console.log('❌ Error:', error.message);
    return;
  }

  console.log('Recent podcast records:\n');
  data.forEach(podcast => {
    console.log('═══════════════════════════════════════');
    console.log(`Date: ${podcast.date}`);
    console.log(`Status: ${podcast.status}`);
    console.log(`Created at: ${podcast.created_at || 'N/A'}`);
    console.log(`Completed at: ${podcast.completed_at || 'N/A'}`);
    console.log(`Audio URL: ${podcast.audio_url || 'N/A'}`);
    console.log(`Duration: ${podcast.duration_seconds ? `${Math.floor(podcast.duration_seconds / 60)}m ${podcast.duration_seconds % 60}s` : 'N/A'}`);
    console.log(`Markdown length: ${podcast.markdown ? podcast.markdown.length : 0} chars`);
    console.log(`ElevenLabs ID: ${podcast.elevenlabs_request_id || 'N/A'}`);
    console.log('');
  });
}

checkPodcastDetails().catch(console.error).finally(() => process.exit(0));
