-- Add calendar_briefings column to store cached AI briefings
-- This prevents regenerating briefings on every page load

ALTER TABLE daily_briefs
ADD COLUMN IF NOT EXISTS calendar_briefings JSONB;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_daily_briefs_date
ON daily_briefs(date);
