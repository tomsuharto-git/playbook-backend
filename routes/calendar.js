const express = require('express');
const logger = require('../utils/logger').route('calendar');
const router = express.Router();
const { supabase } = require('../db/supabase-client');
const { fetchTodaysEvents } = require('../services/google-calendar');
const { generateEventBriefings } = require('../services/event-briefing');
const { generateBriefings } = require('../jobs/generate-briefings');

/**
 * GET /api/calendar/brief?days=2
 * Fetches PRE-GENERATED briefings from database
 * Briefings are generated 3x daily (6am, 12pm, 6pm) by background job
 */
router.get('/brief', async (req, res) => {
  try {
    const daysAhead = parseInt(req.query.days) || 2; // Default to 2 days (today + tomorrow)

    // Get "today" in Eastern Time (not server time!)
    // This ensures backend and frontend agree on what "today" is
    const now = new Date();
    const etFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York'
    });
    const todayET = etFormatter.format(now); // e.g., "2025-10-12"

    logger.info('\n📅 Fetching pre-generated briefings for day(s)', { daysAhead: daysAhead });
    const currentTimeET = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
    logger.info('Current time (ET)', { currentTimeET: currentTimeET });
    logger.info('Today (ET):', { todayET: todayET });

    const eventsByDate = {};

    // Loop through each day and fetch from database
    for (let i = 0; i < daysAhead; i++) {
      // Calculate date string directly without creating Date objects
      // to avoid timezone conversion issues
      const [year, month, day] = todayET.split('-').map(Number);
      const targetDay = day + i;
      const targetDate = new Date(Date.UTC(year, month - 1, targetDay));

      const dateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'UTC'
      }).format(targetDate);

      logger.info('Date :', { i: i, dateStr: dateStr });

      // Fetch pre-generated briefings from database
      try {
        // FIX 4: Use .maybeSingle() instead of .single() to handle duplicates gracefully
        let { data: briefData, error: briefError } = await supabase
          .from('daily_briefs')
          .select('event_ids, calendar_events, id')
          .eq('date', dateStr)
          .maybeSingle();

        // Handle duplicate rows (PGRST116 means multiple rows found)
        if (briefError && briefError.code === 'PGRST116') {
          logger.error('🚨 CRITICAL: Multiple daily_briefs rows found for', { dateStr: dateStr });
          logger.info('🔧 Attempting to clean up duplicates...');

          // Fetch all duplicate rows
          const { data: duplicates } = await supabase
            .from('daily_briefs')
            .select('id, created_at')
            .eq('date', dateStr)
            .order('created_at', { ascending: false });

          if (duplicates && duplicates.length > 1) {
            // Keep the most recent, delete the rest
            const keepId = duplicates[0].id;
            const deleteIds = duplicates.slice(1).map(d => d.id);

            const deleteCount = deleteIds.length;
            logger.info('ℹ️  Keeping most recent row, deleting duplicates', { keepId: keepId, deleteCount: deleteCount });

            const { error: deleteError } = await supabase
              .from('daily_briefs')
              .delete()
              .in('id', deleteIds);

            if (deleteError) {
              logger.error('❌ Failed to delete duplicates:');
            } else {
              const cleanedCount = deleteIds.length;
              logger.info('✅ Cleaned up duplicate rows', { cleanedCount: cleanedCount });

              // Retry fetch after cleanup
              const { data: retryData } = await supabase
                .from('daily_briefs')
                .select('event_ids, calendar_events')
                .eq('date', dateStr)
                .maybeSingle();

              if (retryData) {
                // Continue processing with cleaned data
                briefData = retryData;
              }
            }
          }
        }

        // No data for this date yet
        if (!briefData) {
          eventsByDate[dateStr] = [];
          logger.info('ℹ️  No briefings available (will be generated at next scheduled time)');
          logger.info('DEBUG: briefData is null/undefined for', { dateStr: dateStr });
          continue;
        }

        logger.debug(`DEBUG: briefData found for ${dateStr}`, {
          hasEventIds: !!briefData.event_ids,
          eventIdsLength: briefData.event_ids?.length,
          hasCalendarEvents: !!briefData.calendar_events,
          calendarEventsLength: briefData.calendar_events?.length
        });

        if (briefError && briefError.code !== 'PGRST116') {
          logger.error('⚠️  Database error:');
          eventsByDate[dateStr] = [];
          continue;
        }

        // Phase 2: Load events from normalized events table using event_ids
        if (briefData?.event_ids && briefData.event_ids.length > 0) {
          const eventIdCount = briefData.event_ids.length;
          logger.info('Fetching events from events table...', { eventIdCount: eventIdCount });

          const { data: events, error: eventsError } = await supabase
            .from('events')
            .select(`
              *,
              projects (
                name,
                project_color,
                context
              )
            `)
            .in('id', briefData.event_ids)
            .order('start_time', { ascending: true});

          if (eventsError) {
            logger.error('⚠️  Error loading events:');
            eventsByDate[dateStr] = [];
          } else if (events && events.length > 0) {
            // Map Phase 2 events table structure to expected frontend format
            eventsByDate[dateStr] = events.map(e => {
              // Convert timestamps back to start/end object format for frontend compatibility
              const startTime = new Date(e.start_time);
              const endTime = new Date(e.end_time);

              // Check if this is an all-day event (time is exactly midnight)
              const isAllDay = startTime.getUTCHours() === 0 &&
                               startTime.getUTCMinutes() === 0 &&
                               startTime.getUTCSeconds() === 0;

              return {
                id: e.calendar_id,  // Frontend expects calendar_id as 'id'
                summary: e.title || e.summary || e.subject || 'No Title',
                start: isAllDay
                  ? { date: startTime.toISOString().split('T')[0] }
                  : { dateTime: e.start_time, timeZone: 'UTC' },
                end: isAllDay
                  ? { date: endTime.toISOString().split('T')[0] }
                  : { dateTime: e.end_time, timeZone: 'UTC' },
                description: e.description,
                location: e.location,
                attendees: e.attendees,
                isAllDay: isAllDay,
                project_id: e.project_id,
                project_name: e.projects?.name || null,
                project_color: e.projects?.project_color || null,
                project_work_life_context: e.projects?.context || null,
                ai_briefing: e.briefing,
                calendar_category: e.calendar_source === 'outlook' ? 'Outlook' : 'Google',
                enriched_attendees: e.attendees || []
              };
            });
            const loadedEventCount = events.length;
            logger.info('✅ Loaded events from events table', { loadedEventCount: loadedEventCount });
          } else {
            // No events found for this briefing
            eventsByDate[dateStr] = [];
            logger.info('ℹ️  No events found for event_ids');
          }
        } else {
          // No event IDs in briefing (briefing may have been generated before events were created)
          eventsByDate[dateStr] = [];
          logger.info('ℹ️  No event_ids in briefing for', { dateStr: dateStr });
        }
      } catch (error) {
        logger.error('⚠️  Failed to fetch briefings:');
        eventsByDate[dateStr] = [];
      }
    }

    // Fetch event overrides and merge them
    let allEvents = Object.values(eventsByDate).flat();
    const eventIds = allEvents.map(e => e.id).filter(Boolean);

    if (eventIds.length > 0) {
      const eventIdCount = eventIds.length;
      logger.info('\n  🔄 Fetching overrides for events...', { eventIdCount: eventIdCount });
      const { data: overrides } = await supabase
        .from('event_overrides')
        .select('*')
        .in('event_id', eventIds);

      if (overrides && overrides.length > 0) {
        const overrideCount = overrides.length;
        logger.info('Found event overrides', { overrideCount: overrideCount });
        // Create a map for O(1) lookup
        const overrideMap = new Map(overrides.map(o => [o.event_id, o]));

        // Merge overrides into events
        for (const dateStr in eventsByDate) {
          eventsByDate[dateStr] = eventsByDate[dateStr].map(event => {
            const override = overrideMap.get(event.id);
            if (override) {
              // Apply overrides
              return {
                ...event,
                summary: override.title !== null ? override.title : event.summary,
                project_id: override.project_id !== null ? override.project_id : event.project_id,
                context: override.context !== null ? override.context : event.context,
                project_work_life_context: override.context !== null ? override.context : event.project_work_life_context,
                _has_override: true
              };
            }
            return event;
          });
        }

        // Recalculate allEvents after applying overrides
        allEvents = Object.values(eventsByDate).flat();
      }
    }

    // Calculate total counts
    const googleTotal = allEvents.filter(e => e.calendar_category !== 'Outlook').length;
    const outlookTotal = allEvents.filter(e => e.calendar_category === 'Outlook').length;

    const totalEventCount = allEvents.length;
    logger.debug('\n  📊 Grand Total events', { totalEventCount: totalEventCount });
    logger.info('- Google:', { googleTotal: googleTotal });
    logger.info('- Outlook:', { outlookTotal: outlookTotal });

    res.json({
      success: true,
      eventsByDate,
      sources: {
        google: googleTotal,
        outlook: outlookTotal,
        total: allEvents.length
      }
    });
  } catch (error) {
    logger.error('❌ Error fetching calendar events:', { arg0: error });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/calendar/regenerate
 * Manually trigger briefing regeneration for today and tomorrow
 * This will apply the latest deduplication and categorization logic
 */
router.post('/regenerate', async (req, res) => {
  try {
    logger.info('\n🔄 Manual briefing regeneration triggered...');

    await generateBriefings();

    res.json({
      success: true,
      message: 'Briefings regenerated successfully'
    });
  } catch (error) {
    logger.error('❌ Error regenerating briefings:', { arg0: error });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
