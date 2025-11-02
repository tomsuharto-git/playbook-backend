
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- PROJECTS TABLE
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  tags TEXT[] DEFAULT ARRAY['Work']::TEXT[],
  color TEXT DEFAULT '#95A5A6',
  type TEXT[] DEFAULT ARRAY['work']::TEXT[],
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'on-hold', 'complete', 'archived')),
  urgency TEXT DEFAULT 'normal' CHECK (urgency IN ('high', 'normal', 'low')),
  deadline DATE,
  progress DECIMAL DEFAULT 0,
  team JSONB DEFAULT '[]'::JSONB,
  lead TEXT,
  objectives JSONB DEFAULT '[]'::JSONB,
  obsidian_path TEXT,
  vault_folders TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_activity TIMESTAMP
);

-- TASKS TABLE
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'blocked', 'complete', 'dismissed')),
  context TEXT CHECK (context IN ('Work', 'Life')),
  extra_tags TEXT[],
  icon TEXT,
  urgency TEXT DEFAULT 'Soon' CHECK (urgency IN ('Now', 'Soon', 'Eventually')),
  rank INTEGER,
  priority TEXT DEFAULT 'normal',
  due_date DATE,
  time_estimate INTEGER,
  time_spent INTEGER DEFAULT 0,
  suggested_time TEXT,
  auto_detected BOOLEAN DEFAULT false,
  confidence DECIMAL,
  detected_from TEXT,
  detection_reasoning TEXT,
  task_type TEXT DEFAULT 'task' CHECK (task_type IN ('task', 'team_objective', 'delegated')),
  assigned_to TEXT,
  pending_changes JSONB DEFAULT NULL,
  progress DECIMAL DEFAULT 0,
  obsidian_file TEXT,
  obsidian_line INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  approved_at TIMESTAMP,
  dismissed_at TIMESTAMP,
  started_at TIMESTAMP
);

-- MEETING NOTES
CREATE TABLE IF NOT EXISTS meeting_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),
  file_path TEXT NOT NULL UNIQUE,
  title TEXT,
  date DATE,
  content TEXT,
  analyzed BOOLEAN DEFAULT false,
  analysis JSONB,
  tasks_detected INTEGER DEFAULT 0,
  objectives_detected INTEGER DEFAULT 0,
  team_mentions TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- TASK COMPLETIONS
CREATE TABLE IF NOT EXISTS task_completions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  detected_from TEXT,
  confidence DECIMAL,
  evidence TEXT,
  detected_at TIMESTAMP DEFAULT NOW(),
  user_confirmed BOOLEAN DEFAULT false
);

-- USER PREFERENCES
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  peak_hours JSONB DEFAULT '["09:00", "11:00"]'::JSONB,
  work_patterns JSONB DEFAULT '{}'::JSONB,
  notification_settings JSONB DEFAULT '{"badge_count": true, "task_digest": "daily", "digest_time": "08:00"}'::JSONB,
  auto_approve_threshold DECIMAL DEFAULT 0.95,
  task_cleanup_days INTEGER DEFAULT 2,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_urgency ON tasks(urgency);
CREATE INDEX IF NOT EXISTS idx_tasks_rank ON tasks(rank) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_tags ON projects USING GIN(tags);

-- VIEWS
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

-- RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated users" ON projects;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON tasks;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON meeting_notes;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON task_completions;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON user_preferences;

CREATE POLICY "Allow all for authenticated users" ON projects FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON tasks FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON meeting_notes FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON task_completions FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON user_preferences FOR ALL USING (true);
