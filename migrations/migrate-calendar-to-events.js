// Migration script: calendar_events → events (Phase 2)
// Migrates missing Outlook events and deduplicates existing Google events

const logger = require('../utils/logger');

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Convert calendar_events start/end objects to ISO timestamps
function parseDateTime(startOrEnd) {
  if (!startOrEnd) return null;

  // Handle dateTime format: { dateTime: "2025-10-20T17:00:00+00:00", timeZone: "UTC" }
  if (startOrEnd.dateTime) {
    return new Date(startOrEnd.dateTime).toISOString();
  }

  // Handle date-only format: { date: "2025-10-24" }
  if (startOrEnd.date) {
    // All-day events: use midnight UTC
    return new Date(startOrEnd.date + 'T00:00:00Z').toISOString();
  }

  return null;
}

// Check if event already exists in events table
async function eventExists(title, startTime) {
  const { data, error } = await supabase
    .from('events')
    .select('id')
    .eq('title', title)
    .eq('start_time', startTime)
    .single();

  return !error && data !== null;
}

async function migrateCalendarEvents() {
  logger.info('\n🚀 Starting Calendar Events Migration to Phase 2\n');
  logger.info('='.repeat(80));

  let stats = {
    total: 0,
    skipped: 0,
    migrated: 0,
    errors: 0,
    bySource: { outlook: 0, google: 0 }
  };

  try {
    // Fetch all calendar_events
    logger.info('\n📥 Fetching calendar_events...');
    const { data: calendarEvents, error: fetchError } = await supabase
      .from('calendar_events')
      .select('*')
      .order('start', { ascending: true });

    if (fetchError) {
      logger.error('❌ Error fetching calendar_events:', { arg0: fetchError });
      return;
    }

    stats.total = calendarEvents.length;
    logger.info('✅ Found  events in calendar_events\n', { total: stats.total });
    logger.info('-'.repeat(80));

    // Process each event
    for (const event of calendarEvents) {
      const title = event.summary || 'Untitled Event';
      const startTime = parseDateTime(event.start);
      const endTime = parseDateTime(event.end);

      // Skip if missing required fields
      if (!title || !startTime) {
        logger.warn('⚠️  Skipping event with missing data:', { id: event.id });
        stats.skipped++;
        continue;
      }

      // Check if event already exists
      const exists = await eventExists(title, startTime);
      if (exists) {
        logger.info('⏭️  Skipping duplicate:', { substring(0, 50): title.substring(0, 50) });
        stats.skipped++;
        continue;
      }

      // Map calendar_events fields to events schema
      const newEvent = {
        project_id: event.project_id || null,
        title: title,
        start_time: startTime,
        end_time: endTime,
        location: event.location || '',
        attendees: event.attendees || [],
        description: event.description || '',
        calendar_source: event.source || 'unknown',
        calendar_id: event.external_id || null,
        briefing: event.ai_briefing || null,
        briefing_type: event.ai_briefing ? 'ai_generated' : null,
        category: event.calendar_category || null,
        // created_at and updated_at will be set automatically
      };

      // Insert into events table
      const { data: inserted, error: insertError } = await supabase
        .from('events')
        .insert([newEvent])
        .select();

      if (insertError) {
        logger.error('❌ Error migrating event "":', { title: title });
        stats.errors++;
      } else {
        logger.info('✅ Migrated:  ()', { substring(0, 60): title.substring(0, 60), source: event.source });
        stats.migrated++;
        stats.bySource[event.source] = (stats.bySource[event.source] || 0) + 1;
      }
    }

    // Print summary
    logger.info('\n' + '='.repeat(80));
    logger.debug('\n📊 MIGRATION SUMMARY\n');
    logger.info('-'.repeat(80));
    logger.info('Total events processed:', { total: stats.total });
    logger.info('Successfully migrated:', { migrated: stats.migrated });
    logger.info('Skipped (duplicates):', { skipped: stats.skipped });
    logger.error('Errors:', { errors: stats.errors });
    logger.info('\nBy source:');
    logger.info('Outlook:', { outlook || 0: stats.bySource.outlook || 0 });
    logger.info('Google:', { google || 0: stats.bySource.google || 0 });

    // Verify final counts
    logger.info('\n📋 VERIFICATION\n');
    logger.info('-'.repeat(80));

    const { count: finalCount } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true });

    const { count: outlookCount } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('calendar_source', 'outlook');

    const { count: googleCount } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('calendar_source', 'google');

    logger.info('\nFinal events table record count:', { finalCount: finalCount });
    logger.info('Outlook events:', { outlookCount: outlookCount });
    logger.info('Google events:', { googleCount: googleCount });

    logger.info('\n' + '='.repeat(80));

    if (stats.migrated > 0) {
      logger.info('\n✅ Migration completed successfully!');
      logger.info('\n💡 Next steps:');
      logger.info('1. Update backend/routes/calendar.js to query from "events"');
      logger.info('2. Test /api/calendar/brief endpoint');
      logger.info('3. Verify brief page displays all events (Outlook + Google)');
      logger.info('4. Once verified, update calendar sync to write to "events"');
      logger.info('5. Eventually deprecate calendar_events table\n');
    } else {
      logger.warn('\n⚠️  No new events migrated (all were duplicates)');
      logger.info('This may indicate migration was already run previously.\n');
    }

  } catch (error) {
    logger.error('\n❌ Migration failed with error:', { arg0: error });
  }
}

// Run migration
migrateCalendarEvents();
