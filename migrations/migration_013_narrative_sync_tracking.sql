-- Migration 013: Add narrative sync tracking to meeting_notes
-- This enables the sync-meeting-narratives job to track which notes have been synced

-- Add columns to track narrative sync status
ALTER TABLE meeting_notes
ADD COLUMN IF NOT EXISTS narrative_synced BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS narrative_synced_at TIMESTAMPTZ;

-- Create index for efficient querying of unsynced notes
CREATE INDEX IF NOT EXISTS idx_meeting_notes_narrative_synced
ON meeting_notes (narrative_synced)
WHERE narrative_synced = FALSE OR narrative_synced IS NULL;

-- Add comment explaining the columns
COMMENT ON COLUMN meeting_notes.narrative_synced IS 'Whether the narrative from this meeting note has been synced to projects.narrative';
COMMENT ON COLUMN meeting_notes.narrative_synced_at IS 'When the narrative was last synced to projects.narrative';
