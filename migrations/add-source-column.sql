-- ============================================================
-- ADD SOURCE COLUMN TO TASKS TABLE
-- ============================================================
-- This column tracks where tasks were created from
-- ============================================================

-- Add the source column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'tasks'
    AND column_name = 'source'
  ) THEN
    ALTER TABLE tasks
    ADD COLUMN source TEXT DEFAULT 'manual';

    -- Add comment
    COMMENT ON COLUMN tasks.source IS 'Source of task creation: email, vault, calendar, manual, etc.';

    RAISE NOTICE '✅ Added source column to tasks table';
  ELSE
    RAISE NOTICE 'ℹ️ Source column already exists';
  END IF;
END $$;

-- Add entities_created column to processed_emails if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'processed_emails'
    AND column_name = 'entities_created'
  ) THEN
    ALTER TABLE processed_emails
    ADD COLUMN entities_created JSONB DEFAULT '{}';

    COMMENT ON COLUMN processed_emails.entities_created IS 'Count of entities created from this email';

    RAISE NOTICE '✅ Added entities_created column to processed_emails table';
  ELSE
    RAISE NOTICE 'ℹ️ entities_created column already exists';
  END IF;
END $$;

-- Create processed_files table if it doesn't exist
CREATE TABLE IF NOT EXISTS processed_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  filepath TEXT UNIQUE NOT NULL,
  filename TEXT,
  size INTEGER,
  modified_at TIMESTAMP WITH TIME ZONE,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  entities_created JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_processed_files_filepath ON processed_files(filepath);
CREATE INDEX IF NOT EXISTS idx_processed_files_processed_at ON processed_files(processed_at);

-- Enable RLS
ALTER TABLE processed_files ENABLE ROW LEVEL SECURITY;

-- Create policy
DROP POLICY IF EXISTS "Enable all for processed_files" ON processed_files;
CREATE POLICY "Enable all for processed_files" ON processed_files FOR ALL USING (true);

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '✅ SCHEMA UPDATES COMPLETE';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Added missing columns:';
  RAISE NOTICE '  • tasks.source - tracks where tasks come from';
  RAISE NOTICE '  • processed_emails.entities_created - counts entities';
  RAISE NOTICE '  • processed_files table - tracks processed vault files';
  RAISE NOTICE '';
  RAISE NOTICE 'Next: Run this in Supabase SQL Editor';
  RAISE NOTICE '============================================================';
END $$;