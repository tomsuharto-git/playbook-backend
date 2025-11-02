-- Migration 005: Processed Emails Tracking
-- Purpose: Track which emails have been analyzed to prevent duplicate processing
-- Date: 2025-10-13

-- Create processed_emails table
CREATE TABLE IF NOT EXISTS processed_emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_id TEXT UNIQUE NOT NULL,  -- Outlook message ID or Gmail message ID
  source TEXT NOT NULL,            -- 'outlook' or 'gmail'
  subject TEXT,
  from_email TEXT,
  received_date TIMESTAMP,
  processed_at TIMESTAMP DEFAULT NOW(),
  tasks_created INTEGER DEFAULT 0,
  narrative_updated BOOLEAN DEFAULT false,

  -- Constraints
  CONSTRAINT unique_email_id UNIQUE (email_id),
  CONSTRAINT valid_source CHECK (source IN ('outlook', 'gmail'))
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_processed_emails_email_id ON processed_emails(email_id);
CREATE INDEX IF NOT EXISTS idx_processed_emails_processed_at ON processed_emails(processed_at);
CREATE INDEX IF NOT EXISTS idx_processed_emails_source ON processed_emails(source);

-- Add table comment
COMMENT ON TABLE processed_emails IS 'Tracks which emails (Outlook/Gmail) have been analyzed to prevent duplicate processing and reduce API costs';

-- Add column comments
COMMENT ON COLUMN processed_emails.email_id IS 'Unique email identifier from Outlook or Gmail API';
COMMENT ON COLUMN processed_emails.source IS 'Email source: outlook (from Google Drive files) or gmail (from Gmail API)';
COMMENT ON COLUMN processed_emails.tasks_created IS 'Number of tasks generated from this email';
COMMENT ON COLUMN processed_emails.narrative_updated IS 'Whether this email updated a project narrative';
