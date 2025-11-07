/**
 * Admin Routes
 * Administrative endpoints for database maintenance
 */

const express = require('express');
const logger = require('../utils/logger').route('admin');
const router = express.Router();
const { supabase } = require('../db/supabase-client');

/**
 * GET /api/admin/dashboard
 * Comprehensive admin dashboard with system health, stats, and activity monitoring
 */
router.get('/dashboard', async (req, res) => {
  try {
    logger.info('📊 Fetching admin dashboard data...');
    const startTime = Date.now();

    // Parallel data fetching for performance
    const [systemHealth, entityStats, recentActivity, jobStatus, performanceMetrics] = await Promise.all([
      getSystemHealth(),
      getEntityStatistics(),
      getRecentActivity(),
      getJobStatus(),
      getPerformanceMetrics()
    ]);

    const responseTime = Date.now() - startTime;

    res.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      data: { systemHealth, entityStats, recentActivity, jobStatus, performanceMetrics }
    });

    const respTimeMs = responseTime;
    logger.info('✅ Admin dashboard data fetched', { responseTime: respTimeMs });
  } catch (error) {
    logger.error('❌ Error fetching admin dashboard:', { error });
    res.status(500).json({ status: 'error', message: 'Failed to fetch dashboard data', error: error.message });
  }
});

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

// =============================================================================
// Admin Dashboard Helper Functions
// =============================================================================

async function getSystemHealth() {
  const health = { overall: 'healthy', components: {} };
  try {
    const { data, error } = await supabase.from('tasks').select('id').limit(1);
    health.components.database = {
      status: error ? 'unhealthy' : 'healthy',
      message: error ? error.message : 'Connected'
    };

    const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_KEY', 'ANTHROPIC_API_KEY'];
    const missingVars = requiredEnvVars.filter(v => !process.env[v]);
    health.components.environment = {
      status: missingVars.length === 0 ? 'healthy' : 'warning',
      message: missingVars.length === 0 ? 'All required variables set' : `Missing: ${missingVars.join(', ')}`
    };

    health.components.emailIntegration = {
      status: (!!process.env.GMAIL_CLIENT_ID || !!process.env.OUTLOOK_CLIENT_ID) ? 'healthy' : 'disabled',
      gmail: !!process.env.GMAIL_CLIENT_ID ? 'configured' : 'not configured',
      outlook: !!process.env.OUTLOOK_CLIENT_ID ? 'configured' : 'not configured'
    };

    health.components.calendarIntegration = {
      status: !!process.env.GOOGLE_CALENDAR_CLIENT_ID ? 'healthy' : 'disabled',
      googleCalendar: !!process.env.GOOGLE_CALENDAR_CLIENT_ID ? 'configured' : 'not configured'
    };

    if (health.components.database.status === 'unhealthy') health.overall = 'critical';
    else if (health.components.environment.status === 'warning') health.overall = 'warning';
  } catch (error) {
    health.overall = 'error';
    health.error = error.message;
  }
  return health;
}

async function getEntityStatistics() {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [tasksTotal, tasksToday, tasksWeek, tasksPending, tasksCompleted] = await Promise.all([
      supabase.from('tasks').select('id', { count: 'exact', head: true }),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).gte('created_at', thisWeek.toISOString()),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'completed')
    ]);

    const [eventsTotal, eventsToday, eventsUpcoming] = await Promise.all([
      supabase.from('events').select('id', { count: 'exact', head: true }),
      supabase.from('events').select('id', { count: 'exact', head: true })
        .gte('start_time', today.toISOString())
        .lt('start_time', new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString()),
      supabase.from('events').select('id', { count: 'exact', head: true }).gte('start_time', now.toISOString())
    ]);

    const [projectsTotal, projectsActive] = await Promise.all([
      supabase.from('projects').select('id', { count: 'exact', head: true }),
      supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'active')
    ]);

    const [narrativesTotal, narrativesWeek] = await Promise.all([
      supabase.from('narratives').select('id', { count: 'exact', head: true }),
      supabase.from('narratives').select('id', { count: 'exact', head: true }).gte('created_at', thisWeek.toISOString())
    ]);

    const briefingsMonth = await supabase.from('daily_briefs').select('id', { count: 'exact', head: true }).gte('created_at', thisMonth.toISOString());

    return {
      tasks: {
        total: tasksTotal.count || 0,
        today: tasksToday.count || 0,
        thisWeek: tasksWeek.count || 0,
        pending: tasksPending.count || 0,
        completed: tasksCompleted.count || 0,
        completionRate: tasksTotal.count > 0 ? Math.round((tasksCompleted.count / tasksTotal.count) * 100) : 0
      },
      events: {
        total: eventsTotal.count || 0,
        today: eventsToday.count || 0,
        upcoming: eventsUpcoming.count || 0
      },
      projects: {
        total: projectsTotal.count || 0,
        active: projectsActive.count || 0
      },
      narratives: {
        total: narrativesTotal.count || 0,
        thisWeek: narrativesWeek.count || 0
      },
      briefings: {
        thisMonth: briefingsMonth.count || 0
      }
    };
  } catch (error) {
    logger.error('Error fetching entity statistics:', { error });
    return { error: error.message };
  }
}

async function getRecentActivity() {
  try {
    const { data: recentTasks } = await supabase.from('tasks').select('id, title, urgency, status, created_at, project_id').order('created_at', { ascending: false }).limit(5);
    const { data: recentEvents } = await supabase.from('events').select('id, title, start_time, created_at').order('created_at', { ascending: false }).limit(5);
    const { data: recentNarratives } = await supabase.from('narratives').select('id, headline, source, created_at, project_id').order('created_at', { ascending: false }).limit(5);

    return { recentTasks: recentTasks || [], recentEvents: recentEvents || [], recentNarratives: recentNarratives || [] };
  } catch (error) {
    logger.error('Error fetching recent activity:', { error });
    return { error: error.message };
  }
}

async function getJobStatus() {
  try {
    const { data: lastEmail } = await supabase.from('processed_emails').select('processed_at, email_id, source').order('processed_at', { ascending: false }).limit(1).single();
    const { data: lastBriefing } = await supabase.from('daily_briefs').select('created_at, date').order('created_at', { ascending: false }).limit(1).single();

    const now = new Date();
    const emailAge = lastEmail ? Math.round((now - new Date(lastEmail.processed_at)) / 1000 / 60) : null;
    const briefingAge = lastBriefing ? Math.round((now - new Date(lastBriefing.created_at)) / 1000 / 60) : null;

    return {
      emailScanning: {
        status: emailAge !== null && emailAge < 60 ? 'active' : 'stale',
        lastRun: lastEmail?.processed_at || null,
        minutesAgo: emailAge,
        source: lastEmail?.source || null
      },
      briefingGeneration: {
        status: briefingAge !== null && briefingAge < 720 ? 'active' : 'stale',
        lastRun: lastBriefing?.created_at || null,
        minutesAgo: briefingAge,
        lastDate: lastBriefing?.date || null
      },
      scheduledJobs: {
        emailScanning: { frequency: 'Every 30 minutes', nextExpected: emailAge !== null ? `in ${Math.max(0, 30 - emailAge)} minutes` : 'unknown' },
        qualityControl: { frequency: 'Every 6 hours', times: '12am, 6am, 12pm, 6pm ET' },
        briefingGeneration: { frequency: '3x daily', times: '6am, 12pm, 6pm ET' }
      }
    };
  } catch (error) {
    logger.error('Error fetching job status:', { error });
    return { error: error.message };
  }
}

async function getPerformanceMetrics() {
  try {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();

    return {
      server: {
        uptime: { seconds: Math.round(uptime), formatted: formatUptime(uptime) },
        memory: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          percentage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)
        },
        nodeVersion: process.version,
        platform: process.platform
      },
      phase: 'Phase 2 (Three-Entity Model)',
      architecture: 'Tasks, Events, Narratives'
    };
  } catch (error) {
    logger.error('Error fetching performance metrics:', { error });
    return { error: error.message };
  }
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return parts.length > 0 ? parts.join(' ') : '< 1m';
}

module.exports = router;
