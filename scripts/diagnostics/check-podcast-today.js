const logger = require('../../utils/logger');

const { supabase } = require('./db/supabase-client');

async function checkTodayPodcast() {
  const today = new Date().toISOString().split('T')[0];
  logger.info('Checking for podcast on ...\n', { today: today });

  const { data, error } = await supabase
    .from('daily_podcasts')
    .select('*')
    .eq('date', today)
    .single();

  if (error) {
    logger.error('❌ No podcast found for today');
    logger.error('Error:', { arg0: error.message });
    return;
  }

  logger.info('✅ Podcast record found:');
  logger.info('Date:', { arg0: data.date });
  logger.info('Status:', { arg0: data.status });
  logger.info('Created at:', { arg0: data.created_at });
  logger.info('Completed at:', { arg0: data.completed_at });
  logger.info('Audio URL:', { arg0: data.audio_url });
  logger.info('m s', { duration_seconds / 60): Math.floor(data.duration_seconds / 60), duration_seconds % 60: data.duration_seconds % 60 });
}

checkTodayPodcast().catch(error => {
  logger.error('❌ Script failed', { error: error.message, stack: error.stack });
}).finally(() => process.exit(0));
