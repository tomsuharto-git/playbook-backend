/**
 * Admin Routes
 * Administrative endpoints for database maintenance
 */

const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase-client');

/**
 * POST /api/admin/cleanup-no-title-events
 * Removes all calendar events with "No Title" from the database
 */
router.post('/cleanup-no-title-events', async (req, res) => {
  try {
    console.log('\n🧹 API: Starting cleanup of "No Title" events...\n');

    // First, count how many events will be deleted
    const { count: totalCount, error: countError } = await supabase
      .from('calendar_events')
      .select('*', { count: 'exact', head: true })
      .or('summary.eq.No Title,summary.eq.,summary.is.null');

    if (countError) {
      console.error('❌ Error counting events:', countError);
      return res.status(500).json({
        success: false,
        error: 'Failed to count events',
        details: countError.message
      });
    }

    console.log(`📊 Found ${totalCount} "No Title" events to delete`);

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
      console.log('📋 Example events to be deleted:');
      examples.forEach((event, i) => {
        console.log(`   ${i + 1}. "${event.summary || '(empty)'}" | ${event.calendar_category} | ${event.location || 'no location'}`);
      });
    }

    // Delete the events
    const { data: deleted, error: deleteError } = await supabase
      .from('calendar_events')
      .delete()
      .or('summary.eq.No Title,summary.eq.,summary.is.null')
      .select();

    if (deleteError) {
      console.error('❌ Error deleting events:', deleteError);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete events',
        details: deleteError.message
      });
    }

    const deletedCount = deleted?.length || 0;
    console.log(`✅ Successfully deleted ${deletedCount} "No Title" events`);

    // Verify cleanup
    const { count: remainingCount, error: verifyError } = await supabase
      .from('calendar_events')
      .select('*', { count: 'exact', head: true })
      .or('summary.eq.No Title,summary.eq.,summary.is.null');

    const isClean = !verifyError && remainingCount === 0;
    console.log(`🔍 Verification: ${remainingCount} "No Title" events remaining`);

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
    console.error('❌ Unexpected error:', error);
    return res.status(500).json({
      success: false,
      error: 'Unexpected error during cleanup',
      details: error.message
    });
  }
});

module.exports = router;
