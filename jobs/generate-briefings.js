/**
 * Brief Generation Job
 * Generates AI briefings for calendar events 3x daily (6am, 12pm, 6pm ET)
 * Stores them in database for instant page loads
 */

const cron = require('node-cron');
const logger = require('../utils/logger').job('generate-briefings');
const { supabase } = require('../db/supabase-client');
const { fetchTodaysEvents } = require('../services/google-calendar');
const { fetchOutlookEventsForDate } = require('../services/outlook-calendar');
const { deduplicateEvents } = require('../services/calendar-normalizer');
const { generateEventBriefings } = require('../services/event-briefing');
const { detectProject } = require('../services/project-detector');
const { enrichEventWithProject } = require('../services/project-context-enhancer');
const { enrichCalendarEvents } = require('../services/contact-enrichment');

// Concurrency protection: Prevent overlapping executions
let isGenerating = false;

async function generateBriefings() {
  // Check if another job is already running
  if (isGenerating) {
    logger.info('⏭️  Briefing generation already in progress, skipping this run');
    return { success: false, message: 'Already running' };
  }

  isGenerating = true;
  logger.info('\n📅 Brief generation job starting...');
  logger.info('🔒 Acquired generation lock');

  try {
    const daysAhead = 2; // Today + Tomorrow
    const now = new Date();
    const eventsByDate = {};

    // Get "today" in Eastern Time
    const etFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York'
    });
    const todayET = etFormatter.format(now);

    // Fetch events for each day
    for (let i = 0; i < daysAhead; i++) {
      // Calculate date in Eastern Time (properly handling timezone)
      // Create date at midnight ET, then add days while preserving ET context
      const targetDate = new Date(todayET + 'T00:00:00-05:00'); // Midnight ET
      targetDate.setDate(targetDate.getDate() + i); // Add days
      const dateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York'
      }).format(targetDate);

      logger.info('\n  📆 Processing ...', { dateStr: dateStr });

      // 1. Fetch from both calendar sources in parallel
      const [googleEvents, outlookEvents] = await Promise.all([
        // Fetch Google Calendar events
        fetchTodaysEvents(targetDate).catch(error => {
          logger.error('⚠️  Google Calendar failed:');
          return [];
        }),
        // Fetch Outlook events from Google Drive
        fetchOutlookEventsForDate(dateStr).catch(error => {
          logger.error('⚠️  Outlook Calendar failed:');
          return [];
        })
      ]);

      const googleCount = googleEvents.length;
      const outlookCount = outlookEvents.length;
      logger.info('Sources Google + Outlook', { googleCount: googleCount, outlookCount: outlookCount });

      // 2. Combine and deduplicate events
      let allEvents = deduplicateEvents([...googleEvents, ...outlookEvents]);

      // 3. Sort by time
      allEvents.sort((a, b) => {
        const aTime = a.start?.dateTime || a.start?.date || '';
        const bTime = b.start?.dateTime || b.start?.date || '';
        return aTime.localeCompare(bTime);
      });

      // 4. Filter out invalid and excluded events
      const excludedTitles = ['Peloton 🚴', 'Kasper ➡️ Bus', 'Busy'];
      let dayEvents = allEvents.filter(event => {
        const title = event.summary || event.subject || '';
        const trimmedTitle = title.trim();

        // Filter 1: Exclude specific titles (case-insensitive and trimmed)
        if (excludedTitles.some(excluded => trimmedTitle.toLowerCase() === excluded.toLowerCase())) {
          logger.info('🚫 Excluded by title: ""', { title: title });
          return false;
        }

        // Filter 2: Must have a valid title (not empty, not "No Title")
        if (!title || title.trim() === '' || title === 'No Title' || title.trim() === 'No Title') {
          logger.info('🚫 Invalid title: ""', { title: title });
          return false;
        }

        // Filter 3: Must have a valid start time
        const hasValidStartTime = event.start?.dateTime || event.start?.date;
        if (!hasValidStartTime) {
          logger.info('🚫 No start time: ""', { title: title });
          return false;
        }

        return true;
      });

      const filteredEventCount = dayEvents.length;
      logger.debug('📊 Total after filtering events', { filteredEventCount: filteredEventCount });

      // 5. Enrich attendees with PDL data
      dayEvents = await enrichCalendarEvents(dayEvents);

      // 6. Detect projects for each event
      const dayEventCount = dayEvents.length;
      logger.debug('🔍 Detecting projects for events...', { dayEventCount: dayEventCount });
      for (const event of dayEvents) {
        const eventTitle = event.summary || event.subject || 'No Title';
        logger.info('Checking: ""', { eventTitle: eventTitle });

        const projectMatch = await detectProject(event);
        if (projectMatch) {
          logger.info('✓ Project matched (confidence)', { name: projectMatch.name, confidence: projectMatch.confidence });

          // Enrich event with project information
          const enrichedEvent = await enrichEventWithProject(event, projectMatch);
          const projectName = enrichedEvent.project_name || 'MISSING!';
          const projectColor = enrichedEvent.project_color || 'MISSING!';
          logger.info('✓ Enriched event has project_name:', { projectName: projectName });
          logger.info('✓ Enriched event has project_color:', { projectColor: projectColor });

          // Copy properties back to original event
          Object.assign(event, enrichedEvent);
          const eventProjectName = event.project_name || 'MISSING!';
          logger.info('✓ After Object.assign, event.project_name:', { eventProjectName: eventProjectName });
        } else {
          logger.info('ℹ️  No project match');
        }
      }

      // 7. Check for cached briefings
      let cachedBriefingsMap = new Map();
      try {
        const { data: cachedBriefings, error } = await supabase
          .from('daily_briefs')
          .select('calendar_events')
          .eq('date', dateStr)
          .single();

        if (!error && cachedBriefings?.calendar_events) {
          cachedBriefings.calendar_events.forEach(event => {
            if (event.id && event.ai_briefing) {
              cachedBriefingsMap.set(event.id, event.ai_briefing);
            }
          });
        }
      } catch (err) {
        // Caching not available yet
      }

      // 8. Categorize events into Work and Life (to skip Life event briefings)
      const isWorkEvent = (event) => {
        // Rule 1: Gmail (native) → Always Life
        if (event.calendar_category === 'Google') {
          return false;
        }

        // Rule 2: Outlook + attendees → Work
        if (event.calendar_category === 'Outlook' && event.attendees?.length > 0) {
          return true;
        }

        // Rule 3: Outlook + no attendees → Check project context
        if (event.calendar_category === 'Outlook') {
          if (event.project_work_life_context === 'Life') {
            return false;
          }
          return true; // Work or no project = Work
        }

        return false; // Default to Life
      };

      const workEvents = dayEvents.filter(isWorkEvent);
      const lifeEvents = dayEvents.filter(e => !isWorkEvent(e));

      const workCount = workEvents.length;
      const lifeCount = lifeEvents.length;
      logger.debug('📊 Categorization Work, Life', { workCount: workCount, lifeCount: lifeCount });
      logger.info('💡 Only generating briefings for Work events (cost savings)');

      // 9. Determine which WORK events need briefings (Life events get no briefings)
      const eventsNeedingBriefings = workEvents.filter(e => !cachedBriefingsMap.has(e.id));
      const eventsWithCachedBriefings = workEvents.filter(e => cachedBriefingsMap.has(e.id));

      const cachedCount = eventsWithCachedBriefings.length;
      const needGenerationCount = eventsNeedingBriefings.length;
      logger.info('♻️  Cached briefings:', { cachedCount: cachedCount });
      logger.info('🆕 Need generation:', { needGenerationCount: needGenerationCount });

      // 10. Generate briefings for new WORK events only
      let newlyEnrichedEvents = [];
      if (eventsNeedingBriefings.length > 0) {
        const newBriefingCount = eventsNeedingBriefings.length;
        logger.info('🤖 Generating new briefings...', { newBriefingCount: newBriefingCount });
        newlyEnrichedEvents = await generateEventBriefings(eventsNeedingBriefings);
      }

      // 11. Combine cached + newly generated (only for Work events, Life events get no briefings)
      const enrichedEvents = dayEvents.map(event => {
        // Skip briefings for Life events
        if (!isWorkEvent(event)) {
          return event; // Return as-is, no briefing
        }

        // For Work events: add cached or newly generated briefing
        if (cachedBriefingsMap.has(event.id)) {
          return {
            ...event,
            ai_briefing: cachedBriefingsMap.get(event.id)
          };
        }
        const newlyEnriched = newlyEnrichedEvents.find(e => e.id === event.id);
        return newlyEnriched || event;
      });

      // 12. Save events to persistent calendar_events table
      try {
        // LAYER 2 DEFENSE: Final validation before save
        // Filter out any invalid events that might have slipped through
        const validEvents = enrichedEvents.filter(event => {
          const title = event.summary || event.subject || '';
          const hasValidTitle = title && title.trim() !== '' && title !== 'No Title' && title.trim() !== 'No Title';
          const hasValidTime = event.start?.dateTime || event.start?.date;

          if (!hasValidTitle || !hasValidTime) {
            logger.info('🚫 [LAYER 2] Blocking invalid event from save (hasTitle, hasTime)', { title: title, hasValidTitle: hasValidTitle, hasValidTime: hasValidTime });
            return false;
          }

          return true;
        });

        const blockedCount = enrichedEvents.length - validEvents.length;
        if (blockedCount > 0) {
          logger.info('🛡️  [LAYER 2] Blocked invalid event(s) before database save', { blockedCount: blockedCount });
        }

        // Log what we're about to save
        const validEventCount = validEvents.length;
        logger.info('💾 Saving valid events to persistent table...', { validEventCount: validEventCount });
        const eventsWithProjects = validEvents.filter(e => e.project_name);
        const projectEventCount = eventsWithProjects.length;
        logger.info('Events with projects:', { projectEventCount: projectEventCount });
        eventsWithProjects.forEach(e => {
          logger.info('- "" →  ()', { summary: e.summary, project_name: e.project_name, project_color: e.project_color });
        });

        // PHASE 2: Upsert each event to events table (normalized storage)
        const eventIds = [];
        let newEventCount = 0;
        let updatedEventCount = 0;
        let skippedEventCount = 0;

        // Helper function to convert JSONB datetime to ISO timestamp
        const parseDateTime = (startOrEnd) => {
          if (!startOrEnd) return null;

          // Handle dateTime format (timed events)
          if (startOrEnd.dateTime) {
            return new Date(startOrEnd.dateTime).toISOString();
          }

          // Handle date-only format (all-day events)
          if (startOrEnd.date) {
            return new Date(startOrEnd.date + 'T00:00:00Z').toISOString();
          }

          return null;
        };

        for (const event of validEvents) {
          const source = event.calendar_category === 'Google' ? 'google' : 'outlook';
          const externalId = event.id;

          if (!externalId) {
            logger.warn('⚠️  Skipping event without external ID:', { summary: event.summary });
            skippedEventCount++;
            continue;
          }

          // Convert datetime objects to ISO timestamps
          const startTime = parseDateTime(event.start);
          const endTime = parseDateTime(event.end || event.start);

          if (!startTime) {
            logger.warn('⚠️  Skipping event without valid start time:', { summary: event.summary });
            skippedEventCount++;
            continue;
          }

          // Check if event already exists (Phase 2 table)
          const { data: existingEvent } = await supabase
            .from('events')
            .select('id, title, start_time, end_time, briefing, updated_at')
            .eq('calendar_id', externalId)
            .eq('calendar_source', source)
            .maybeSingle();

          // Prepare event data for Phase 2 storage (normalized schema)
          const eventData = {
            calendar_id: externalId,
            calendar_source: source,
            title: event.summary || event.subject,
            start_time: startTime,
            end_time: endTime,
            description: event.description || '',
            location: event.location || '',
            attendees: event.attendees || [],
            project_id: event.project_id || null,
            briefing: event.ai_briefing || null,
            updated_at: new Date().toISOString()
          };

          if (!existingEvent) {
            // NEW EVENT: Insert
            const { data: inserted, error: insertError } = await supabase
              .from('events')
              .insert(eventData)
              .select('id')
              .single();

            if (insertError) {
              logger.error('❌ Error inserting event "":', { summary: event.summary });
              skippedEventCount++;
            } else {
              eventIds.push(inserted.id);
              newEventCount++;
            }
          } else {
            // EXISTING EVENT: Check if it changed
            const hasChanges =
              existingEvent.title !== event.summary ||
              existingEvent.start_time !== startTime ||
              existingEvent.end_time !== endTime;

            if (hasChanges || !existingEvent.briefing) {
              // Update event (changed or missing AI briefing)
              const { error: updateError } = await supabase
                .from('events')
                .update(eventData)
                .eq('id', existingEvent.id);

              if (updateError) {
                logger.error('❌ Error updating event "":', { summary: event.summary });
                skippedEventCount++;
              } else {
                eventIds.push(existingEvent.id);
                updatedEventCount++;
              }
            } else {
              // Event unchanged, just reference it
              eventIds.push(existingEvent.id);
            }
          }
        }

        const unchangedCount = validEvents.length - newEventCount - updatedEventCount - skippedEventCount;
        logger.debug('📊 Event processing new, updated, unchanged, skipped', { newEventCount: newEventCount, updatedEventCount: updatedEventCount, unchangedCount: unchangedCount, skippedEventCount: skippedEventCount });

        // FIX 3: VALIDATION - Don't update if too many events failed
        const successfulEventCount = eventIds.length;
        const totalEventCount = validEvents.length;
        const failureRate = totalEventCount > 0 ? (totalEventCount - successfulEventCount) / totalEventCount : 0;

        if (failureRate > 0.3) {
          const failurePercent = (failureRate * 100).toFixed(1);
          const failedCount = totalEventCount - successfulEventCount;
          logger.error('🚨 CRITICAL event failure rate (failed / total)', { failurePercent: failurePercent, failedCount: failedCount, totalEventCount: totalEventCount });
          logger.error('⚠️  Skipping daily_briefs update to prevent data loss');
          logger.error('ℹ️  Existing event_ids will be preserved until next successful run');
          continue; // Skip to next date
        } else if (failureRate > 0) {
          const failurePercent = (failureRate * 100).toFixed(1);
          const failedCount = totalEventCount - successfulEventCount;
          logger.error('⚠️  Warning event failure rate (failed / total) - within acceptable threshold', { failurePercent: failurePercent, failedCount: failedCount, totalEventCount: totalEventCount });
        }

        // FIX 2: MERGE-AWARE UPSERT - Preserve existing event_ids
        // Fetch existing event_ids to merge (don't replace)
        const { data: existingBrief } = await supabase
          .from('daily_briefs')
          .select('event_ids')
          .eq('date', dateStr)
          .maybeSingle();

        // Merge existing event_ids with new ones
        let mergedEventIds = eventIds;
        if (existingBrief?.event_ids && Array.isArray(existingBrief.event_ids)) {
          const existingCount = existingBrief.event_ids.length;
          logger.info('🔄 Merging with existing event_ids', { existingCount: existingCount });
          mergedEventIds = [...new Set([...existingBrief.event_ids, ...eventIds])];
          const existingIdCount = existingBrief.event_ids.length;
          const newIdCount = eventIds.length;
          const mergedCount = mergedEventIds.length;
          logger.info('✓ Deduplicated existing + new = total', { existingIdCount: existingIdCount, newIdCount: newIdCount, mergedCount: mergedCount });
        }

        // Phase 2: Update daily_briefs with event references only
        await supabase
          .from('daily_briefs')
          .upsert({
            date: dateStr,
            event_ids: mergedEventIds
            // JSONB calendar_events removed - using normalized events table
          }, {
            onConflict: 'date'
          });

        const savedCount = mergedEventIds.length;
        logger.info('✅ Saved event references to daily_briefs', { savedCount: savedCount });
      } catch (err) {
        logger.error('⚠️  Failed to save briefings:');
      }

      eventsByDate[dateStr] = enrichedEvents;
    }

    const totalEvents = Object.values(eventsByDate).flat().length;
    logger.info('\n✅ Brief generation complete events processed\n', { totalEvents: totalEvents });

    return { success: true, totalEvents };

  } catch (error) {
    logger.error('❌ Brief generation job failed:', { arg0: error });
    return { success: false, error: error.message };
  } finally {
    isGenerating = false;
    logger.info('🔓 Released generation lock');
  }
}

/**
 * Schedule briefing generation for 6am, 12pm, 6pm ET
 */
function scheduleBriefingGeneration() {
  // Convert ET to cron format (accounting for server timezone)
  // Using America/New_York timezone
  const schedule = cron.schedule(
    '0 6,12,18 * * *', // 6am, 12pm, 6pm
    async () => {
      await generateBriefings();
    },
    {
      scheduled: true,
      timezone: 'America/New_York'
    }
  );

  logger.info('⏰ Brief generation scheduled (6am, 12pm, 6pm ET)');

  return schedule;
}

module.exports = {
  generateBriefings,
  scheduleBriefingGeneration
};
