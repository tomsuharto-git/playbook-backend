const logger = require('../../utils/logger');

const { supabase } = require('./db/supabase-client');

async function checkPodcastDetails() {
  logger.info('Checking recent podcasts...\n');

  const { data, error } = await supabase
    .from('daily_podcasts')
    .select('*')
    .order('date', { ascending: false })
    .limit(5);

  if (error) {
    logger.error('❌ Error:', { arg0: error.message });
    return;
  }

  logger.info('Recent podcast records:\n');
  data.forEach(podcast => {
    logger.info('═══════════════════════════════════════');
    logger.info('Date:', { date: podcast.date });
    logger.info('Status:', { status: podcast.status });
    logger.info('Created at:', { created_at || 'N/A': podcast.created_at || 'N/A' });
    logger.info('Completed at:', { completed_at || 'N/A': podcast.completed_at || 'N/A' });
    logger.info('Audio URL:', { audio_url || 'N/A': podcast.audio_url || 'N/A' });
    logger.info('Duration: ${podcast.duration_seconds ?');
    logger.info('Markdown length:  chars', { length : 0: podcast.markdown ? podcast.markdown.length : 0 });
    logger.info('ElevenLabs ID:', { elevenlabs_request_id || 'N/A': podcast.elevenlabs_request_id || 'N/A' });
    logger.info('');
  });
}

checkPodcastDetails().catch(error => {
  logger.error('❌ Script failed', { error: error.message, stack: error.stack });
}).finally(() => process.exit(0));
