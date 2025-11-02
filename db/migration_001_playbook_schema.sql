-- Migration 001: Update schema for Playbook architecture
-- This migration updates the existing schema to support the new Playbook design
-- Run this in Supabase SQL Editor AFTER the initial schema.sql

-- ============================================================
-- 1. UPDATE TASKS TABLE
-- ============================================================

-- Add new columns to tasks table
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS context TEXT CHECK (context IN ('Work', 'Life')),
  ADD COLUMN IF NOT EXISTS extra_tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS icon TEXT,
  ADD COLUMN IF NOT EXISTS urgency TEXT DEFAULT 'Soon' CHECK (urgency IN ('Now', 'Soon', 'Eventually')),
  ADD COLUMN IF NOT EXISTS rank INTEGER,
  ADD COLUMN IF NOT EXISTS task_type TEXT DEFAULT 'task' CHECK (task_type IN ('task', 'team_objective', 'delegated')),
  ADD COLUMN IF NOT EXISTS assigned_to TEXT,
  ADD COLUMN IF NOT EXISTS pending_changes JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confidence DECIMAL,
  ADD COLUMN IF NOT EXISTS detected_from TEXT,
  ADD COLUMN IF NOT EXISTS detection_reasoning TEXT,
  ADD COLUMN IF NOT EXISTS suggested_time TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMP;

-- Update status values to match new design
-- Note: This will update existing 'todo' to 'pending', 'in-progress' to 'active'
UPDATE tasks SET status = 'pending' WHERE status = 'todo';
UPDATE tasks SET status = 'active' WHERE status = 'in-progress';

-- Drop old status constraint and add new one
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('pending', 'active', 'blocked', 'complete', 'dismissed'));

-- Update default status
ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'pending';

-- Add new indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_urgency ON tasks(urgency);
CREATE INDEX IF NOT EXISTS idx_tasks_rank ON tasks(rank) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_tasks_context ON tasks(context);
CREATE INDEX IF NOT EXISTS idx_tasks_extra_tags ON tasks USING GIN(extra_tags);
CREATE INDEX IF NOT EXISTS idx_tasks_pending_changes ON tasks(id) WHERE pending_changes IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_task_type ON tasks(task_type);

-- ============================================================
-- 2. UPDATE PROJECTS TABLE
-- ============================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS lead TEXT,
  ADD COLUMN IF NOT EXISTS objectives JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS vault_folders TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS last_activity TIMESTAMP;

-- Update project urgency values to match new design
UPDATE projects SET urgency = 'normal' WHERE urgency = 'medium';

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_urgency_check;
ALTER TABLE projects ADD CONSTRAINT projects_urgency_check
  CHECK (urgency IN ('high', 'normal', 'low'));

-- ============================================================
-- 3. NEW TABLES
-- ============================================================

-- Daily Briefs (migrated from GitHub Pages system)
CREATE TABLE IF NOT EXISTS daily_briefs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL UNIQUE,

  -- Calendar data
  calendar_events JSONB DEFAULT '[]'::JSONB,

  -- Context
  vault_context JSONB DEFAULT '{}'::JSONB,
  attendee_context JSONB DEFAULT '{}'::JSONB,
  web_context JSONB DEFAULT '{}'::JSONB,

  -- Weather
  weather JSONB,

  -- AI Analysis
  ai_insights TEXT,
  priorities TEXT[],

  -- Related tasks
  related_tasks JSONB DEFAULT '[]'::JSONB,

  -- Generation
  generated_at TIMESTAMP DEFAULT NOW(),
  html_content TEXT,
  markdown_content TEXT
);

-- Chat History
CREATE TABLE IF NOT EXISTS chat_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,

  -- Context
  related_tasks UUID[],
  related_projects UUID[],

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 4. UPDATE MEETING NOTES TABLE
-- ============================================================

ALTER TABLE meeting_notes
  ADD COLUMN IF NOT EXISTS tasks_detected INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS objectives_detected INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS team_mentions TEXT[];

-- ============================================================
-- 5. UPDATE USER PREFERENCES
-- ============================================================

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS auto_approve_threshold DECIMAL DEFAULT 0.95,
  ADD COLUMN IF NOT EXISTS task_cleanup_days INTEGER DEFAULT 2;

-- ============================================================
-- 6. ENABLE RLS ON NEW TABLES
-- ============================================================

ALTER TABLE daily_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated users" ON daily_briefs FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON chat_history FOR ALL USING (true);

-- ============================================================
-- 7. CREATE UPDATED VIEWS
-- ============================================================

-- Drop old views
DROP VIEW IF EXISTS active_tasks CASCADE;
DROP VIEW IF EXISTS project_health CASCADE;

-- Active tasks view (updated for new schema)
CREATE VIEW active_tasks AS
SELECT
  t.*,
  p.name as project_name,
  p.urgency as project_urgency
FROM tasks t
LEFT JOIN projects p ON t.project_id = p.id
WHERE t.status IN ('pending', 'active', 'blocked')
ORDER BY
  CASE t.urgency
    WHEN 'Now' THEN 1
    WHEN 'Soon' THEN 2
    WHEN 'Eventually' THEN 3
  END,
  t.rank ASC NULLS LAST,
  t.due_date ASC NULLS LAST;

-- Pending tasks view (AI-detected, awaiting approval)
CREATE VIEW pending_tasks AS
SELECT
  t.*,
  p.name as project_name
FROM tasks t
LEFT JOIN projects p ON t.project_id = p.id
WHERE t.status = 'pending'
ORDER BY t.confidence DESC, t.created_at DESC;

-- Project stats view
CREATE VIEW project_stats AS
SELECT
  p.id,
  p.name,
  p.status,
  p.urgency,
  p.deadline,
  p.progress,
  COUNT(t.id) FILTER (WHERE t.status = 'pending') as pending_tasks,
  COUNT(t.id) FILTER (WHERE t.status = 'active') as active_tasks,
  COUNT(t.id) FILTER (WHERE t.status = 'blocked') as blocked_tasks,
  COUNT(t.id) FILTER (WHERE t.status = 'complete') as completed_tasks,
  COUNT(t.id) as total_tasks,
  AVG(t.progress) as avg_task_progress,
  MAX(t.updated_at) as last_activity
FROM projects p
LEFT JOIN tasks t ON t.project_id = p.id
GROUP BY p.id, p.name, p.status, p.urgency, p.deadline, p.progress;

-- ============================================================
-- 8. ADD TRIGGERS FOR NEW TABLES
-- ============================================================

-- No updated_at triggers needed for daily_briefs (generated_at is primary)
-- Chat history doesn't need updated_at (append-only log)

-- ============================================================
-- 9. HELPER FUNCTIONS
-- ============================================================

-- Function to auto-rank tasks based on urgency, deadline, etc.
CREATE OR REPLACE FUNCTION calculate_task_rank(
  task_urgency TEXT,
  task_due_date DATE,
  project_urgency TEXT
)
RETURNS INTEGER AS $$
DECLARE
  urgency_score INTEGER;
  deadline_score INTEGER;
  project_score INTEGER;
  rank_value INTEGER;
BEGIN
  -- Urgency score
  urgency_score := CASE task_urgency
    WHEN 'Now' THEN 10
    WHEN 'Soon' THEN 5
    WHEN 'Eventually' THEN 1
    ELSE 3
  END;

  -- Deadline proximity score (negative for sorting)
  IF task_due_date IS NOT NULL THEN
    deadline_score := (task_due_date - CURRENT_DATE) * -1;
  ELSE
    deadline_score := 0;
  END IF;

  -- Project priority score
  project_score := CASE project_urgency
    WHEN 'high' THEN 5
    WHEN 'normal' THEN 3
    WHEN 'low' THEN 1
    ELSE 2
  END;

  rank_value := urgency_score + deadline_score + project_score;

  RETURN rank_value;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 10. DEPRECATE OLD TABLES (OPTIONAL - COMMENTED OUT)
-- ============================================================

-- Uncomment these after verifying migration is successful
-- DROP TABLE IF EXISTS daily_goals CASCADE;
-- DROP TABLE IF EXISTS activity_log CASCADE;

-- For now, just add a comment to the table
COMMENT ON TABLE daily_goals IS 'DEPRECATED - Will be removed after migration to new task system';

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================

SELECT 'Migration 001 completed successfully! Playbook schema is ready.' as status;
