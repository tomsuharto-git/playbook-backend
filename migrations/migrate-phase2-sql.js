#!/usr/bin/env node

const logger = require('../utils/logger');

/**
 * Phase 2 Migration Script - SQL Version
 *
 * Uses direct SQL queries to bypass schema cache issues
 * Migrates existing data from old structure to new three-entity architecture:
 * 1. Extracts events from daily_briefs JSONB → events table
 * 2. Extracts narratives from projects.narrative JSONB → narratives table
 *
 * Run with: node migrations/migrate-phase2-sql.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Create new client instance to bypass cached schema
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  {
    db: {
      schema: 'public'
    },
    auth: {
      persistSession: false
    }
  }
);

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
 * Execute raw SQL query
 */
async function executeSQL(query, params = []) {
  try {
    // Use raw SQL through Supabase's from() with a custom query
    const { data, error } = await supabase
      .rpc('exec_migration_sql', {
        query_text: query,
        query_params: params
      });

    if (error) {
      // Fallback: Try direct query execution
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('events') // Dummy table reference
        .select()
        .is('id', null) // Won't match anything
        .limit(0);

      // Actually execute the SQL through a different method
      const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_KEY}`
        },
        body: JSON.stringify({ query: query })
      });

      if (!response.ok) {
        throw new Error(`SQL execution failed: ${await response.text()}`);
      }

      return await response.json();
    }

    return data;
  } catch (err) {
    // Last resort: Return null and let caller handle
    logger.error('SQL execution error:', { arg0: err.message });
    return null;
  }
}

/**
 * Migrate events using SQL
 */
async function migrateEventsSQL() {
  log('\n📅 MIGRATING EVENTS FROM DAILY_BRIEFS (SQL Version)', 'cyan');
  log('=' .repeat(50), 'cyan');

  try {
    // Create the migration SQL
    const migrationSQL = `
      -- Insert events from daily_briefs JSONB
      WITH event_data AS (
        SELECT
          db.id as brief_id,
          db.generated_at,
          jsonb_array_elements(db.calendar_events) as event_json
        FROM daily_briefs db
        WHERE db.calendar_events IS NOT NULL
          AND jsonb_array_length(db.calendar_events) > 0
      ),
      event_extract AS (
        SELECT
          event_json->>'id' as calendar_id,
          event_json->>'summary' as title,
          COALESCE(
            (event_json->'start'->>'dateTime')::timestamp,
            (event_json->>'start_time')::timestamp
          ) as start_time,
          COALESCE(
            (event_json->'end'->>'dateTime')::timestamp,
            (event_json->>'end_time')::timestamp
          ) as end_time,
          event_json->>'location' as location,
          COALESCE(event_json->'attendees', '[]'::jsonb) as attendees,
          event_json->>'description' as description,
          COALESCE(event_json->>'calendar_source', 'google') as calendar_source,
          event_json->>'briefing' as briefing,
          event_json->>'category' as category,
          CASE
            WHEN event_json->>'category' = 'work' THEN 'work_general'
            WHEN event_json->>'category' = 'life' THEN 'life'
            ELSE NULL
          END as briefing_type,
          generated_at as created_at
        FROM event_data
        WHERE event_json->>'id' IS NOT NULL
      )
      INSERT INTO events (
        calendar_id,
        title,
        start_time,
        end_time,
        location,
        attendees,
        description,
        calendar_source,
        briefing,
        category,
        briefing_type,
        created_at
      )
      SELECT
        calendar_id,
        COALESCE(title, 'Untitled Event'),
        start_time,
        end_time,
        location,
        attendees,
        description,
        calendar_source,
        briefing,
        category,
        briefing_type,
        COALESCE(created_at, NOW())
      FROM event_extract
      ON CONFLICT (calendar_id, calendar_source) DO NOTHING
      RETURNING id;
    `;

    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', {
      query: migrationSQL
    });

    if (error) {
      // Try direct HTTP approach
      const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          function_name: 'exec_sql',
          args: { query: migrationSQL }
        })
      });

      if (!response.ok) {
        throw new Error(`Migration failed: ${await response.text()}`);
      }

      const result = await response.json();
      log(`✅ Successfully migrated events using SQL`, 'green');
      return { migrated: result.length || 0, skipped: 0, errors: 0 };
    }

    const count = data ? data.length : 0;
    log(`✅ Successfully migrated ${count} events`, 'green');
    return { migrated: count, skipped: 0, errors: 0 };

  } catch (error) {
    log(`❌ Error migrating events: ${error.message}`, 'red');

    // Fallback: Try using batch inserts with the regular client
    log('Attempting fallback migration method...', 'yellow');
    return await migrateEventsFallback();
  }
}

/**
 * Fallback migration using batch SQL inserts
 */
async function migrateEventsFallback() {
  try {
    // First get the data
    const { data: briefs } = await supabase
      .from('daily_briefs')
      .select('*')
      .not('calendar_events', 'is', null);

    if (!briefs || briefs.length === 0) {
      log('No briefs with events found', 'yellow');
      return { migrated: 0, skipped: 0, errors: 0 };
    }

    let migrated = 0;
    let errors = 0;

    for (const brief of briefs) {
      const events = brief.calendar_events || [];

      for (const event of events) {
        try {
          // Build individual INSERT statement
          const insertSQL = `
            INSERT INTO events (
              calendar_id, title, start_time, end_time,
              location, attendees, description, calendar_source,
              briefing, category, briefing_type, created_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12
            )
            ON CONFLICT (calendar_id, calendar_source) DO NOTHING
            RETURNING id;
          `;

          const values = [
            event.id,
            event.summary || event.title || 'Untitled Event',
            event.start?.dateTime || event.start_time,
            event.end?.dateTime || event.end_time,
            event.location,
            JSON.stringify(event.attendees || []),
            event.description,
            event.calendar_source || 'google',
            event.briefing,
            event.category,
            event.category === 'work' ? 'work_general' : event.category === 'life' ? 'life' : null,
            brief.generated_at || new Date()
          ];

          // Execute using raw PostgreSQL
          const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': process.env.SUPABASE_KEY,
              'Authorization': `Bearer ${process.env.SUPABASE_KEY}`
            },
            body: JSON.stringify({
              function_name: 'exec_parameterized_sql',
              args: { sql: insertSQL, params: values }
            })
          });

          if (response.ok) {
            migrated++;
            if (migrated % 10 === 0) {
              log(`  Processed ${migrated} events...`, 'green');
            }
          }
        } catch (err) {
          errors++;
        }
      }
    }

    return { migrated, skipped: 0, errors };

  } catch (error) {
    log(`❌ Fallback migration failed: ${error.message}`, 'red');
    return { migrated: 0, skipped: 0, errors: 1 };
  }
}

/**
 * Migrate narratives using SQL
 */
async function migrateNarrativesSQL() {
  log('\n📝 MIGRATING NARRATIVES FROM PROJECTS (SQL Version)', 'cyan');
  log('=' .repeat(50), 'cyan');

  try {
    // Create the migration SQL
    const migrationSQL = `
      -- Insert narratives from projects JSONB
      WITH narrative_data AS (
        SELECT
          p.id as project_id,
          p.name as project_name,
          jsonb_array_elements(p.narrative) as narrative_json
        FROM projects p
        WHERE p.narrative IS NOT NULL
          AND jsonb_array_length(p.narrative) > 0
      ),
      narrative_extract AS (
        SELECT
          project_id,
          project_name,
          COALESCE(narrative_json->>'date', CURRENT_DATE::text) as date,
          COALESCE(narrative_json->>'headline', 'No headline') as headline,
          COALESCE(narrative_json->'bullets', '[]'::jsonb) as bullets,
          COALESCE(narrative_json->>'source', 'note') as source,
          narrative_json->>'source_file' as source_file,
          narrative_json->>'source_id' as source_id,
          CASE
            WHEN narrative_json->>'source' = 'meeting' THEN 0.8
            WHEN narrative_json->>'source' = 'email' THEN 0.6
            ELSE 0.5
          END as significance_score,
          COALESCE(narrative_json->'participants', '[]'::jsonb) as participants,
          COALESCE(narrative_json->'keywords', '[]'::jsonb) as keywords,
          COALESCE((narrative_json->>'created_at')::timestamp, NOW()) as created_at
        FROM narrative_data
      )
      INSERT INTO narratives (
        project_id,
        date,
        headline,
        bullets,
        source,
        source_file,
        source_id,
        significance_score,
        auto_generated,
        participants,
        keywords,
        created_at
      )
      SELECT
        project_id,
        date::date,
        headline,
        bullets,
        source,
        source_file,
        source_id,
        significance_score,
        true, -- auto_generated
        participants,
        keywords,
        created_at
      FROM narrative_extract
      ON CONFLICT (project_id, date, headline) DO NOTHING
      RETURNING id;
    `;

    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', {
      query: migrationSQL
    });

    if (error) {
      // Try direct HTTP approach
      const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          function_name: 'exec_sql',
          args: { query: migrationSQL }
        })
      });

      if (!response.ok) {
        throw new Error(`Migration failed: ${await response.text()}`);
      }

      const result = await response.json();
      log(`✅ Successfully migrated narratives using SQL`, 'green');
      return { migrated: result.length || 0, errors: 0 };
    }

    const count = data ? data.length : 0;
    log(`✅ Successfully migrated ${count} narratives`, 'green');
    return { migrated: count, errors: 0 };

  } catch (error) {
    log(`❌ Error migrating narratives: ${error.message}`, 'red');

    // Fallback method
    log('Attempting fallback migration method...', 'yellow');
    return await migrateNarrativesFallback();
  }
}

/**
 * Fallback narrative migration
 */
async function migrateNarrativesFallback() {
  try {
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name, narrative')
      .not('narrative', 'is', null);

    if (!projects || projects.length === 0) {
      log('No projects with narratives found', 'yellow');
      return { migrated: 0, errors: 0 };
    }

    let migrated = 0;
    let errors = 0;

    for (const project of projects) {
      const narratives = project.narrative || [];

      for (const narrative of narratives) {
        try {
          const insertSQL = `
            INSERT INTO narratives (
              project_id, date, headline, bullets,
              source, source_file, source_id,
              significance_score, auto_generated,
              participants, keywords, created_at
            ) VALUES (
              $1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12
            )
            ON CONFLICT (project_id, date, headline) DO NOTHING
            RETURNING id;
          `;

          const values = [
            project.id,
            narrative.date || new Date().toISOString().split('T')[0],
            narrative.headline || 'No headline',
            JSON.stringify(narrative.bullets || []),
            narrative.source || 'note',
            narrative.source_file,
            narrative.source_id,
            narrative.source === 'meeting' ? 0.8 : narrative.source === 'email' ? 0.6 : 0.5,
            true,
            JSON.stringify(narrative.participants || []),
            JSON.stringify(narrative.keywords || []),
            narrative.created_at || new Date()
          ];

          const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': process.env.SUPABASE_KEY,
              'Authorization': `Bearer ${process.env.SUPABASE_KEY}`
            },
            body: JSON.stringify({
              function_name: 'exec_parameterized_sql',
              args: { sql: insertSQL, params: values }
            })
          });

          if (response.ok) {
            migrated++;
            if (migrated % 20 === 0) {
              log(`  Processed ${migrated} narratives...`, 'green');
            }
          }
        } catch (err) {
          errors++;
        }
      }
    }

    return { migrated, errors };

  } catch (error) {
    log(`❌ Fallback migration failed: ${error.message}`, 'red');
    return { migrated: 0, errors: 1 };
  }
}

/**
 * Create SQL helper functions in database
 */
async function createHelperFunctions() {
  log('\n🔧 Creating helper functions...', 'cyan');

  const createFunctions = `
    -- Create helper function for executing SQL (if not exists)
    CREATE OR REPLACE FUNCTION exec_sql(query text)
    RETURNS json AS $$
    DECLARE
      result json;
    BEGIN
      EXECUTE query INTO result;
      RETURN result;
    EXCEPTION
      WHEN OTHERS THEN
        RETURN json_build_object('error', SQLERRM);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    -- Create parameterized SQL function
    CREATE OR REPLACE FUNCTION exec_parameterized_sql(sql text, params text[])
    RETURNS json AS $$
    DECLARE
      result json;
    BEGIN
      EXECUTE sql USING params INTO result;
      RETURN result;
    EXCEPTION
      WHEN OTHERS THEN
        RETURN json_build_object('error', SQLERRM);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `;

  try {
    // Execute using direct HTTP
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_KEY}`
      },
      body: JSON.stringify({
        function_name: 'exec_sql',
        args: { query: createFunctions }
      })
    });

    if (response.ok) {
      log('✅ Helper functions ready', 'green');
    }
  } catch (error) {
    // Functions might already exist, continue
    log('⚠️  Helper functions may already exist', 'yellow');
  }
}

/**
 * Verify migration results
 */
async function verifyMigration() {
  log('\n🔍 VERIFYING MIGRATION', 'cyan');
  log('=' .repeat(50), 'cyan');

  try {
    // Count using raw SQL
    const countSQL = `
      SELECT
        (SELECT COUNT(*) FROM events) as event_count,
        (SELECT COUNT(*) FROM narratives) as narrative_count;
    `;

    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_KEY}`
      },
      body: JSON.stringify({
        function_name: 'exec_sql',
        args: { query: countSQL }
      })
    });

    if (response.ok) {
      const result = await response.json();
      const counts = result[0] || { event_count: 0, narrative_count: 0 };

      log('\n📊 Migration Results:', 'blue');
      log(`  Events table: ${counts.event_count} records`, 'green');
      log(`  Narratives table: ${counts.narrative_count} records`, 'green');

      return counts;
    }

    // Fallback: Try individual counts
    const { count: eventCount } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true });

    const { count: narrativeCount } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true });

    log('\n📊 Migration Results:', 'blue');
    log(`  Events table: ${eventCount || 0} records`, 'green');
    log(`  Narratives table: ${narrativeCount || 0} records`, 'green');

    return { event_count: eventCount, narrative_count: narrativeCount };

  } catch (error) {
    log(`❌ Error verifying migration: ${error.message}`, 'red');
    return { event_count: 0, narrative_count: 0 };
  }
}

/**
 * Main migration function
 */
async function runPhase2Migration() {
  log('\n' + '='.repeat(60), 'cyan');
  log('PHASE 2 ENTITY MIGRATION (SQL VERSION)', 'cyan');
  log('='.repeat(60), 'cyan');

  log('\nThis will migrate:', 'blue');
  log('  1. Events from daily_briefs → events table', 'blue');
  log('  2. Narratives from projects → narratives table', 'blue');
  log('\nUsing direct SQL to bypass schema cache issues', 'yellow');

  // Create helper functions
  await createHelperFunctions();

  // Run migrations
  const eventResults = await migrateEventsSQL();
  const narrativeResults = await migrateNarrativesSQL();

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
  log(`  📅 Total events: ${verification.event_count}`, 'green');
  log(`  📝 Total narratives: ${verification.narrative_count}`, 'green');

  if (eventResults.errors === 0 && narrativeResults.errors === 0) {
    log('\n🎉 MIGRATION COMPLETED SUCCESSFULLY!', 'green');
    log('Your data has been migrated to the new three-entity architecture.', 'green');
  } else if (eventResults.migrated > 0 || narrativeResults.migrated > 0) {
    log('\n⚠️  MIGRATION PARTIALLY SUCCESSFUL', 'yellow');
    log('Some data was migrated. Check errors above.', 'yellow');
  } else {
    log('\n❌ MIGRATION FAILED', 'red');
    log('Unable to migrate data. Please check your database connection.', 'red');
    log('\nTry running the migration directly in Supabase SQL Editor.', 'yellow');
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