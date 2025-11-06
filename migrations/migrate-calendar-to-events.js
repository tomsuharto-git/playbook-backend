// Migration script: calendar_events → events (Phase 2)
// Migrates missing Outlook events and deduplicates existing Google events

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
  console.log('\n🚀 Starting Calendar Events Migration to Phase 2\n');
  console.log('='.repeat(80));

  let stats = {
    total: 0,
    skipped: 0,
    migrated: 0,
    errors: 0,
    bySource: { outlook: 0, google: 0 }
  };

  try {
    // Fetch all calendar_events
    console.log('\n📥 Fetching calendar_events...');
    const { data: calendarEvents, error: fetchError } = await supabase
      .from('calendar_events')
      .select('*')
      .order('start', { ascending: true });

    if (fetchError) {
      console.error('❌ Error fetching calendar_events:', fetchError);
      return;
    }

    stats.total = calendarEvents.length;
    console.log(`✅ Found ${stats.total} events in calendar_events\n`);
    console.log('-'.repeat(80));

    // Process each event
    for (const event of calendarEvents) {
      const title = event.summary || 'Untitled Event';
      const startTime = parseDateTime(event.start);
      const endTime = parseDateTime(event.end);

      // Skip if missing required fields
      if (!title || !startTime) {
        console.log(`⚠️  Skipping event with missing data: ${event.id}`);
        stats.skipped++;
        continue;
      }

      // Check if event already exists
      const exists = await eventExists(title, startTime);
      if (exists) {
        console.log(`⏭️  Skipping duplicate: ${title.substring(0, 50)}`);
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
        console.error(`❌ Error migrating event "${title}":`, insertError.message);
        stats.errors++;
      } else {
        console.log(`✅ Migrated: ${title.substring(0, 60)} (${event.source})`);
        stats.migrated++;
        stats.bySource[event.source] = (stats.bySource[event.source] || 0) + 1;
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(80));
    console.log('\n📊 MIGRATION SUMMARY\n');
    console.log('-'.repeat(80));
    console.log(`Total events processed: ${stats.total}`);
    console.log(`Successfully migrated:  ${stats.migrated}`);
    console.log(`Skipped (duplicates):   ${stats.skipped}`);
    console.log(`Errors:                 ${stats.errors}`);
    console.log('\nBy source:');
    console.log(`  Outlook: ${stats.bySource.outlook || 0}`);
    console.log(`  Google:  ${stats.bySource.google || 0}`);

    // Verify final counts
    console.log('\n📋 VERIFICATION\n');
    console.log('-'.repeat(80));

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

    console.log(`\nFinal events table record count: ${finalCount}`);
    console.log(`  Outlook events: ${outlookCount}`);
    console.log(`  Google events:  ${googleCount}`);

    console.log('\n' + '='.repeat(80));

    if (stats.migrated > 0) {
      console.log('\n✅ Migration completed successfully!');
      console.log('\n💡 Next steps:');
      console.log('1. Update backend/routes/calendar.js to query from "events"');
      console.log('2. Test /api/calendar/brief endpoint');
      console.log('3. Verify brief page displays all events (Outlook + Google)');
      console.log('4. Once verified, update calendar sync to write to "events"');
      console.log('5. Eventually deprecate calendar_events table\n');
    } else {
      console.log('\n⚠️  No new events migrated (all were duplicates)');
      console.log('This may indicate migration was already run previously.\n');
    }

  } catch (error) {
    console.error('\n❌ Migration failed with error:', error);
  }
}

// Run migration
migrateCalendarEvents();
