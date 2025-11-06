-- AI Task Manager Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT[] DEFAULT ARRAY[]::TEXT[], -- ['work', 'client', 'personal']
  status TEXT DEFAULT 'active', -- 'active', 'on-hold', 'complete'
  urgency TEXT DEFAULT 'medium', -- 'high', 'medium', 'low'
  health TEXT DEFAULT 'on-track', -- 'on-track', 'at-risk', 'blocked'
  deadline DATE,
  progress DECIMAL DEFAULT 0, -- 0-100
  obsidian_path TEXT, -- Path to project .md file
  team JSONB DEFAULT '[]'::JSONB, -- Array of team members
  overview TEXT,
  success_metrics JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tasks table
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'todo', -- 'todo', 'in-progress', 'blocked', 'complete'
  priority TEXT DEFAULT 'normal', -- 'urgent', 'high', 'normal', 'low'
  due_date DATE,
  time_estimate INTEGER, -- minutes
  time_spent INTEGER DEFAULT 0, -- minutes
  progress DECIMAL DEFAULT 0, -- 0-100
  obsidian_line INTEGER, -- Line number in .md file
  obsidian_file TEXT, -- Path to .md file containing task
  auto_detected BOOLEAN DEFAULT FALSE, -- AI found this task
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  started_at TIMESTAMP
);

-- Task completions (AI-detected)
CREATE TABLE task_completions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  detected_from TEXT, -- meeting note path
  confidence DECIMAL, -- 0-1 (how sure AI is)
  evidence TEXT, -- Quote from note showing completion
  detected_at TIMESTAMP DEFAULT NOW(),
  user_confirmed BOOLEAN DEFAULT FALSE,
  user_reviewed_at TIMESTAMP
);

-- Daily goals
CREATE TABLE daily_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL UNIQUE,
  goals JSONB DEFAULT '[]'::JSONB, -- Array of task IDs + metadata
  ai_reasoning TEXT, -- Why AI suggested these
  user_modified BOOLEAN DEFAULT FALSE,
  locked BOOLEAN DEFAULT FALSE, -- User locked the plan
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- User preferences
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  peak_hours JSONB DEFAULT '{"start": "08:00", "end": "11:00"}'::JSONB,
  work_patterns JSONB DEFAULT '{}'::JSONB, -- Learned behaviors
  notification_settings JSONB DEFAULT '{}'::JSONB,
  calendar_settings JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Activity log (for learning patterns)
CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'started', 'paused', 'resumed', 'completed'
  timestamp TIMESTAMP DEFAULT NOW(),
  context JSONB DEFAULT '{}'::JSONB -- Additional context
);

-- Meeting notes (cached for quick access)
CREATE TABLE meeting_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_path TEXT NOT NULL UNIQUE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT,
  date DATE,
  content TEXT,
  analyzed BOOLEAN DEFAULT FALSE,
  analysis JSONB DEFAULT '{}'::JSONB, -- AI analysis results
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_daily_goals_date ON daily_goals(date);
CREATE INDEX idx_meeting_notes_path ON meeting_notes(file_path);
CREATE INDEX idx_activity_log_task ON activity_log(task_id);

-- Enable Row Level Security (RLS)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow all for now - single user system)
CREATE POLICY "Allow all for authenticated users" ON projects FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON tasks FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON task_completions FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON daily_goals FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON user_preferences FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON activity_log FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON meeting_notes FOR ALL USING (true);

-- Triggers for updated_at
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

CREATE TRIGGER update_daily_goals_updated_at BEFORE UPDATE ON daily_goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_meeting_notes_updated_at BEFORE UPDATE ON meeting_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate project progress
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

-- Seed user preferences
INSERT INTO user_preferences (peak_hours, work_patterns, notification_settings)
VALUES (
  '{"start": "08:00", "end": "11:00"}'::JSONB,
  '{
    "creative_work": "morning",
    "meetings": "afternoon",
    "admin_tasks": "end_of_day",
    "focus_block_duration": 90,
    "break_frequency": 120
  }'::JSONB,
  '{
    "push_enabled": true,
    "task_reminders": true,
    "goal_reminder_time": "07:00",
    "daily_summary_time": "17:00"
  }'::JSONB
);

-- Create views for common queries
CREATE VIEW active_tasks AS
SELECT 
  t.*,
  p.name as project_name,
  p.urgency as project_urgency
FROM tasks t
LEFT JOIN projects p ON t.project_id = p.id
WHERE t.status IN ('todo', 'in-progress', 'blocked')
ORDER BY 
  CASE t.priority
    WHEN 'urgent' THEN 1
    WHEN 'high' THEN 2
    WHEN 'normal' THEN 3
    WHEN 'low' THEN 4
  END,
  t.due_date ASC NULLS LAST;

CREATE VIEW project_health AS
SELECT 
  p.*,
  COUNT(t.id) as total_tasks,
  COUNT(CASE WHEN t.status = 'complete' THEN 1 END) as completed_tasks,
  COUNT(CASE WHEN t.status = 'blocked' THEN 1 END) as blocked_tasks,
  calculate_project_progress(p.id) as calculated_progress
FROM projects p
LEFT JOIN tasks t ON p.id = t.project_id
WHERE p.status = 'active'
GROUP BY p.id;

-- Success!
SELECT 'Database schema created successfully!' as status;
