const express = require('express');
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

    console.log(`\n📅 Fetching pre-generated briefings for ${daysAhead} day(s)`);
    console.log(`   Current time (ET): ${now.toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
    console.log(`   Today (ET): ${todayET}`);

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

      console.log(`  Date ${i}: ${dateStr}`);

      // Fetch pre-generated briefings from database
      try {
        // FIX 4: Use .maybeSingle() instead of .single() to handle duplicates gracefully
        let { data: briefData, error: briefError } = await supabase
          .from('daily_briefs')
          .select('event_ids, calendar_events, id, created_at')
          .eq('date', dateStr)
          .maybeSingle();

        // Handle duplicate rows (PGRST116 means multiple rows found)
        if (briefError && briefError.code === 'PGRST116') {
          console.error(`    🚨 CRITICAL: Multiple daily_briefs rows found for ${dateStr}`);
          console.log(`    🔧 Attempting to clean up duplicates...`);

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

            console.log(`    ℹ️  Keeping most recent row (${keepId}), deleting ${deleteIds.length} duplicates`);

            const { error: deleteError } = await supabase
              .from('daily_briefs')
              .delete()
              .in('id', deleteIds);

            if (deleteError) {
              console.error(`    ❌ Failed to delete duplicates:`, deleteError.message);
            } else {
              console.log(`    ✅ Cleaned up ${deleteIds.length} duplicate rows`);

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
          console.log(`    ℹ️  No briefings available (will be generated at next scheduled time)`);
          console.log(`    DEBUG: briefData is null/undefined for ${dateStr}`);
          continue;
        }

        console.log(`    DEBUG: briefData found for ${dateStr}:`, {
          hasEventIds: !!briefData.event_ids,
          eventIdsLength: briefData.event_ids?.length,
          hasCalendarEvents: !!briefData.calendar_events,
          calendarEventsLength: briefData.calendar_events?.length
        });

        if (briefError && briefError.code !== 'PGRST116') {
          console.error(`    ⚠️  Database error:`, briefError?.message);
          eventsByDate[dateStr] = [];
          continue;
        }

        // Try to load events from Phase 2 events table first (event_ids)
        if (briefData?.event_ids && briefData.event_ids.length > 0) {
          console.log(`    DEBUG: Fetching ${briefData.event_ids.length} events by ID...`);

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

          console.log(`    DEBUG: Events query result:`, {
            error: eventsError?.message || null,
            eventsFound: events?.length || 0,
            eventIds: briefData.event_ids
          });

          if (!eventsError && events && events.length > 0) {
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
            console.log(`    ✅ Loaded ${events.length} events from Phase 2 events table`);
          } else {
            console.error(`    ⚠️  Error loading events from Phase 2 table:`, eventsError?.message);
            // Fallback to JSONB if persistent table fails
            eventsByDate[dateStr] = briefData?.calendar_events || [];
          }
        } else {
          // Fallback: Load from old JSONB structure (transition period)
          if (briefData?.calendar_events) {
            eventsByDate[dateStr] = briefData.calendar_events;
            console.log(`    ✅ Loaded ${briefData.calendar_events.length} events from JSONB (fallback)`);
          } else {
            eventsByDate[dateStr] = [];
          }
        }
      } catch (error) {
        console.error(`    ⚠️  Failed to fetch briefings:`, error.message);
        eventsByDate[dateStr] = [];
      }
    }

    // Fetch event overrides and merge them
    let allEvents = Object.values(eventsByDate).flat();
    const eventIds = allEvents.map(e => e.id).filter(Boolean);

    if (eventIds.length > 0) {
      console.log(`\n  🔄 Fetching overrides for ${eventIds.length} events...`);
      const { data: overrides } = await supabase
        .from('event_overrides')
        .select('*')
        .in('event_id', eventIds);

      if (overrides && overrides.length > 0) {
        console.log(`     Found ${overrides.length} event overrides`);
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

    console.log(`\n  📊 Grand Total: ${allEvents.length} events`);
    console.log(`     - Google: ${googleTotal}`);
    console.log(`     - Outlook: ${outlookTotal}\n`);

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
    console.error('❌ Error fetching calendar events:', error);
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
    console.log('\n🔄 Manual briefing regeneration triggered...');

    await generateBriefings();

    res.json({
      success: true,
      message: 'Briefings regenerated successfully'
    });
  } catch (error) {
    console.error('❌ Error regenerating briefings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// TEMPORARY: Diagnostic endpoint
router.get('/test-db', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('daily_briefs')
      .select('date, event_ids')
      .eq('date', '2025-11-02')
      .maybeSingle();

    res.json({
      success: true,
      found: !!data,
      data: data,
      error: error ? error.message : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
