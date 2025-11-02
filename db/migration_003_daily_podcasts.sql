-- Migration 003: Daily Podcasts Table
-- Creates table for storing daily morning podcast generation metadata
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS daily_podcasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL UNIQUE,

  -- ElevenLabs integration
  project_id TEXT, -- ElevenLabs project ID returned from API
  status TEXT DEFAULT 'generating' CHECK (status IN ('generating', 'ready', 'failed')),
  audio_url TEXT,

  -- Content
  markdown_content TEXT,

  -- Metadata
  duration_seconds INTEGER,
  file_size_bytes BIGINT,

  -- Timestamps
  generated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  error_message TEXT
);

-- Index for quick date lookups
CREATE INDEX IF NOT EXISTS idx_daily_podcasts_date ON daily_podcasts(date);

-- Index for status tracking
CREATE INDEX IF NOT EXISTS idx_daily_podcasts_status ON daily_podcasts(status);

-- Enable RLS
ALTER TABLE daily_podcasts ENABLE ROW LEVEL SECURITY;

-- Allow all operations (single-user system)
CREATE POLICY "Allow all for authenticated users" ON daily_podcasts FOR ALL USING (true);

-- Success message
SELECT 'Daily podcasts table created successfully!' as status;
