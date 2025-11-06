-- Migration 012: Add Title Constraint
--
-- Purpose: Prevent NULL or empty titles in events table to avoid brief page data loss
--
-- IMPORTANT: Run this migration only after ensuring all existing events have valid titles
-- Test first with: SELECT COUNT(*) FROM events WHERE title IS NULL OR title = '';
--
-- Created: 2025-11-01
-- Related fix: Backend title field extraction now checks both event.summary and event.subject

-- Add NOT NULL constraint to title column
-- Note: This will fail if any existing events have NULL titles
-- Run backfill-event-titles.js first if needed
ALTER TABLE events
  ALTER COLUMN title SET NOT NULL;

-- Add CHECK constraint to prevent empty strings
ALTER TABLE events
  ADD CONSTRAINT events_title_not_empty
  CHECK (title IS NOT NULL AND length(trim(title)) > 0);

-- Create an index on title for faster queries (optional performance improvement)
CREATE INDEX IF NOT EXISTS idx_events_title ON events(title);
