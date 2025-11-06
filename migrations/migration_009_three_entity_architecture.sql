-- Migration 009: Three-Entity Architecture
-- Created: October 28, 2025
-- Purpose: Implement discrete tables for Events, Narratives, and News (placeholder)
-- Part of the unified project intelligence system refactoring

-- ============================================
-- 1. EVENTS TABLE (extracted from daily_briefs)
-- ============================================

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- Core fields
  title TEXT NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE,
  end_time TIMESTAMP WITH TIME ZONE,

  -- Event details
  location TEXT,
  attendees JSONB DEFAULT '[]', -- [{name, email, responseStatus}]
  description TEXT,
  calendar_source TEXT CHECK (calendar_source IN ('google', 'outlook', 'manual')),
  calendar_id TEXT, -- Original calendar event ID for deduplication

  -- AI-generated content
  briefing TEXT,
  briefing_type TEXT CHECK (briefing_type IN ('work_project', 'work_general', 'life', NULL)),

  -- Categorization
  category TEXT CHECK (category IN ('work', 'life')),
  significance_score DECIMAL(3,2) CHECK (significance_score >= 0 AND significance_score <= 1),

  -- Relationships (to be populated later)
  related_tasks UUID[], -- Links to tasks table
  related_narratives UUID[], -- Links to narratives table

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Prevent duplicate calendar events
  CONSTRAINT unique_calendar_event UNIQUE(calendar_id, calendar_source)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_project_date ON events(project_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_events_calendar_source ON events(calendar_source);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
CREATE INDEX IF NOT EXISTS idx_events_start_time ON events(start_time);

-- ============================================
-- 2. NARRATIVES TABLE (extracted from projects.narrative JSONB)
-- ============================================

CREATE TABLE IF NOT EXISTS narratives (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL, -- Can be NULL for orphan narratives

  -- Core content
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  headline TEXT NOT NULL,
  bullets TEXT[] DEFAULT '{}', -- Array of bullet points

  -- Source tracking
  source TEXT CHECK (source IN ('meeting', 'email', 'note', 'manual', 'event', 'code')),
  source_file TEXT, -- Path to source file if applicable
  source_id TEXT, -- Email ID, event ID, etc.

  -- Quality metrics
  significance_score DECIMAL(3,2) DEFAULT 0.5 CHECK (significance_score >= 0 AND significance_score <= 1),
  auto_generated BOOLEAN DEFAULT true,

  -- Rich metadata
  participants TEXT[] DEFAULT '{}', -- People involved
  keywords TEXT[] DEFAULT '{}', -- For searching

  -- Relationships
  related_tasks UUID[] DEFAULT '{}',
  related_events UUID[] DEFAULT '{}',
  parent_narrative UUID REFERENCES narratives(id), -- For narrative threads

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_narratives_project_date ON narratives(project_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_narratives_significance ON narratives(significance_score DESC);
CREATE INDEX IF NOT EXISTS idx_narratives_source ON narratives(source);
CREATE INDEX IF NOT EXISTS idx_narratives_date ON narratives(date DESC);

-- Full-text search index for narrative content
CREATE INDEX IF NOT EXISTS idx_narratives_search ON narratives
  USING gin(to_tsvector('english',
    COALESCE(headline, '') || ' ' ||
    COALESCE(array_to_string(bullets, ' '), '')
  ));

-- ============================================
-- 3. NEWS TABLE (placeholder for future implementation)
-- ============================================

CREATE TABLE IF NOT EXISTS news (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- Core fields
  headline TEXT NOT NULL,
  summary TEXT,
  source_url TEXT,
  source_name TEXT, -- 'TechCrunch', 'AdAge', 'WSJ', etc.

  -- Metadata
  published_date TIMESTAMP WITH TIME ZONE,
  relevance_score DECIMAL(3,2) CHECK (relevance_score >= 0 AND relevance_score <= 1),
  keywords TEXT[] DEFAULT '{}',

  -- Relationships (for future use)
  related_tasks UUID[] DEFAULT '{}',
  related_events UUID[] DEFAULT '{}',
  related_narratives UUID[] DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Placeholder flag
  is_active BOOLEAN DEFAULT false -- Will remain false until News feature is implemented
);

-- Create indexes for future use
CREATE INDEX IF NOT EXISTS idx_news_project_relevance ON news(project_id, relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_news_published_date ON news(published_date DESC);
CREATE INDEX IF NOT EXISTS idx_news_active ON news(is_active) WHERE is_active = true;

-- ============================================
-- 4. MIGRATION FUNCTIONS
-- ============================================

-- Function to migrate events from daily_briefs to events table
CREATE OR REPLACE FUNCTION migrate_events_from_daily_briefs()
RETURNS INTEGER AS $$
DECLARE
  brief RECORD;
  event_data JSONB;
  event_count INTEGER := 0;
  project_record RECORD;
BEGIN
  -- Loop through all daily_briefs
  FOR brief IN SELECT * FROM daily_briefs WHERE calendar_events IS NOT NULL LOOP
    -- Process each event in the calendar_events array
    FOR event_data IN SELECT * FROM jsonb_array_elements(brief.calendar_events) LOOP
      -- Skip if already migrated (check by calendar_id)
      IF NOT EXISTS (
        SELECT 1 FROM events
        WHERE calendar_id = event_data->>'id'
        AND calendar_source = COALESCE(event_data->>'calendar_source', 'google')
      ) THEN

        -- Try to find matching project
        SELECT * INTO project_record
        FROM projects
        WHERE name = event_data->>'project_name'
        LIMIT 1;

        -- Insert event
        INSERT INTO events (
          project_id,
          title,
          start_time,
          end_time,
          location,
          attendees,
          description,
          calendar_source,
          calendar_id,
          briefing,
          briefing_type,
          category,
          created_at
        ) VALUES (
          project_record.id,
          event_data->>'summary',
          (event_data->'start'->>'dateTime')::TIMESTAMP WITH TIME ZONE,
          (event_data->'end'->>'dateTime')::TIMESTAMP WITH TIME ZONE,
          event_data->>'location',
          event_data->'attendees',
          event_data->>'description',
          COALESCE(event_data->>'calendar_source', 'google'),
          event_data->>'id',
          event_data->>'briefing',
          CASE
            WHEN event_data->>'category' = 'work' AND project_record.id IS NOT NULL THEN 'work_project'
            WHEN event_data->>'category' = 'work' THEN 'work_general'
            WHEN event_data->>'category' = 'life' THEN 'life'
            ELSE NULL
          END,
          event_data->>'category',
          brief.generated_at
        );

        event_count := event_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN event_count;
END;
$$ LANGUAGE plpgsql;

-- Function to migrate narratives from projects.narrative to narratives table
CREATE OR REPLACE FUNCTION migrate_narratives_from_projects()
RETURNS INTEGER AS $$
DECLARE
  project_record RECORD;
  narrative_data JSONB;
  narrative_count INTEGER := 0;
BEGIN
  -- Loop through all projects with narratives
  FOR project_record IN SELECT * FROM projects WHERE narrative IS NOT NULL LOOP
    -- Process each narrative in the array
    FOR narrative_data IN SELECT * FROM jsonb_array_elements(project_record.narrative) LOOP
      -- Insert narrative
      INSERT INTO narratives (
        project_id,
        date,
        headline,
        bullets,
        source,
        significance_score,
        auto_generated,
        created_at
      ) VALUES (
        project_record.id,
        (narrative_data->>'date')::DATE,
        narrative_data->>'headline',
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(narrative_data->'bullets', '[]'::JSONB))),
        COALESCE(narrative_data->>'source', 'note'),
        CASE
          WHEN narrative_data->>'source' = 'meeting' THEN 0.8
          WHEN narrative_data->>'source' = 'email' THEN 0.6
          ELSE 0.5
        END,
        true,
        COALESCE((narrative_data->>'created_at')::TIMESTAMP WITH TIME ZONE, NOW())
      );

      narrative_count := narrative_count + 1;
    END LOOP;
  END LOOP;

  RETURN narrative_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 5. EXECUTE MIGRATION
-- ============================================

-- Migrate existing data
DO $$
DECLARE
  events_migrated INTEGER;
  narratives_migrated INTEGER;
BEGIN
  -- Run migrations
  events_migrated := migrate_events_from_daily_briefs();
  narratives_migrated := migrate_narratives_from_projects();

  -- Log results
  RAISE NOTICE 'Migration complete: % events and % narratives migrated',
    events_migrated, narratives_migrated;
END $$;

-- ============================================
-- 6. UPDATE TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers to new tables
DROP TRIGGER IF EXISTS update_events_updated_at ON events;
CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_narratives_updated_at ON narratives;
CREATE TRIGGER update_narratives_updated_at
  BEFORE UPDATE ON narratives
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 7. GRANT PERMISSIONS (for Supabase)
-- ============================================

-- Grant necessary permissions to authenticated users
GRANT ALL ON events TO authenticated;
GRANT ALL ON narratives TO authenticated;
GRANT ALL ON news TO authenticated;

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================
-- 8. ADD COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON TABLE events IS 'Discrete events table for calendar events, meetings, and scheduled activities';
COMMENT ON TABLE narratives IS 'Project narratives capturing decisions, progress, and context over time';
COMMENT ON TABLE news IS 'Placeholder table for future news/article scanning feature';

COMMENT ON COLUMN events.significance_score IS 'AI-generated importance score (0-1) for prioritization';
COMMENT ON COLUMN narratives.project_id IS 'Can be NULL for orphan narratives awaiting project assignment';
COMMENT ON COLUMN news.is_active IS 'Always false until News feature is implemented';

-- ============================================
-- 9. MIGRATION ROLLBACK SCRIPT (commented out)
-- ============================================

-- To rollback this migration, uncomment and run:
/*
-- Restore narratives to projects table (would need custom script)
-- Restore events to daily_briefs (would need custom script)

-- Drop new tables
DROP TABLE IF EXISTS news CASCADE;
DROP TABLE IF EXISTS narratives CASCADE;
DROP TABLE IF EXISTS events CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS migrate_events_from_daily_briefs();
DROP FUNCTION IF EXISTS migrate_narratives_from_projects();
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
*/

-- ============================================
-- END OF MIGRATION
-- ============================================