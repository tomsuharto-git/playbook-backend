-- Playbook Database Schema (Complete)
-- This is the complete schema for the Playbook system
-- For NEW installations: Run this file
-- For EXISTING installations: Run migration_001_playbook_schema.sql instead

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROJECTS TABLE
-- ============================================================
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT[] DEFAULT ARRAY['work']::TEXT[], -- work, personal, client
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'on-hold', 'complete', 'archived')),
  urgency TEXT DEFAULT 'normal' CHECK (urgency IN ('high', 'normal', 'low')),
  deadline DATE,
  progress DECIMAL DEFAULT 0, -- 0-100

  -- Team
  team JSONB DEFAULT '[]'::JSONB, -- [{name, role, email}]
  lead TEXT, -- Primary owner

  -- Context
  objectives JSONB DEFAULT '[]'::JSONB, -- Team objectives
  obsidian_path TEXT, -- Link to project folder
  vault_folders TEXT[], -- Related vault paths

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_activity TIMESTAMP
);

-- ============================================================
-- TASKS TABLE (Enhanced)
-- ============================================================
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

  -- Core fields
  title TEXT NOT NULL,                    -- Task name (5 words or less)
  description TEXT,                       -- One sentence
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'blocked', 'complete', 'dismissed')),

  -- Tagging
  context TEXT CHECK (context IN ('Work', 'Life')),
  extra_tags TEXT[],                      -- From predefined list
  icon TEXT,                              -- AI-chosen emoji

  -- Priority
  urgency TEXT DEFAULT 'Soon' CHECK (urgency IN ('Now', 'Soon', 'Eventually')),
  rank INTEGER,                           -- AI power ranking
  priority TEXT DEFAULT 'normal',         -- Legacy field (can deprecate)

  -- Scheduling
  due_date DATE,
  time_estimate INTEGER,                  -- Minutes
  time_spent INTEGER DEFAULT 0,           -- Minutes
  suggested_time TEXT,                    -- morning, afternoon, evening

  -- AI Detection
  auto_detected BOOLEAN DEFAULT false,
  confidence DECIMAL,                     -- 0-1 score
  detected_from TEXT,                     -- Source file path
  detection_reasoning TEXT,               -- Why AI thinks this is a task
  task_type TEXT DEFAULT 'task' CHECK (task_type IN ('task', 'team_objective', 'delegated')),
  assigned_to TEXT,                       -- For delegated tasks

  -- Change Management
  pending_changes JSONB DEFAULT NULL,     -- AI suggested edits

  -- Progress
  progress DECIMAL DEFAULT 0,             -- 0-100

  -- Metadata
  obsidian_file TEXT,                     -- Source file
  obsidian_line INTEGER,                  -- Line number
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  approved_at TIMESTAMP,                  -- When moved from pending to active
  dismissed_at TIMESTAMP,                 -- When dismissed from pending
  started_at TIMESTAMP
);

-- ============================================================
-- TASK COMPLETIONS (AI-detected)
-- ============================================================
CREATE TABLE task_completions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,

  detected_from TEXT, -- Meeting note path
  confidence DECIMAL,
  evidence TEXT, -- Quote from note

  detected_at TIMESTAMP DEFAULT NOW(),
  user_confirmed BOOLEAN DEFAULT false
);

-- ============================================================
-- DAILY BRIEFS (Migrated from GitHub Pages)
-- ============================================================
CREATE TABLE daily_briefs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL UNIQUE,

  -- Calendar data
  calendar_events JSONB DEFAULT '[]'::JSONB,

  -- Context
  vault_context JSONB DEFAULT '{}'::JSONB, -- Related notes per event
  attendee_context JSONB DEFAULT '{}'::JSONB, -- Attendee info per event
  web_context JSONB DEFAULT '{}'::JSONB, -- Web search results per event

  -- Weather
  weather JSONB,

  -- AI Analysis
  ai_insights TEXT,
  priorities TEXT[],

  -- Related tasks
  related_tasks JSONB DEFAULT '[]'::JSONB, -- Task IDs mapped to events

  -- Generation
  generated_at TIMESTAMP DEFAULT NOW(),
  html_content TEXT, -- Rendered HTML for display
  markdown_content TEXT -- Markdown for GitHub backup
);

-- ============================================================
-- MEETING NOTES (Enhanced)
-- ============================================================
CREATE TABLE meeting_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),

  -- File info
  file_path TEXT NOT NULL UNIQUE,
  title TEXT,
  date DATE,
  content TEXT,

  -- Analysis
  analyzed BOOLEAN DEFAULT false,
  analysis JSONB, -- Full AI analysis result

  -- Extracted entities
  tasks_detected INTEGER DEFAULT 0,
  objectives_detected INTEGER DEFAULT 0,
  team_mentions TEXT[],

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- USER PREFERENCES (Enhanced)
-- ============================================================
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Work patterns
  peak_hours JSONB DEFAULT '["09:00", "11:00"]'::JSONB,
  work_patterns JSONB DEFAULT '{}'::JSONB,

  -- Notification settings
  notification_settings JSONB DEFAULT '{
    "badge_count": true,
    "task_digest": "daily",
    "digest_time": "08:00"
  }'::JSONB,

  -- Task preferences
  auto_approve_threshold DECIMAL DEFAULT 0.95, -- Auto-approve tasks above this
  task_cleanup_days INTEGER DEFAULT 2, -- Delete done tasks after N days

  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- CHAT HISTORY
-- ============================================================
CREATE TABLE chat_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,

  -- Context
  related_tasks UUID[], -- Task IDs mentioned
  related_projects UUID[], -- Project IDs mentioned

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================

-- Tasks indexes
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_urgency ON tasks(urgency);
CREATE INDEX idx_tasks_rank ON tasks(rank) WHERE status = 'active';
CREATE INDEX idx_tasks_due_date ON tasks(due_date) WHERE status IN ('active', 'pending');
CREATE INDEX idx_tasks_context ON tasks(context);
CREATE INDEX idx_tasks_extra_tags ON tasks USING GIN(extra_tags);
CREATE INDEX idx_tasks_pending_changes ON tasks(id) WHERE pending_changes IS NOT NULL;
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_task_type ON tasks(task_type);

-- Projects indexes
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_urgency ON projects(urgency);

-- Other indexes
CREATE INDEX idx_daily_briefs_date ON daily_briefs(date);
CREATE INDEX idx_meeting_notes_path ON meeting_notes(file_path);
CREATE INDEX idx_meeting_notes_analyzed ON meeting_notes(analyzed);
CREATE INDEX idx_task_completions_task ON task_completions(task_id);
CREATE INDEX idx_chat_history_created ON chat_history(created_at);

-- ============================================================
-- ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow all for now - single user system)
CREATE POLICY "Allow all" ON projects FOR ALL USING (true);
CREATE POLICY "Allow all" ON tasks FOR ALL USING (true);
CREATE POLICY "Allow all" ON task_completions FOR ALL USING (true);
CREATE POLICY "Allow all" ON daily_briefs FOR ALL USING (true);
CREATE POLICY "Allow all" ON user_preferences FOR ALL USING (true);
CREATE POLICY "Allow all" ON meeting_notes FOR ALL USING (true);
CREATE POLICY "Allow all" ON chat_history FOR ALL USING (true);

-- ============================================================
-- TRIGGERS FOR updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_meeting_notes_updated_at BEFORE UPDATE ON meeting_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- VIEWS FOR CONVENIENCE
-- ============================================================

-- Active tasks (pending, active, blocked)
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

-- Pending tasks (awaiting approval)
CREATE VIEW pending_tasks AS
SELECT
  t.*,
  p.name as project_name
FROM tasks t
LEFT JOIN projects p ON t.project_id = p.id
WHERE t.status = 'pending'
ORDER BY t.confidence DESC, t.created_at DESC;

-- Project statistics
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
-- HELPER FUNCTIONS
-- ============================================================

-- Calculate task rank based on urgency, deadline, project priority
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

-- Calculate project progress from tasks
CREATE OR REPLACE FUNCTION calculate_project_progress(project_uuid UUID)
RETURNS DECIMAL AS $$
DECLARE
  total_tasks INTEGER;
  completed_tasks INTEGER;
  progress_value DECIMAL;
BEGIN
  SELECT COUNT(*) INTO total_tasks FROM tasks WHERE project_id = project_uuid;
  SELECT COUNT(*) INTO completed_tasks FROM tasks WHERE project_id = project_uuid AND status = 'complete';

  IF total_tasks = 0 THEN
    RETURN 0;
  END IF;

  progress_value := (completed_tasks::DECIMAL / total_tasks::DECIMAL) * 100;
  RETURN progress_value;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- SEED DATA
-- ============================================================

-- Seed user preferences
INSERT INTO user_preferences (peak_hours, work_patterns, notification_settings, auto_approve_threshold, task_cleanup_days)
VALUES (
  '["08:00", "11:00"]'::JSONB,
  '{
    "creative_work": "morning",
    "meetings": "afternoon",
    "admin_tasks": "end_of_day",
    "focus_block_duration": 90,
    "break_frequency": 120
  }'::JSONB,
  '{
    "badge_count": true,
    "task_digest": "daily",
    "digest_time": "08:00",
    "push_enabled": true,
    "task_reminders": true
  }'::JSONB,
  0.95,
  2
);

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================

SELECT 'Playbook database schema created successfully!' as status;
