-- Migration 003: Recurring Tasks
-- Creates recurring_tasks table and adds recurring_task_id to tasks table

-- Create recurring_tasks table
CREATE TABLE IF NOT EXISTS recurring_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  project_id UUID REFERENCES projects(id),
  context TEXT CHECK (context IN ('Work', 'Life')),
  urgency TEXT NOT NULL CHECK (urgency IN ('Now', 'Soon', 'Eventually')),
  extra_tags TEXT[] DEFAULT '{}',
  icon TEXT,
  time_estimate INTEGER, -- minutes, optional

  -- Recurrence settings
  recurrence_type TEXT NOT NULL CHECK (recurrence_type IN ('daily', 'weekly', 'monthly')),
  recurrence_day INTEGER CHECK (recurrence_day >= 0 AND recurrence_day <= 6), -- 0=Sunday for weekly
  recurrence_time TIME NOT NULL, -- e.g., '12:00:00'
  timezone TEXT DEFAULT 'America/New_York',

  -- State tracking
  active BOOLEAN DEFAULT true,
  last_generated_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add recurring_task_id to tasks table
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS recurring_task_id UUID REFERENCES recurring_tasks(id);

-- Add index for efficient recurring task queries
CREATE INDEX IF NOT EXISTS idx_recurring_tasks_active ON recurring_tasks(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_tasks_recurring ON tasks(recurring_task_id) WHERE recurring_task_id IS NOT NULL;

-- Add updated_at trigger for recurring_tasks
CREATE OR REPLACE FUNCTION update_recurring_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_recurring_tasks_updated_at
  BEFORE UPDATE ON recurring_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_recurring_tasks_updated_at();

-- Insert the recycling recurring task
INSERT INTO recurring_tasks (
  title,
  project_id,
  context,
  urgency,
  recurrence_type,
  recurrence_day,
  recurrence_time,
  timezone,
  active
) VALUES (
  'Take out recycling',
  (SELECT id FROM projects WHERE name = 'MISC' LIMIT 1),
  'Life',
  'Now',
  'weekly',
  0, -- Sunday
  '12:00:00',
  'America/New_York',
  true
);

COMMENT ON TABLE recurring_tasks IS 'Templates for recurring tasks that generate at scheduled intervals';
COMMENT ON COLUMN recurring_tasks.recurrence_day IS '0=Sunday, 1=Monday, etc. for weekly tasks';
COMMENT ON COLUMN recurring_tasks.last_generated_at IS 'Last time this recurring task generated a task instance';
COMMENT ON COLUMN tasks.recurring_task_id IS 'Links task to its recurring template if auto-generated';
