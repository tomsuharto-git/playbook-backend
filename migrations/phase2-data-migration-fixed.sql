-- =====================================================
-- PHASE 2 DATA MIGRATION (FIXED)
-- =====================================================
-- Migrates existing data to new three-entity architecture
-- Run this directly in Supabase SQL Editor
-- =====================================================

-- Start transaction for safety
BEGIN;

-- =====================================================
-- STEP 1: MIGRATE EVENTS FROM DAILY_BRIEFS
-- =====================================================
DO $$
DECLARE
  event_count INTEGER := 0;
  skip_count INTEGER := 0;
BEGIN
  RAISE NOTICE '📅 MIGRATING EVENTS FROM DAILY_BRIEFS';
  RAISE NOTICE '==================================================';

  -- Insert events from daily_briefs calendar_events JSONB
  WITH event_data AS (
    SELECT
      db.id as brief_id,
      db.generated_at,
      jsonb_array_elements(db.calendar_events) as event_json
    FROM daily_briefs db
    WHERE db.calendar_events IS NOT NULL
      AND jsonb_typeof(db.calendar_events) = 'array'
      AND jsonb_array_length(db.calendar_events) > 0
  ),
  event_extract AS (
    SELECT
      event_json->>'id' as calendar_id,
      COALESCE(
        event_json->>'summary',
        event_json->>'title',
        'Untitled Event'
      ) as title,
      CASE
        WHEN event_json->'start'->>'dateTime' IS NOT NULL
          THEN (event_json->'start'->>'dateTime')::timestamp with time zone
        WHEN event_json->>'start_time' IS NOT NULL
          THEN (event_json->>'start_time')::timestamp with time zone
        ELSE NULL
      END as start_time,
      CASE
        WHEN event_json->'end'->>'dateTime' IS NOT NULL
          THEN (event_json->'end'->>'dateTime')::timestamp with time zone
        WHEN event_json->>'end_time' IS NOT NULL
          THEN (event_json->>'end_time')::timestamp with time zone
        ELSE NULL
      END as end_time,
      event_json->>'location' as location,
      COALESCE(event_json->'attendees', '[]'::jsonb) as attendees,
      event_json->>'description' as description,
      COALESCE(event_json->>'calendar_source', 'google') as calendar_source,
      event_json->>'briefing' as briefing,
      event_json->>'category' as category,
      -- Determine briefing_type
      CASE
        WHEN event_json->>'category' = 'work' THEN 'work_general'
        WHEN event_json->>'category' = 'life' THEN 'life'
        ELSE NULL
      END as briefing_type,
      -- Try to match project
      (
        SELECT id FROM projects p
        WHERE event_json->>'project_name' IS NOT NULL
          AND p.name ILIKE '%' || (event_json->>'project_name') || '%'
        LIMIT 1
      ) as project_id,
      COALESCE(generated_at, NOW()) as created_at
    FROM event_data
    WHERE event_json->>'id' IS NOT NULL
      AND (
        (event_json->'start'->>'dateTime' IS NOT NULL OR event_json->>'start_time' IS NOT NULL)
      )
  )
  INSERT INTO events (
    project_id,
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
    project_id,
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
  FROM event_extract
  WHERE start_time IS NOT NULL  -- Only insert events with valid start times
  ON CONFLICT (calendar_id, calendar_source) DO NOTHING;

  GET DIAGNOSTICS event_count = ROW_COUNT;

  -- Count skipped events
  SELECT COUNT(*) INTO skip_count
  FROM (
    SELECT jsonb_array_elements(calendar_events)->>'id' as cal_id,
           COALESCE(jsonb_array_elements(calendar_events)->>'calendar_source', 'google') as cal_source
    FROM daily_briefs
    WHERE calendar_events IS NOT NULL
  ) potential_events
  WHERE EXISTS (
    SELECT 1 FROM events e
    WHERE e.calendar_id = potential_events.cal_id
      AND e.calendar_source = potential_events.cal_source
  );

  RAISE NOTICE '✅ Migrated % events', event_count;
  RAISE NOTICE '⏭️  Skipped % existing events', skip_count;
END $$;

-- =====================================================
-- STEP 2: MIGRATE NARRATIVES FROM PROJECTS
-- =====================================================
DO $$
DECLARE
  narrative_count INTEGER := 0;
  project_record RECORD;
  narrative_json jsonb;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '📝 MIGRATING NARRATIVES FROM PROJECTS';
  RAISE NOTICE '==================================================';

  -- Process each project with narratives
  FOR project_record IN
    SELECT id, name, narrative
    FROM projects
    WHERE narrative IS NOT NULL
      AND jsonb_typeof(narrative) = 'array'
      AND jsonb_array_length(narrative) > 0
  LOOP
    RAISE NOTICE 'Processing project: % (% narratives)',
      project_record.name,
      jsonb_array_length(project_record.narrative);

    -- Insert narratives for this project
    WITH narrative_extract AS (
      SELECT
        project_record.id as project_id,
        COALESCE(n->>'date', CURRENT_DATE::text)::date as date,
        COALESCE(n->>'headline', 'No headline') as headline,
        COALESCE(n->'bullets', '[]'::jsonb) as bullets,
        COALESCE(n->>'source', 'note') as source,
        n->>'source_file' as source_file,
        n->>'source_id' as source_id,
        CASE
          WHEN n->>'source' = 'meeting' THEN 0.8
          WHEN n->>'source' = 'email' THEN 0.6
          WHEN n->>'source' = 'event' THEN 0.7
          ELSE 0.5
        END as significance_score,
        COALESCE(n->'participants', '[]'::jsonb) as participants,
        COALESCE(n->'keywords', '[]'::jsonb) as keywords,
        COALESCE((n->>'created_at')::timestamp, NOW()) as created_at
      FROM jsonb_array_elements(project_record.narrative) as n
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
      date,
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
    ON CONFLICT (project_id, date, headline) DO NOTHING;

    GET DIAGNOSTICS narrative_count = narrative_count + ROW_COUNT;
  END LOOP;

  RAISE NOTICE '✅ Total narratives migrated: %', narrative_count;
END $$;

-- =====================================================
-- STEP 3: CREATE ORPHAN NARRATIVES (without projects)
-- =====================================================
DO $$
DECLARE
  orphan_count INTEGER := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🔍 CREATING ORPHAN NARRATIVES';
  RAISE NOTICE '==================================================';

  -- Create narratives from daily_briefs that don't have projects
  WITH brief_narratives AS (
    SELECT
      NULL::uuid as project_id,  -- Orphan narrative
      COALESCE(db.generated_at::date, CURRENT_DATE) as date,
      COALESCE(
        'Daily Brief: ' || to_char(db.generated_at, 'Mon DD'),
        'Daily Brief'
      ) as headline,
      ARRAY[
        COALESCE('Tasks: ' || jsonb_array_length(db.pending_tasks)::text || ' pending', ''),
        COALESCE('Events: ' || jsonb_array_length(db.calendar_events)::text || ' scheduled', ''),
        CASE
          WHEN db.weather_info IS NOT NULL
          THEN 'Weather: ' || (db.weather_info->>'temperature')::text || '°'
          ELSE ''
        END
      ]::text[] as bullets,
      'daily_brief' as source,
      NULL as source_file,
      db.id::text as source_id,
      0.4 as significance_score,  -- Low significance for auto-generated briefs
      '[]'::jsonb as participants,
      '["daily", "brief", "summary"]'::jsonb as keywords,
      NOW() as created_at
    FROM daily_briefs db
    WHERE db.generated_at >= CURRENT_DATE - INTERVAL '30 days'  -- Only recent briefs
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
    date,
    headline,
    array_to_json(bullets)::jsonb,
    source,
    source_file,
    source_id,
    significance_score,
    true,
    participants,
    keywords,
    created_at
  FROM brief_narratives
  ON CONFLICT (project_id, date, headline) DO NOTHING;

  GET DIAGNOSTICS orphan_count = ROW_COUNT;
  RAISE NOTICE '✅ Created % orphan narratives from daily briefs', orphan_count;
END $$;

-- =====================================================
-- STEP 4: VERIFICATION
-- =====================================================
DO $$
DECLARE
  event_total INTEGER;
  narrative_total INTEGER;
  orphan_total INTEGER;
  recent_events INTEGER;
  recent_narratives INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🔍 VERIFICATION';
  RAISE NOTICE '==================================================';

  SELECT COUNT(*) INTO event_total FROM events;
  SELECT COUNT(*) INTO narrative_total FROM narratives;
  SELECT COUNT(*) INTO orphan_total FROM narratives WHERE project_id IS NULL;

  SELECT COUNT(*) INTO recent_events
  FROM events
  WHERE created_at >= CURRENT_DATE - INTERVAL '7 days';

  SELECT COUNT(*) INTO recent_narratives
  FROM narratives
  WHERE created_at >= CURRENT_DATE - INTERVAL '7 days';

  RAISE NOTICE '';
  RAISE NOTICE '📊 MIGRATION RESULTS:';
  RAISE NOTICE '  Total events: %', event_total;
  RAISE NOTICE '  Total narratives: %', narrative_total;
  RAISE NOTICE '  Orphan narratives: %', orphan_total;
  RAISE NOTICE '';
  RAISE NOTICE '  Recent events (7 days): %', recent_events;
  RAISE NOTICE '  Recent narratives (7 days): %', recent_narratives;

  -- Show sample data
  RAISE NOTICE '';
  RAISE NOTICE '📋 SAMPLE MIGRATED DATA:';

  -- Sample events
  RAISE NOTICE '';
  RAISE NOTICE 'Recent Events:';
  FOR event_record IN
    SELECT title, start_time, category
    FROM events
    ORDER BY created_at DESC
    LIMIT 3
  LOOP
    RAISE NOTICE '  - % (% - %)',
      event_record.title,
      to_char(event_record.start_time, 'Mon DD HH24:MI'),
      COALESCE(event_record.category, 'uncategorized');
  END LOOP;

  -- Sample narratives
  RAISE NOTICE '';
  RAISE NOTICE 'Recent Narratives:';
  FOR narrative_record IN
    SELECT n.headline, n.date, p.name as project_name
    FROM narratives n
    LEFT JOIN projects p ON n.project_id = p.id
    ORDER BY n.created_at DESC
    LIMIT 3
  LOOP
    RAISE NOTICE '  - % (% - %)',
      narrative_record.headline,
      narrative_record.date,
      COALESCE(narrative_record.project_name, 'No project');
  END LOOP;
END $$;

-- Commit the transaction
COMMIT;

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==================================================';
  RAISE NOTICE '🎉 PHASE 2 MIGRATION COMPLETE!';
  RAISE NOTICE '==================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Your data has been successfully migrated to the';
  RAISE NOTICE 'new three-entity architecture.';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Verify the migrated data in your tables';
  RAISE NOTICE '2. Restart your backend server to refresh schema cache';
  RAISE NOTICE '3. Test the new central processor';
  RAISE NOTICE '4. Update your email and vault watchers';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables are now ready for the new architecture!';
  RAISE NOTICE '==================================================';
END $$;