-- Complete Playbook Schema Setup
-- Run this in Supabase SQL Editor for a fresh installation

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROJECTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  
  -- Classification
  tags TEXT[] DEFAULT ARRAY['Work']::TEXT[], -- 'Work', 'Code', 'Personal'
  color TEXT DEFAULT '#95A5A6', -- Hex color for UI
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
-- TASKS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

  -- Core fields
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'blocked', 'complete', 'dismissed')),

  -- Tagging
  context TEXT CHECK (context IN ('Work', 'Life')),
  extra_tags TEXT[],
  icon TEXT,

  -- Priority
  urgency TEXT DEFAULT 'Soon' CHECK (urgency IN ('Now', 'Soon', 'Eventually')),
  rank INTEGER,
  priority TEXT DEFAULT 'normal',

  -- Scheduling
  due_date DATE,
  time_estimate INTEGER,
  time_spent INTEGER DEFAULT 0,
  suggested_time TEXT,

  -- AI Detection
  auto_detected BOOLEAN DEFAULT false,
  confidence DECIMAL,
  detected_from TEXT,
  detection_reasoning TEXT,
  task_type TEXT DEFAULT 'task' CHECK (task_type IN ('task', 'team_objective', 'delegated')),
  assigned_to TEXT,

  -- Change Management
  pending_changes JSONB DEFAULT NULL,

  -- Progress
  progress DECIMAL DEFAULT 0,

  -- Metadata
  obsidian_file TEXT,
  obsidian_line INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  approved_at TIMESTAMP,
  dismissed_at TIMESTAMP,
  started_at TIMESTAMP
);

-- ============================================================
-- DAILY BRIEFS
-- ============================================================
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

-- ============================================================
-- MEETING NOTES
-- ============================================================
CREATE TABLE IF NOT EXISTS meeting_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),

  -- File info
  file_path TEXT NOT NULL UNIQUE,
  title TEXT,
  date DATE,
  content TEXT,

  -- Analysis
  analyzed BOOLEAN DEFAULT false,
  analysis JSONB,

  -- Extracted entities
  tasks_detected INTEGER DEFAULT 0,
  objectives_detected INTEGER DEFAULT 0,
  team_mentions TEXT[],

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- TASK COMPLETIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS task_completions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,

  detected_from TEXT,
  confidence DECIMAL,
  evidence TEXT,

  detected_at TIMESTAMP DEFAULT NOW(),
  user_confirmed BOOLEAN DEFAULT false
);

-- ============================================================
-- CHAT HISTORY
-- ============================================================
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
-- USER PREFERENCES
-- ============================================================
CREATE TABLE IF NOT EXISTS user_preferences (
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
  auto_approve_threshold DECIMAL DEFAULT 0.95,
  task_cleanup_days INTEGER DEFAULT 2,

  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_urgency ON tasks(urgency);
CREATE INDEX IF NOT EXISTS idx_tasks_rank ON tasks(rank) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date) WHERE status IN ('active', 'pending');
CREATE INDEX IF NOT EXISTS idx_tasks_context ON tasks(context);
CREATE INDEX IF NOT EXISTS idx_tasks_extra_tags ON tasks USING GIN(extra_tags);
CREATE INDEX IF NOT EXISTS idx_tasks_pending_changes ON tasks(id) WHERE pending_changes IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_tags ON projects USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_daily_briefs_date ON daily_briefs(date);
CREATE INDEX IF NOT EXISTS idx_meeting_notes_file_path ON meeting_notes(file_path);

-- ============================================================
-- VIEWS
-- ============================================================

-- Active tasks view
CREATE OR REPLACE VIEW active_tasks AS
SELECT t.*, p.name as project_name
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

-- Project stats view
CREATE OR REPLACE VIEW project_stats AS
SELECT 
  p.id,
  p.name,
  COUNT(t.id) FILTER (WHERE t.status = 'active') as active_tasks,
  COUNT(t.id) FILTER (WHERE t.status = 'complete') as completed_tasks,
  AVG(t.progress) as avg_progress
FROM projects p
LEFT JOIN tasks t ON t.project_id = p.id
GROUP BY p.id, p.name;

-- ============================================================
-- ROW LEVEL SECURITY (Disabled for development)
-- ============================================================

-- Enable RLS on tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Allow all for authenticated users (simple policy for single-user app)
CREATE POLICY "Allow all for authenticated users" ON projects FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON tasks FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON daily_briefs FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON meeting_notes FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON task_completions FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON chat_history FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON user_preferences FOR ALL USING (true);

-- ============================================================
-- DONE
-- ============================================================

SELECT 'Schema created successfully! Now run seed-projects.sql' as status;
