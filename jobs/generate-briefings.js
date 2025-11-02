/**
 * Brief Generation Job
 * Generates AI briefings for calendar events 3x daily (6am, 12pm, 6pm ET)
 * Stores them in database for instant page loads
 */

const cron = require('node-cron');
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
    console.log('⏭️  Briefing generation already in progress, skipping this run');
    return { success: false, message: 'Already running' };
  }

  isGenerating = true;
  console.log('\n📅 Brief generation job starting...');
  console.log('🔒 Acquired generation lock');

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

      console.log(`\n  📆 Processing ${dateStr}...`);

      // 1. Fetch from both calendar sources in parallel
      const [googleEvents, outlookEvents] = await Promise.all([
        // Fetch Google Calendar events
        fetchTodaysEvents(targetDate).catch(error => {
          console.error(`     ⚠️  Google Calendar failed:`, error.message);
          return [];
        }),
        // Fetch Outlook events from Google Drive
        fetchOutlookEventsForDate(dateStr).catch(error => {
          console.error(`     ⚠️  Outlook Calendar failed:`, error.message);
          return [];
        })
      ]);

      console.log(`     Sources: ${googleEvents.length} Google + ${outlookEvents.length} Outlook`);

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
          console.log(`     🚫 Excluded by title: "${title}"`);
          return false;
        }

        // Filter 2: Must have a valid title (not empty, not "No Title")
        if (!title || title.trim() === '' || title === 'No Title' || title.trim() === 'No Title') {
          console.log(`     🚫 Invalid title: "${title}"`);
          return false;
        }

        // Filter 3: Must have a valid start time
        const hasValidStartTime = event.start?.dateTime || event.start?.date;
        if (!hasValidStartTime) {
          console.log(`     🚫 No start time: "${title}"`);
          return false;
        }

        return true;
      });

      console.log(`     📊 Total after filtering: ${dayEvents.length} events`);

      // 5. Enrich attendees with PDL data
      dayEvents = await enrichCalendarEvents(dayEvents);

      // 6. Detect projects for each event
      console.log(`     🔍 Detecting projects for ${dayEvents.length} events...`);
      for (const event of dayEvents) {
        const eventTitle = event.summary || event.subject || 'No Title';
        console.log(`        Checking: "${eventTitle}"`);

        const projectMatch = await detectProject(event);
        if (projectMatch) {
          console.log(`        ✓ Project matched: ${projectMatch.name} (confidence: ${projectMatch.confidence})`);

          // Enrich event with project information
          const enrichedEvent = await enrichEventWithProject(event, projectMatch);
          console.log(`        ✓ Enriched event has project_name: ${enrichedEvent.project_name || 'MISSING!'}`);
          console.log(`        ✓ Enriched event has project_color: ${enrichedEvent.project_color || 'MISSING!'}`);

          // Copy properties back to original event
          Object.assign(event, enrichedEvent);
          console.log(`        ✓ After Object.assign, event.project_name: ${event.project_name || 'MISSING!'}`);
        } else {
          console.log(`        ℹ️  No project match`);
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

      console.log(`     📊 Categorization: ${workEvents.length} Work, ${lifeEvents.length} Life`);
      console.log(`     💡 Only generating briefings for Work events (cost savings)`);

      // 9. Determine which WORK events need briefings (Life events get no briefings)
      const eventsNeedingBriefings = workEvents.filter(e => !cachedBriefingsMap.has(e.id));
      const eventsWithCachedBriefings = workEvents.filter(e => cachedBriefingsMap.has(e.id));

      console.log(`     ♻️  Cached briefings: ${eventsWithCachedBriefings.length}`);
      console.log(`     🆕 Need generation: ${eventsNeedingBriefings.length}`);

      // 10. Generate briefings for new WORK events only
      let newlyEnrichedEvents = [];
      if (eventsNeedingBriefings.length > 0) {
        console.log(`     🤖 Generating ${eventsNeedingBriefings.length} new briefings...`);
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
            console.log(`     🚫 [LAYER 2] Blocking invalid event from save: "${title}" (hasTitle: ${hasValidTitle}, hasTime: ${hasValidTime})`);
            return false;
          }

          return true;
        });

        const blockedCount = enrichedEvents.length - validEvents.length;
        if (blockedCount > 0) {
          console.log(`     🛡️  [LAYER 2] Blocked ${blockedCount} invalid event(s) before database save`);
        }

        // Log what we're about to save
        console.log(`     💾 Saving ${validEvents.length} valid events to persistent table...`);
        const eventsWithProjects = validEvents.filter(e => e.project_name);
        console.log(`        Events with projects: ${eventsWithProjects.length}`);
        eventsWithProjects.forEach(e => {
          console.log(`        - "${e.summary}" → ${e.project_name} (${e.project_color})`);
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
            console.log(`     ⚠️  Skipping event without external ID: ${event.summary}`);
            skippedEventCount++;
            continue;
          }

          // Convert datetime objects to ISO timestamps
          const startTime = parseDateTime(event.start);
          const endTime = parseDateTime(event.end || event.start);

          if (!startTime) {
            console.log(`     ⚠️  Skipping event without valid start time: ${event.summary}`);
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
              console.error(`     ❌ Error inserting event "${event.summary}":`, insertError.message);
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
                console.error(`     ❌ Error updating event "${event.summary}":`, updateError.message);
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

        console.log(`     📊 Event processing: ${newEventCount} new, ${updatedEventCount} updated, ${validEvents.length - newEventCount - updatedEventCount - skippedEventCount} unchanged, ${skippedEventCount} skipped`);

        // FIX 3: VALIDATION - Don't update if too many events failed
        const successfulEventCount = eventIds.length;
        const totalEventCount = validEvents.length;
        const failureRate = totalEventCount > 0 ? (totalEventCount - successfulEventCount) / totalEventCount : 0;

        if (failureRate > 0.3) {
          console.error(`     🚨 CRITICAL: ${(failureRate * 100).toFixed(1)}% event failure rate (${totalEventCount - successfulEventCount}/${totalEventCount} failed)`);
          console.error(`     ⚠️  Skipping daily_briefs update to prevent data loss`);
          console.error(`     ℹ️  Existing event_ids will be preserved until next successful run`);
          continue; // Skip to next date
        } else if (failureRate > 0) {
          console.log(`     ⚠️  Warning: ${(failureRate * 100).toFixed(1)}% event failure rate (${totalEventCount - successfulEventCount}/${totalEventCount} failed) - within acceptable threshold`);
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
          console.log(`     🔄 Merging with ${existingBrief.event_ids.length} existing event_ids`);
          mergedEventIds = [...new Set([...existingBrief.event_ids, ...eventIds])];
          console.log(`     ✓ Deduplicated: ${existingBrief.event_ids.length} existing + ${eventIds.length} new = ${mergedEventIds.length} total`);
        }

        // Update daily_briefs with merged event references
        await supabase
          .from('daily_briefs')
          .upsert({
            date: dateStr,
            event_ids: mergedEventIds,
            calendar_events: validEvents // Keep JSONB for rollback during transition
          }, {
            onConflict: 'date'
          });

        console.log(`     ✅ Saved ${mergedEventIds.length} event references to daily_briefs`);
      } catch (err) {
        console.error(`     ⚠️  Failed to save briefings:`, err.message);
      }

      eventsByDate[dateStr] = enrichedEvents;
    }

    const totalEvents = Object.values(eventsByDate).flat().length;
    console.log(`\n✅ Brief generation complete: ${totalEvents} events processed\n`);

    return { success: true, totalEvents };

  } catch (error) {
    console.error('❌ Brief generation job failed:', error);
    return { success: false, error: error.message };
  } finally {
    isGenerating = false;
    console.log('🔓 Released generation lock');
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

  console.log('⏰ Brief generation scheduled (6am, 12pm, 6pm ET)');

  return schedule;
}

module.exports = {
  generateBriefings,
  scheduleBriefingGeneration
};
