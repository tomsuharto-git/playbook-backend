-- ============================================================
-- AI RANK CALCULATION FOR PLAYBOOK TASKS
-- ============================================================
-- This function automatically calculates and updates task ranks
-- based on urgency, deadline, project priority, and dependencies
-- ============================================================

-- Function to calculate a single task's rank score
CREATE OR REPLACE FUNCTION calculate_task_rank_score(
  task_urgency TEXT,
  task_due_date DATE,
  project_id UUID,
  task_status TEXT
)
RETURNS INTEGER AS $$
DECLARE
  urgency_score INTEGER := 0;
  deadline_score INTEGER := 0;
  project_priority_score INTEGER := 0;
  dependency_score INTEGER := 0;
  total_score INTEGER := 0;
  project_urgency_level TEXT;
  days_until_due INTEGER;
BEGIN
  -- 1. URGENCY SCORE (10 points max)
  CASE task_urgency
    WHEN 'Now' THEN urgency_score := 10;
    WHEN 'Soon' THEN urgency_score := 5;
    WHEN 'Eventually' THEN urgency_score := 1;
    ELSE urgency_score := 3;  -- default
  END CASE;

  -- 2. DEADLINE PROXIMITY SCORE (variable, more urgent = higher score)
  -- Days until due × -1 (so closer deadlines = higher score)
  IF task_due_date IS NOT NULL THEN
    days_until_due := (task_due_date - CURRENT_DATE);
    -- Invert so sooner = higher priority
    deadline_score := days_until_due * -1;
    -- Cap at reasonable bounds (-30 to +30)
    deadline_score := GREATEST(-30, LEAST(30, deadline_score));
  ELSE
    deadline_score := -10;  -- No deadline = lower priority
  END IF;

  -- 3. PROJECT PRIORITY SCORE (5 points max)
  -- Get project urgency if project exists
  IF project_id IS NOT NULL THEN
    SELECT urgency INTO project_urgency_level
    FROM projects
    WHERE id = project_id;

    CASE project_urgency_level
      WHEN 'high' THEN project_priority_score := 5;
      WHEN 'normal' THEN project_priority_score := 3;
      WHEN 'low' THEN project_priority_score := 1;
      ELSE project_priority_score := 2;
    END CASE;
  ELSE
    project_priority_score := 0;  -- No project
  END IF;

  -- 4. DEPENDENCY SCORE (5 points max)
  -- If task is blocking others or has high impact
  -- TODO: Implement when we add task dependencies
  -- For now, check if task has "Urgent" tag or is blocked status
  IF task_status = 'blocked' THEN
    dependency_score := -5;  -- Blocked tasks get deprioritized
  ELSE
    dependency_score := 0;
  END IF;

  -- TOTAL SCORE (lower score = higher priority/rank)
  -- We want lower scores to rank first, so invert
  total_score := (urgency_score + deadline_score + project_priority_score + dependency_score) * -1;

  RETURN total_score;
END;
$$ LANGUAGE plpgsql;

-- Function to recalculate all task ranks
CREATE OR REPLACE FUNCTION recalculate_all_task_ranks()
RETURNS void AS $$
DECLARE
  task_record RECORD;
  rank_counter INTEGER := 1;
BEGIN
  -- Calculate rank scores and assign sequential ranks
  FOR task_record IN
    SELECT
      t.id,
      calculate_task_rank_score(t.urgency, t.due_date, t.project_id, t.status) as rank_score
    FROM tasks t
    WHERE t.status IN ('active', 'pending')
    ORDER BY calculate_task_rank_score(t.urgency, t.due_date, t.project_id, t.status) ASC
  LOOP
    -- Update task with new rank
    UPDATE tasks
    SET rank = rank_counter
    WHERE id = task_record.id;

    rank_counter := rank_counter + 1;
  END LOOP;

  -- Set blocked and completed tasks to null rank
  UPDATE tasks
  SET rank = NULL
  WHERE status IN ('blocked', 'complete', 'dismissed');
END;
$$ LANGUAGE plpgsql;

-- Trigger function to recalculate ranks when tasks change
CREATE OR REPLACE FUNCTION trigger_recalculate_ranks()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculate all ranks whenever a task is inserted, updated, or deleted
  PERFORM recalculate_all_task_ranks();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS recalculate_ranks_on_task_change ON tasks;

-- Create trigger
CREATE TRIGGER recalculate_ranks_on_task_change
  AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_recalculate_ranks();

-- Also recalculate when projects change (affects project priority score)
DROP TRIGGER IF EXISTS recalculate_ranks_on_project_change ON projects;

CREATE TRIGGER recalculate_ranks_on_project_change
  AFTER UPDATE ON projects
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_recalculate_ranks();

-- Manual function to recalculate (can be called from API)
COMMENT ON FUNCTION recalculate_all_task_ranks() IS
'Recalculates rank for all active and pending tasks based on urgency, deadline, project priority, and status. Call this manually or let triggers handle it automatically.';

-- ============================================================
-- INITIAL RANK CALCULATION
-- ============================================================
-- Run this once after adding the function to populate initial ranks
SELECT recalculate_all_task_ranks();

-- Verify ranks
SELECT id, title, urgency, due_date, status, rank
FROM tasks
WHERE status IN ('active', 'pending')
ORDER BY rank ASC NULLS LAST;
