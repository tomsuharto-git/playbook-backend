/**
 * Daily Morning Podcast Generation Job
 * Scheduled to run at 6:30 AM ET every day (after Brief generation at 6:00 AM)
 *
 * Generates a conversational two-host podcast briefing covering:
 * - Today's calendar and meetings
 * - Urgent tasks by Work/Code/Life
 * - Recent project narrative updates
 * - Time/energy management recommendations
 */

const cron = require('node-cron');
const podcastGenerator = require('../services/podcast-generator');
const logger = require('../utils/logger').job('generate-podcast');

/**
 * Generate morning podcast with retry logic
 * @param {number} maxRetries - Maximum number of retry attempts
 * @returns {Promise<Object>} Result object with success status
 */
async function generateDailyPodcast(maxRetries = 3) {
  const today = new Date().toISOString().split('T')[0];
  logger.info('\n🎙️  [CRON] Generating morning podcast for ...', { today: today });

  let attempt = 0;
  let lastError = null;

  while (attempt < maxRetries) {
    try {
      if (attempt > 0) {
        logger.info('\n🔄 Retry attempt /...', { attempt: attempt, maxRetries - 1: maxRetries - 1 });
      }

      // Generate markdown and save to database
      const result = await podcastGenerator.generateMorningPodcast();

      logger.info('✅ Markdown generated ( chars)', { markdown_length: result.markdown_length });

      // Generate audio with Claude script + TTS (includes intro/outro music if available)
      if (process.env.ELEVENLABS_API_KEY && result.markdown) {
        logger.info('   🎙️  Generating audio with Claude script + TTS...');

        const audioResult = await podcastGenerator.generatePodcastWithClaudeScript(
          result.markdown,
          result.date
        );

        if (audioResult.success) {
          logger.info('✅ Podcast complete:', { audio_path: audioResult.audio_path });
          logger.info('⏱️  Duration: m s', { duration_seconds / 60): Math.floor(audioResult.duration_seconds / 60), duration_seconds % 60: audioResult.duration_seconds % 60 });

          // Update database with audio info
          const { supabase } = require('../db/supabase-client');
          await supabase
            .from('daily_podcasts')
            .update({
              audio_url: audioResult.audio_path,
              duration_seconds: audioResult.duration_seconds,
              file_size_bytes: audioResult.file_size_bytes,
              status: 'ready',
              completed_at: new Date().toISOString()
            })
            .eq('date', result.date);

          return {
            success: true,
            status: 'ready',
            audio_path: audioResult.audio_path,
            date: result.date,
            attempts: attempt + 1
          };
        } else {
          throw new Error('Audio generation failed');
        }

      } else {
        logger.warn('   ⚠️  ELEVENLABS_API_KEY not set');
        logger.debug('   📝 Markdown saved to database only');

        return {
          success: true,
          status: 'markdown_only',
          date: result.date,
          attempts: attempt + 1
        };
      }

    } catch (error) {
      lastError = error;
      attempt++;

      logger.error('❌ Attempt / failed:', { attempt: attempt, maxRetries: maxRetries });

      // Update database with current attempt info (but don't mark as failed yet if retries remain)
      if (attempt < maxRetries) {
        try {
          const { supabase } = require('../db/supabase-client');
          await supabase
            .from('daily_podcasts')
            .update({
              error_message: `Attempt ${attempt}/${maxRetries} failed: ${error.message}`
            })
            .eq('date', today);
        } catch (dbError) {
          // Ignore database update errors during retries
        }

        const delaySeconds = Math.pow(2, attempt); // 2s, 4s, 8s...
        logger.info('⏳ Retrying in  seconds...', { delaySeconds: delaySeconds });
        await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
      }
    }
  }

  // All retries exhausted - mark as failed in database
  logger.error('💥 All  attempts failed. Last error:', { maxRetries: maxRetries });

  // Update database to mark podcast as failed
  try {
    const { supabase } = require('../db/supabase-client');
    await supabase
      .from('daily_podcasts')
      .update({
        status: 'failed',
        error_message: lastError?.message || 'Unknown error - all retries exhausted',
        completed_at: new Date().toISOString()
      })
      .eq('date', today);

    logger.error('   💾 Database updated with failed status');
  } catch (dbError) {
    logger.error('   ⚠️  Failed to update database:', { arg0: dbError.message });
  }

  return {
    success: false,
    error: lastError?.message || 'Unknown error',
    attempts: maxRetries
  };
}

/**
 * Start the cron job
 */
function startPodcastSchedule(io) {
  logger.info('⏰ Daily podcast generation scheduled (6:30 AM ET)');

  // Schedule for 6:30 AM ET every day (30 min after Brief generation at 6:00 AM)
  cron.schedule('30 6 * * *', async () => {
    logger.info('\n⏰ [6:30am] Daily podcast generation triggered');

    const result = await generateDailyPodcast();

    // Emit event to frontend via Socket.io (if connected)
    if (io && result.success) {
      io.emit('podcast-generated', {
        date: result.date,
        status: result.status,
        project_id: result.project_id || null,
        timestamp: new Date().toISOString()
      });
    }
  }, {
    timezone: 'America/New_York'
  });
}

module.exports = {
  generateDailyPodcast,
  startPodcastSchedule
};
