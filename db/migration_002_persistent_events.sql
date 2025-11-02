-- Migration 002: Persistent Calendar Events Architecture
-- This migration creates a dedicated table for calendar events instead of storing them as JSONB blobs
-- Events will now persist between syncs and only be updated when changed

-- ============================================================
-- CALENDAR EVENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS calendar_events (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id TEXT NOT NULL,  -- Google/Outlook event ID
  source TEXT NOT NULL CHECK (source IN ('google', 'outlook')),

  -- Normalized event data (ALWAYS in standard format)
  summary TEXT NOT NULL,       -- Event title (normalized from Outlook's "subject")
  start JSONB NOT NULL,        -- {dateTime: "ISO-8601", timeZone: "America/New_York"} or {date: "YYYY-MM-DD"}
  "end" JSONB NOT NULL,        -- Same structure as start
  description TEXT,
  location TEXT,
  attendees JSONB DEFAULT '[]'::JSONB,
  is_all_day BOOLEAN DEFAULT false,

  -- Project association
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  project_name TEXT,
  project_color TEXT,
  project_work_life_context TEXT,

  -- AI enrichment
  ai_briefing TEXT,

  -- Calendar metadata
  calendar_category TEXT,      -- 'Google', 'Outlook', 'Personal', 'Work', 'Family'

  -- Enriched attendee data
  enriched_attendees JSONB DEFAULT '[]'::JSONB,

  -- Sync tracking
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_synced_at TIMESTAMP DEFAULT NOW(),

  -- Unique constraint: one event per external_id+source combo
  UNIQUE(external_id, source)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_calendar_events_external ON calendar_events(external_id, source);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_datetime ON calendar_events((start->>'dateTime'));
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_date ON calendar_events((start->>'date'));
CREATE INDEX IF NOT EXISTS idx_calendar_events_project ON calendar_events(project_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_synced ON calendar_events(last_synced_at);

-- Enable RLS
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- RLS Policy (allow all for now - single user system)
CREATE POLICY "Allow all for authenticated users" ON calendar_events FOR ALL USING (true);

-- Create or replace the updated_at trigger function (if it doesn't exist)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER update_calendar_events_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- UPDATE DAILY BRIEFS TABLE
-- ============================================================
-- Add new column for event references (keep old JSONB for rollback)
ALTER TABLE daily_briefs
  ADD COLUMN IF NOT EXISTS event_ids UUID[] DEFAULT ARRAY[]::UUID[];

-- Add index for event_ids array
CREATE INDEX IF NOT EXISTS idx_daily_briefs_event_ids ON daily_briefs USING GIN(event_ids);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Function to get events for a specific date
CREATE OR REPLACE FUNCTION get_events_for_date(target_date DATE)
RETURNS SETOF calendar_events AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM calendar_events
  WHERE
    -- Match events with dateTime
    (start->>'dateTime' IS NOT NULL
     AND DATE(start->>'dateTime') = target_date)
    OR
    -- Match all-day events with date
    (start->>'date' IS NOT NULL
     AND start->>'date' = target_date::TEXT);
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old events (optional - for future use)
CREATE OR REPLACE FUNCTION cleanup_old_events(days_to_keep INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM calendar_events
    WHERE
      last_synced_at < NOW() - (days_to_keep || ' days')::INTERVAL
      AND (
        (start->>'dateTime' IS NOT NULL AND (start->>'dateTime')::TIMESTAMP < NOW() - (days_to_keep || ' days')::INTERVAL)
        OR
        (start->>'date' IS NOT NULL AND (start->>'date')::DATE < CURRENT_DATE - days_to_keep)
      )
    RETURNING *
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Success message
SELECT 'Migration 002: Persistent calendar events table created successfully!' as status;
