-- Migration 007: Event Actions and Overrides
-- Purpose: Track event actions (completed/dismissed) and allow editing event metadata
-- Created: 2025-10-15

-- Track event actions (completed/dismissed)
CREATE TABLE IF NOT EXISTS event_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('completed', 'dismissed')),
  auto_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),

  -- Prevent duplicate actions per event
  UNIQUE(event_id)
);

-- Store event edit overrides (title, project, context)
CREATE TABLE IF NOT EXISTS event_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id TEXT NOT NULL UNIQUE,
  title TEXT,
  project_id UUID REFERENCES projects(id),
  context TEXT CHECK (context IN ('Work', 'Life')),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_event_actions_id ON event_actions(event_id);
CREATE INDEX IF NOT EXISTS idx_event_overrides_id ON event_overrides(event_id);

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Event actions and overrides tables created successfully!';
END $$;
