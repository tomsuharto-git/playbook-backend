/**
 * Podcast API Routes
 *
 * Endpoints:
 * - POST /api/podcast/generate - Manual trigger for podcast generation
 * - POST /api/podcast/webhook - Webhook from ElevenLabs when conversion completes
 * - GET /api/podcast/latest - Get today's podcast
 * - GET /api/podcast/:date - Get podcast for specific date
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const podcastGenerator = require('../services/podcast-generator');
const logger = require('../utils/logger').route('podcast');
const { supabase } = require('../db/supabase-client');

/**
 * POST /api/podcast/generate
 * Manually trigger podcast generation for today
 */
router.post('/generate', async (req, res) => {
  try {
    logger.info('\n📡 Manual podcast generation triggered');

    // Generate markdown and save to database
    const result = await podcastGenerator.generateMorningPodcast();

    // Get markdown from either field name
    const markdown = result.markdown || result.markdown_content;

    if (!markdown) {
      throw new Error('Failed to generate podcast markdown');
    }

    // Check if we have required API keys and voice IDs
    const hasRequiredKeys = process.env.ELEVENLABS_API_KEY &&
                           process.env.ANTHROPIC_API_KEY &&
                           process.env.PODCAST_VOICE_1 &&
                           process.env.PODCAST_VOICE_2;

    if (!hasRequiredKeys) {
      logger.warn('   ⚠️  Missing required API keys or voice IDs');
      return res.json({
        success: true,
        date: result.date,
        status: 'markdown_only',
        message: 'Markdown generated. Set ELEVENLABS_API_KEY, ANTHROPIC_API_KEY, PODCAST_VOICE_1, and PODCAST_VOICE_2 to generate audio.',
        markdown_preview: markdown.substring(0, 500) + '...',
        markdown_length: markdown.length
      });
    }

    // Generate podcast using Claude script + TTS pipeline
    logger.info('   🎙️  Starting podcast audio generation...');

    const audioResult = await podcastGenerator.generatePodcastWithClaudeScript(
      markdown,
      result.date
    );

    logger.info('✅ Podcast audio generated successfully');

    // Update database with audio metadata
    await supabase
      .from('daily_podcasts')
      .update({
        audio_url: audioResult.audio_path, // Local file path for now
        duration_seconds: audioResult.duration_seconds,
        file_size_bytes: audioResult.file_size_bytes,
        status: 'ready',
        completed_at: new Date().toISOString()
      })
      .eq('date', result.date);

    res.json({
      success: true,
      date: result.date,
      status: 'ready',
      message: 'Podcast generated successfully!',
      audio_path: audioResult.audio_path,
      duration_seconds: audioResult.duration_seconds,
      dialogue_count: audioResult.dialogue_count,
      markdown_preview: markdown.substring(0, 300) + '...'
    });

  } catch (error) {
    logger.error('   ❌ Podcast generation error:', { arg0: error.message });
    logger.error('   Stack:', { arg0: error.stack });

    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to generate podcast'
    });
  }
});

/**
 * POST /api/podcast/webhook
 * Webhook endpoint for ElevenLabs to notify when podcast is ready
 */
router.post('/webhook', async (req, res) => {
  try {
    logger.info('\n📡 Webhook received from ElevenLabs');
    logger.info('   Body:', { arg1: null });

    const { project_id, status, audio_url, duration_seconds, file_size_bytes } = req.body;

    if (!project_id) {
      throw new Error('Missing project_id in webhook payload');
    }

    // Find podcast by project_id
    const { data: podcast, error: findError } = await supabase
      .from('daily_podcasts')
      .select('*')
      .eq('project_id', project_id)
      .single();

    if (findError || !podcast) {
      logger.error('   ❌ Podcast not found for project_id:', { arg0: project_id });
      return res.status(404).json({
        success: false,
        error: 'Podcast not found'
      });
    }

    // Update podcast status
    const updates = {
      status: status === 'completed' ? 'ready' : 'failed',
      completed_at: new Date().toISOString()
    };

    if (audio_url) updates.audio_url = audio_url;
    if (duration_seconds) updates.duration_seconds = duration_seconds;
    if (file_size_bytes) updates.file_size_bytes = file_size_bytes;
    if (status === 'failed') updates.error_message = 'ElevenLabs generation failed';

    const { error: updateError } = await supabase
      .from('daily_podcasts')
      .update(updates)
      .eq('id', podcast.id);

    if (updateError) {
      throw new Error(`Database update failed: ${updateError.message}`);
    }

    logger.info('✅ Podcast  updated to:', { date: podcast.date, status: updates.status });
    if (audio_url) logger.info('🎧 Audio URL:', { audio_url: audio_url });

    res.json({
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error) {
    logger.error('   ❌ Webhook error:', { arg0: error.message });

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/podcast/health
 * Health check endpoint - checks if today's podcast was generated
 */
router.get('/health', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Check today's podcast
    const { data: todayPodcast } = await supabase
      .from('daily_podcasts')
      .select('status, generated_at, completed_at, error_message')
      .eq('date', today)
      .single();

    // Get last 7 days to check consistency
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    const { data: recentPodcasts, count: totalCount } = await supabase
      .from('daily_podcasts')
      .select('date, status', { count: 'exact' })
      .gte('date', sevenDaysAgoStr)
      .order('date', { ascending: false });

    const successCount = recentPodcasts?.filter(p => p.status === 'ready').length || 0;
    const successRate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0;

    res.json({
      healthy: todayPodcast?.status === 'ready',
      today: {
        generated: !!todayPodcast,
        status: todayPodcast?.status || 'not_generated',
        generated_at: todayPodcast?.generated_at,
        completed_at: todayPodcast?.completed_at,
        error: todayPodcast?.error_message || null
      },
      last_7_days: {
        total: totalCount,
        successful: successCount,
        success_rate: successRate,
        recent: recentPodcasts?.slice(0, 5).map(p => ({
          date: p.date,
          status: p.status
        }))
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Health check error:', { arg0: error.message });

    res.status(500).json({
      healthy: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/podcast/latest
 * Get today's podcast (or most recent)
 */
router.get('/latest', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Try to get today's podcast first
    let { data: podcast } = await supabase
      .from('daily_podcasts')
      .select('*')
      .eq('date', today)
      .single();

    // If no podcast for today, get the most recent
    if (!podcast) {
      const { data: recentPodcasts } = await supabase
        .from('daily_podcasts')
        .select('*')
        .order('date', { ascending: false })
        .limit(1);

      podcast = recentPodcasts?.[0];
    }

    if (!podcast) {
      return res.status(404).json({
        success: false,
        message: 'No podcasts found'
      });
    }

    res.json({
      success: true,
      podcast: {
        date: podcast.date,
        status: podcast.status,
        audio_url: podcast.audio_url,
        duration_seconds: podcast.duration_seconds,
        generated_at: podcast.generated_at,
        completed_at: podcast.completed_at,
        // Only include markdown in response if requested
        ...(req.query.include_markdown === 'true' && {
          markdown_preview: podcast.markdown_content?.substring(0, 1000)
        })
      }
    });

  } catch (error) {
    logger.error('Get latest podcast error:', { arg0: error.message });

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/podcast/:date
 * Get podcast for specific date (YYYY-MM-DD)
 */
router.get('/:date', async (req, res) => {
  try {
    const { date } = req.params;

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Use YYYY-MM-DD'
      });
    }

    const { data: podcast, error } = await supabase
      .from('daily_podcasts')
      .select('*')
      .eq('date', date)
      .single();

    if (error || !podcast) {
      return res.status(404).json({
        success: false,
        message: `No podcast found for ${date}`
      });
    }

    res.json({
      success: true,
      podcast: {
        date: podcast.date,
        status: podcast.status,
        audio_url: podcast.audio_url,
        duration_seconds: podcast.duration_seconds,
        generated_at: podcast.generated_at,
        completed_at: podcast.completed_at,
        // Only include markdown if requested
        ...(req.query.include_markdown === 'true' && {
          markdown: podcast.markdown_content
        })
      }
    });

  } catch (error) {
    logger.error('Get podcast error:', { arg0: error.message });

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/podcast/audio/:date
 * Serve podcast audio file for specific date
 */
router.get('/audio/:date', async (req, res) => {
  try {
    const { date } = req.params;

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Use YYYY-MM-DD'
      });
    }

    // Get podcast record from database
    const { data: podcast, error } = await supabase
      .from('daily_podcasts')
      .select('audio_url, status')
      .eq('date', date)
      .single();

    if (error || !podcast) {
      return res.status(404).json({
        success: false,
        message: `No podcast found for ${date}`
      });
    }

    if (podcast.status !== 'ready') {
      return res.status(404).json({
        success: false,
        message: `Podcast for ${date} is not ready yet (status: ${podcast.status})`
      });
    }

    if (!podcast.audio_url) {
      return res.status(404).json({
        success: false,
        message: `No audio file available for ${date}`
      });
    }

    // Serve the file (convert to absolute path if needed)
    const audioPath = podcast.audio_url;
    const absolutePath = path.isAbsolute(audioPath)
      ? audioPath
      : path.join(__dirname, '..', audioPath);

    res.sendFile(absolutePath, error => {
      if (error) {
        logger.error('❌ Error serving audio file:', { message: error.message });
        if (!res.headersSent) {
          res.status(404).json({
            success: false,
            error: 'Audio file not found'
          });
        }
      }
    });

  } catch (error) {
    logger.error('Serve audio error:', { arg0: error.message });

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
