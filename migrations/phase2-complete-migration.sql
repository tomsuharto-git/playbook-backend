-- =====================================================
-- PHASE 2 COMPLETE MIGRATION
-- =====================================================
-- Creates tables if they don't exist, then migrates data
-- Run this directly in Supabase SQL Editor
-- =====================================================

-- Start transaction for safety
BEGIN;

-- =====================================================
-- STEP 0: CREATE TABLES IF THEY DON'T EXIST
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '📦 CHECKING AND CREATING TABLES IF NEEDED';
  RAISE NOTICE '==================================================';
END $$;

-- Create events table if it doesn't exist
CREATE TABLE IF NOT EXISTS events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- Core event data
  title TEXT NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE,
  location TEXT,
  attendees JSONB DEFAULT '[]',
  description TEXT,

  -- Calendar integration
  calendar_source TEXT DEFAULT 'google', -- 'google', 'outlook', 'manual'
  calendar_id TEXT, -- External calendar event ID

  -- Briefing fields (for daily brief generation)
  briefing TEXT, -- AI-generated briefing for this event
  briefing_type TEXT, -- 'work_project', 'work_general', 'life'
  category TEXT, -- 'work', 'life', 'health', etc.

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure we don't duplicate calendar events
  UNIQUE(calendar_id, calendar_source)
);

-- Create narratives table if it doesn't exist
CREATE TABLE IF NOT EXISTS narratives (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE, -- Can be NULL for orphan narratives

  -- Core narrative data
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  headline TEXT NOT NULL, -- Brief summary (e.g., "Completed API integration")
  bullets JSONB DEFAULT '[]', -- Array of bullet points

  -- Source tracking
  source TEXT NOT NULL DEFAULT 'note', -- 'meeting', 'email', 'note', 'event', 'daily_brief'
  source_file TEXT, -- Path to source file if from vault
  source_id TEXT, -- ID of source (email ID, event ID, etc.)

  -- Significance scoring (for filtering/prioritization)
  significance_score DECIMAL(3,2) DEFAULT 0.5, -- 0.0 to 1.0
  auto_generated BOOLEAN DEFAULT false,

  -- Additional metadata
  participants JSONB DEFAULT '[]', -- People involved
  keywords JSONB DEFAULT '[]', -- Extracted keywords

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Prevent duplicate narratives for same day/project
  UNIQUE(project_id, date, headline)
);

-- Create news table if it doesn't exist (placeholder for future)
CREATE TABLE IF NOT EXISTS news (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- Article data
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  source_name TEXT, -- 'TechCrunch', 'WSJ', etc.
  published_at TIMESTAMP WITH TIME ZONE,

  -- Content
  summary TEXT,
  full_text TEXT,

  -- Relevance
  relevance_score DECIMAL(3,2) DEFAULT 0.5, -- 0.0 to 1.0
  keywords JSONB DEFAULT '[]',

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(url)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_events_project_id ON events(project_id);
CREATE INDEX IF NOT EXISTS idx_events_start_time ON events(start_time);
CREATE INDEX IF NOT EXISTS idx_events_calendar ON events(calendar_id, calendar_source);
CREATE INDEX IF NOT EXISTS idx_narratives_project_id ON narratives(project_id);
CREATE INDEX IF NOT EXISTS idx_narratives_date ON narratives(date);
CREATE INDEX IF NOT EXISTS idx_narratives_source ON narratives(source);
CREATE INDEX IF NOT EXISTS idx_news_project_id ON news(project_id);
CREATE INDEX IF NOT EXISTS idx_news_published_at ON news(published_at);

-- Enable RLS (only if not already enabled)
DO $$
BEGIN
  -- Enable RLS for events
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'events' AND rowsecurity = true
  ) THEN
    ALTER TABLE events ENABLE ROW LEVEL SECURITY;
  END IF;

  -- Enable RLS for narratives
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'narratives' AND rowsecurity = true
  ) THEN
    ALTER TABLE narratives ENABLE ROW LEVEL SECURITY;
  END IF;

  -- Enable RLS for news
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'news' AND rowsecurity = true
  ) THEN
    ALTER TABLE news ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Drop existing policies if they exist and recreate them
DROP POLICY IF EXISTS "Enable all for events" ON events;
DROP POLICY IF EXISTS "Enable all for narratives" ON narratives;
DROP POLICY IF EXISTS "Enable all for news" ON news;

-- Create policies (allow all for now - adjust based on auth needs)
CREATE POLICY "Enable all for events" ON events FOR ALL USING (true);
CREATE POLICY "Enable all for narratives" ON narratives FOR ALL USING (true);
CREATE POLICY "Enable all for news" ON news FOR ALL USING (true);

DO $$
BEGIN
  RAISE NOTICE '✅ Tables verified/created successfully';
END $$;

-- =====================================================
-- STEP 1: MIGRATE EVENTS FROM DAILY_BRIEFS
-- =====================================================
DO $$
DECLARE
  event_count INTEGER := 0;
  skip_count INTEGER := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '📅 MIGRATING EVENTS FROM DAILY_BRIEFS';
  RAISE NOTICE '==================================================';

  -- Check if daily_briefs exists and has data
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'daily_briefs'
  ) THEN
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
    RAISE NOTICE '✅ Migrated % events', event_count;
  ELSE
    RAISE NOTICE '⚠️  daily_briefs table not found, skipping event migration';
  END IF;
END $$;

-- =====================================================
-- STEP 2: MIGRATE NARRATIVES FROM PROJECTS
-- =====================================================
DO $$
DECLARE
  narrative_count INTEGER := 0;
  rows_inserted INTEGER := 0;
  project_record RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '📝 MIGRATING NARRATIVES FROM PROJECTS';
  RAISE NOTICE '==================================================';

  -- Check if projects table has narrative column
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'projects'
    AND column_name = 'narrative'
  ) THEN
    -- Process each project with narratives
    FOR project_record IN
      SELECT id, name, narrative
      FROM projects
      WHERE narrative IS NOT NULL
        AND jsonb_typeof(narrative) = 'array'
        AND jsonb_array_length(narrative) > 0
    LOOP
      BEGIN
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

        GET DIAGNOSTICS rows_inserted = ROW_COUNT;
        narrative_count := narrative_count + rows_inserted;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '  ⚠️  Error processing project %: %', project_record.name, SQLERRM;
      END;
    END LOOP;

    RAISE NOTICE '✅ Total narratives migrated: %', narrative_count;
  ELSE
    RAISE NOTICE '⚠️  projects.narrative column not found, skipping narrative migration';
  END IF;
END $$;

-- =====================================================
-- STEP 3: VERIFICATION
-- =====================================================
DO $$
DECLARE
  event_total INTEGER;
  narrative_total INTEGER;
  news_total INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🔍 VERIFICATION';
  RAISE NOTICE '==================================================';

  SELECT COUNT(*) INTO event_total FROM events;
  SELECT COUNT(*) INTO narrative_total FROM narratives;
  SELECT COUNT(*) INTO news_total FROM news;

  RAISE NOTICE '';
  RAISE NOTICE '📊 FINAL RESULTS:';
  RAISE NOTICE '  Events table: % records', event_total;
  RAISE NOTICE '  Narratives table: % records', narrative_total;
  RAISE NOTICE '  News table: % records', news_total;
  RAISE NOTICE '';

  IF event_total > 0 OR narrative_total > 0 THEN
    RAISE NOTICE '🎉 Migration successful!';
  ELSE
    RAISE NOTICE '⚠️  No data was migrated. This could be normal if:';
    RAISE NOTICE '  - This is a fresh installation';
    RAISE NOTICE '  - Data was already migrated';
    RAISE NOTICE '  - Source tables are empty';
  END IF;
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
  RAISE NOTICE '✅ PHASE 2 COMPLETE!';
  RAISE NOTICE '==================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables are ready for the three-entity architecture:';
  RAISE NOTICE '  • events - Calendar events and meetings';
  RAISE NOTICE '  • narratives - Project timelines and context';
  RAISE NOTICE '  • news - News articles (placeholder)';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Restart your backend server to refresh schema';
  RAISE NOTICE '2. Run: node test-phase2.js';
  RAISE NOTICE '3. Update watchers to use new architecture';
  RAISE NOTICE '==================================================';
END $$;