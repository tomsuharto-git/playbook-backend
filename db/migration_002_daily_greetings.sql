-- Migration 002: Add daily_greetings table
-- Run this in Supabase SQL Editor if the table doesn't exist

-- Create daily_greetings table
CREATE TABLE IF NOT EXISTS daily_greetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  greeting TEXT NOT NULL,
  context JSONB,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster date lookups
CREATE INDEX IF NOT EXISTS idx_daily_greetings_date ON daily_greetings(date DESC);

-- Add comment
COMMENT ON TABLE daily_greetings IS 'Stores AI-generated daily greetings with context';

-- Enable RLS (Row Level Security)
ALTER TABLE daily_greetings ENABLE ROW LEVEL SECURITY;

-- Create policy for read access
CREATE POLICY "Allow public read access to greetings" ON daily_greetings
  FOR SELECT USING (true);

-- Create policy for service role to insert/update
CREATE POLICY "Allow service role to manage greetings" ON daily_greetings
  FOR ALL USING (true);

-- Grant access
GRANT SELECT ON daily_greetings TO anon, authenticated;
GRANT ALL ON daily_greetings TO service_role;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Migration 002 completed: daily_greetings table created';
END $$;
