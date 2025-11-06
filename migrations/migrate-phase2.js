#!/usr/bin/env node

const logger = require('../utils/logger');

/**
 * Phase 2 Migration Script
 *
 * Migrates existing data from old structure to new three-entity architecture:
 * 1. Extracts events from daily_briefs JSONB → events table
 * 2. Extracts narratives from projects.narrative JSONB → narratives table
 *
 * Run with: node migrations/migrate-phase2.js
 */

const { supabase } = require('../db/supabase-client');

// Color codes for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  logger.info('', { colors[color]: colors[color], message: message, reset: colors.reset });
}

/**
 * Extract and migrate events from daily_briefs
 */
async function migrateEvents() {
  log('\n📅 MIGRATING EVENTS FROM DAILY_BRIEFS', 'cyan');
  log('=' .repeat(50), 'cyan');

  try {
    // Fetch all daily_briefs with calendar events
    const { data: briefs, error: fetchError } = await supabase
      .from('daily_briefs')
      .select('*')
      .not('calendar_events', 'is', null);

    if (fetchError) {
      throw fetchError;
    }

    log(`Found ${briefs?.length || 0} daily_briefs to process`, 'blue');

    let eventCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const brief of briefs || []) {
      const events = brief.calendar_events || [];

      for (const event of events) {
        try {
          // Check if event already exists (by calendar_id)
          if (event.id) {
            const { data: existing } = await supabase
              .from('events')
              .select('id')
              .eq('calendar_id', event.id)
              .eq('calendar_source', event.calendar_source || 'google')
              .single();

            if (existing) {
              skippedCount++;
              continue;
            }
          }

          // Try to find matching project
          let projectId = null;
          if (event.project_name) {
            const { data: project } = await supabase
              .from('projects')
              .select('id')
              .ilike('name', `%${event.project_name}%`)
              .single();

            projectId = project?.id;
          }

          // Prepare event data
          const eventData = {
            project_id: projectId,
            title: event.summary || event.title || 'Untitled Event',
            start_time: event.start?.dateTime || event.start_time,
            end_time: event.end?.dateTime || event.end_time,
            location: event.location,
            attendees: event.attendees || [],
            description: event.description,
            calendar_source: event.calendar_source || 'google',
            calendar_id: event.id,
            briefing: event.briefing,
            briefing_type: event.category === 'work' && projectId ? 'work_project' :
                          event.category === 'work' ? 'work_general' :
                          event.category === 'life' ? 'life' : null,
            category: event.category,
            created_at: brief.generated_at || brief.created_at || new Date()
          };

          // Insert event
          const { error: insertError } = await supabase
            .from('events')
            .insert(eventData);

          if (insertError) {
            logger.error('Error inserting event:', { message: insertError.message });
            errorCount++;
          } else {
            eventCount++;
            if (eventCount % 10 === 0) {
              log(`  Processed ${eventCount} events...`, 'green');
            }
          }

        } catch (err) {
          logger.error('Error processing event:');
          errorCount++;
        }
      }
    }

    log('\n' + '-'.repeat(50), 'cyan');
    log(`✅ Successfully migrated: ${eventCount} events`, 'green');
    log(`⏭️  Skipped (already exist): ${skippedCount} events`, 'yellow');
    if (errorCount > 0) {
      log(`❌ Errors encountered: ${errorCount} events`, 'red');
    }

    return { migrated: eventCount, skipped: skippedCount, errors: errorCount };

  } catch (error) {
    log(`❌ Fatal error migrating events: ${error.message}`, 'red');
    return { migrated: 0, skipped: 0, errors: 1 };
  }
}

/**
 * Extract and migrate narratives from projects.narrative JSONB
 */
async function migrateNarratives() {
  log('\n📝 MIGRATING NARRATIVES FROM PROJECTS', 'cyan');
  log('=' .repeat(50), 'cyan');

  try {
    // Fetch all projects with narratives
    const { data: projects, error: fetchError } = await supabase
      .from('projects')
      .select('id, name, narrative')
      .not('narrative', 'is', null);

    if (fetchError) {
      throw fetchError;
    }

    log(`Found ${projects?.length || 0} projects with narratives`, 'blue');

    let narrativeCount = 0;
    let errorCount = 0;

    for (const project of projects || []) {
      const narratives = project.narrative || [];

      log(`\nProcessing ${project.name}: ${narratives.length} narratives`, 'magenta');

      for (const narrative of narratives) {
        try {
          // Check if narrative might already exist (by headline and date)
          const { data: existing } = await supabase
            .from('narratives')
            .select('id')
            .eq('project_id', project.id)
            .eq('date', narrative.date)
            .eq('headline', narrative.headline)
            .single();

          if (existing) {
            continue; // Skip if already migrated
          }

          // Prepare narrative data
          const narrativeData = {
            project_id: project.id,
            date: narrative.date || new Date().toISOString().split('T')[0],
            headline: narrative.headline || 'No headline',
            bullets: Array.isArray(narrative.bullets) ? narrative.bullets : [],
            source: narrative.source || 'note',
            source_file: narrative.source_file,
            source_id: narrative.source_id,
            significance_score: narrative.source === 'meeting' ? 0.8 :
                               narrative.source === 'email' ? 0.6 : 0.5,
            auto_generated: true,
            participants: narrative.participants || [],
            keywords: narrative.keywords || [],
            created_at: narrative.created_at || new Date()
          };

          // Insert narrative
          const { error: insertError } = await supabase
            .from('narratives')
            .insert(narrativeData);

          if (insertError) {
            // Check if it's a unique constraint violation (duplicate)
            if (insertError.message.includes('duplicate')) {
              // Silently skip duplicates
            } else {
              logger.error('Error inserting narrative:', { message: insertError.message });
              errorCount++;
            }
          } else {
            narrativeCount++;
            if (narrativeCount % 20 === 0) {
              log(`  Processed ${narrativeCount} narratives...`, 'green');
            }
          }

        } catch (err) {
          logger.error('Error processing narrative:');
          errorCount++;
        }
      }
    }

    log('\n' + '-'.repeat(50), 'cyan');
    log(`✅ Successfully migrated: ${narrativeCount} narratives`, 'green');
    if (errorCount > 0) {
      log(`❌ Errors encountered: ${errorCount} narratives`, 'red');
    }

    return { migrated: narrativeCount, errors: errorCount };

  } catch (error) {
    log(`❌ Fatal error migrating narratives: ${error.message}`, 'red');
    return { migrated: 0, errors: 1 };
  }
}

/**
 * Verify migration results
 */
async function verifyMigration() {
  log('\n🔍 VERIFYING MIGRATION', 'cyan');
  log('=' .repeat(50), 'cyan');

  try {
    // Count records in new tables
    const { count: eventCount } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true });

    const { count: narrativeCount } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true });

    // Get sample data
    const { data: sampleEvents } = await supabase
      .from('events')
      .select('id, title, start_time, project_id')
      .limit(3);

    const { data: sampleNarratives } = await supabase
      .from('narratives')
      .select('id, headline, date, project_id')
      .limit(3);

    log('\n📊 Migration Results:', 'blue');
    log(`  Events table: ${eventCount || 0} records`, 'green');
    log(`  Narratives table: ${narrativeCount || 0} records`, 'green');

    if (sampleEvents?.length > 0) {
      log('\n  Sample events:', 'blue');
      sampleEvents.forEach(e => {
        log(`    - ${e.title} (${new Date(e.start_time).toLocaleDateString()})`, 'green');
      });
    }

    if (sampleNarratives?.length > 0) {
      log('\n  Sample narratives:', 'blue');
      sampleNarratives.forEach(n => {
        log(`    - ${n.headline} (${n.date})`, 'green');
      });
    }

    return { eventCount, narrativeCount };

  } catch (error) {
    log(`❌ Error verifying migration: ${error.message}`, 'red');
    return { eventCount: 0, narrativeCount: 0 };
  }
}

/**
 * Main migration function
 */
async function runPhase2Migration() {
  log('\n' + '='.repeat(60), 'cyan');
  log('PHASE 2 ENTITY MIGRATION', 'cyan');
  log('='.repeat(60), 'cyan');

  log('\nThis will migrate:', 'blue');
  log('  1. Events from daily_briefs → events table', 'blue');
  log('  2. Narratives from projects → narratives table', 'blue');

  // Run migrations
  const eventResults = await migrateEvents();
  const narrativeResults = await migrateNarratives();

  // Verify results
  const verification = await verifyMigration();

  // Summary
  log('\n' + '='.repeat(60), 'cyan');
  log('MIGRATION SUMMARY', 'cyan');
  log('='.repeat(60), 'cyan');

  log('\nEvents Migration:', 'blue');
  log(`  ✅ Migrated: ${eventResults.migrated}`, 'green');
  log(`  ⏭️  Skipped: ${eventResults.skipped}`, 'yellow');
  log(`  ❌ Errors: ${eventResults.errors}`, eventResults.errors > 0 ? 'red' : 'green');

  log('\nNarratives Migration:', 'blue');
  log(`  ✅ Migrated: ${narrativeResults.migrated}`, 'green');
  log(`  ❌ Errors: ${narrativeResults.errors}`, narrativeResults.errors > 0 ? 'red' : 'green');

  log('\nFinal Verification:', 'blue');
  log(`  📅 Total events: ${verification.eventCount}`, 'green');
  log(`  📝 Total narratives: ${verification.narrativeCount}`, 'green');

  if (eventResults.errors === 0 && narrativeResults.errors === 0) {
    log('\n🎉 MIGRATION COMPLETED SUCCESSFULLY!', 'green');
    log('Your data has been migrated to the new three-entity architecture.', 'green');
  } else {
    log('\n⚠️  MIGRATION COMPLETED WITH SOME ERRORS', 'yellow');
    log('Please review the errors above. Most data was migrated successfully.', 'yellow');
  }

  log('\n' + '='.repeat(60) + '\n', 'cyan');
}

// Run if executed directly
if (require.main === module) {
  runPhase2Migration().catch(error => {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    process.exit(1);
  });
}

module.exports = { migrateEvents, migrateNarratives, verifyMigration };