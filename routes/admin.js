/**
 * Admin Routes
 * Administrative endpoints for database maintenance
 */

const express = require('express');
const logger = require('../utils/logger').route('admin');
const router = express.Router();
const { supabase } = require('../db/supabase-client');

/**
 * POST /api/admin/cleanup-no-title-events
 * Removes all calendar events with "No Title" from the database
 */
router.post('/cleanup-no-title-events', async (req, res) => {
  try {
    logger.info('\n🧹 API: Starting cleanup of "No Title" events...\n');

    // First, count how many events will be deleted
    const { count: totalCount, error: countError } = await supabase
      .from('calendar_events')
      .select('*', { count: 'exact', head: true })
      .or('summary.eq.No Title,summary.eq.,summary.is.null');

    if (countError) {
      logger.error('❌ Error counting events:', { arg0: countError });
      return res.status(500).json({
        success: false,
        error: 'Failed to count events',
        details: countError.message
      });
    }

    logger.debug('📊 Found  "No Title" events to delete', { totalCount: totalCount });

    if (totalCount === 0) {
      return res.json({
        success: true,
        deleted: 0,
        message: 'No "No Title" events found. Database is already clean!'
      });
    }

    // Show some examples before deleting
    const { data: examples, error: exampleError } = await supabase
      .from('calendar_events')
      .select('id, summary, location, calendar_category')
      .or('summary.eq.No Title,summary.eq.,summary.is.null')
      .limit(5);

    if (!exampleError && examples) {
      logger.info('📋 Example events to be deleted:');
      examples.forEach((event, i) => {
        logger.info('. "" |  |', { i + 1: i + 1, summary || '(empty)': event.summary || '(empty)', calendar_category: event.calendar_category, location || 'no location': event.location || 'no location' });
      });
    }

    // Delete the events
    const { data: deleted, error: deleteError } = await supabase
      .from('calendar_events')
      .delete()
      .or('summary.eq.No Title,summary.eq.,summary.is.null')
      .select();

    if (deleteError) {
      logger.error('❌ Error deleting events:', { arg0: deleteError });
      return res.status(500).json({
        success: false,
        error: 'Failed to delete events',
        details: deleteError.message
      });
    }

    const deletedCount = deleted?.length || 0;
    logger.info('✅ Successfully deleted  "No Title" events', { deletedCount: deletedCount });

    // Verify cleanup
    const { count: remainingCount, error: verifyError } = await supabase
      .from('calendar_events')
      .select('*', { count: 'exact', head: true })
      .or('summary.eq.No Title,summary.eq.,summary.is.null');

    const isClean = !verifyError && remainingCount === 0;
    logger.debug('🔍 Verification:  "No Title" events remaining', { remainingCount: remainingCount });

    return res.json({
      success: true,
      deleted: deletedCount,
      remaining: remainingCount,
      isClean,
      message: isClean
        ? 'Cleanup complete! All "No Title" events removed.'
        : 'Cleanup completed, but some "No Title" events still remain.'
    });

  } catch (error) {
    logger.error('❌ Unexpected error:', { arg0: error });
    return res.status(500).json({
      success: false,
      error: 'Unexpected error during cleanup',
      details: error.message
    });
  }
});

module.exports = router;
