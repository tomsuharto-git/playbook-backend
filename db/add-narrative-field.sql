-- Add narrative field to projects table
-- This is separate from objectives (which are fixed goals)

ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS narrative JSONB DEFAULT '[]';

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_projects_narrative ON projects USING GIN (narrative);

COMMENT ON COLUMN projects.narrative IS 'Living timeline of project updates - array of {date, headline, bullets[], source}';
COMMENT ON COLUMN projects.objectives IS 'Fixed project goals and targets - array of strings';

-- Example narrative structure:
-- [
--   {
--     "date": "2025-10-09",
--     "headline": "Client requested design changes",
--     "bullets": ["Wants darker palette", "Needs by Friday", "Approved direction"],
--     "source": "email"
--   },
--   {
--     "date": "2025-10-08", 
--     "headline": "Internal review completed",
--     "bullets": ["Team approved concept", "Minor revisions needed"],
--     "source": "meeting"
--   }
-- ]
