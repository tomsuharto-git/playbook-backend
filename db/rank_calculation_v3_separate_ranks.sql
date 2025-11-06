-- ============================================================
-- AI RANK CALCULATION V3 - Separate Rankings for Active & Pending
-- ============================================================
-- Active tasks get ranks: 1, 2, 3...
-- Pending tasks get ranks: 1, 2, 3...
-- This keeps each queue's prioritization independent
-- ============================================================

-- The calculation function remains the same (it works fine)
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
    ELSE urgency_score := 3;
  END CASE;

  -- 2. DEADLINE PROXIMITY SCORE
  IF task_due_date IS NOT NULL THEN
    days_until_due := (task_due_date - CURRENT_DATE);
    deadline_score := days_until_due * -1;
    deadline_score := GREATEST(-30, LEAST(30, deadline_score));
  ELSE
    deadline_score := -10;
  END IF;

  -- 3. PROJECT PRIORITY SCORE
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
    project_priority_score := 0;
  END IF;

  -- 4. DEPENDENCY SCORE
  IF task_status = 'blocked' THEN
    dependency_score := -5;
  ELSE
    dependency_score := 0;
  END IF;

  -- TOTAL SCORE (inverted so lower = higher priority)
  total_score := (urgency_score + deadline_score + project_priority_score + dependency_score) * -1;

  RETURN total_score;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- NEW: Rank active and pending tasks SEPARATELY
-- ============================================================
CREATE OR REPLACE FUNCTION recalculate_all_task_ranks()
RETURNS void AS $$
DECLARE
  task_record RECORD;
  rank_counter INTEGER;
BEGIN
  -- PART 1: Rank ACTIVE tasks (1, 2, 3...)
  rank_counter := 1;
  FOR task_record IN
    SELECT
      t.id,
      calculate_task_rank_score(t.urgency, t.due_date, t.project_id, t.status) as rank_score
    FROM tasks t
    WHERE t.status = 'active'
    ORDER BY
      calculate_task_rank_score(t.urgency, t.due_date, t.project_id, t.status) ASC,
      CASE t.urgency
        WHEN 'Now' THEN 1
        WHEN 'Soon' THEN 2
        WHEN 'Eventually' THEN 3
        ELSE 4
      END ASC
  LOOP
    UPDATE tasks
    SET rank = rank_counter
    WHERE id = task_record.id;

    rank_counter := rank_counter + 1;
  END LOOP;

  -- PART 2: Rank PENDING tasks (1, 2, 3...)
  rank_counter := 1;
  FOR task_record IN
    SELECT
      t.id,
      calculate_task_rank_score(t.urgency, t.due_date, t.project_id, t.status) as rank_score
    FROM tasks t
    WHERE t.status = 'pending'
    ORDER BY
      calculate_task_rank_score(t.urgency, t.due_date, t.project_id, t.status) ASC,
      CASE t.urgency
        WHEN 'Now' THEN 1
        WHEN 'Soon' THEN 2
        WHEN 'Eventually' THEN 3
        ELSE 4
      END ASC
  LOOP
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

-- ============================================================
-- Safe trigger that prevents recursion
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_recalculate_ranks_safe()
RETURNS TRIGGER AS $$
BEGIN
  -- Only recalculate if we're not already in a recalculation
  IF current_setting('app.recalculating_ranks', true) IS DISTINCT FROM 'true' THEN
    -- Set the flag to prevent recursion
    PERFORM set_config('app.recalculating_ranks', 'true', true);

    -- Recalculate ranks
    PERFORM recalculate_all_task_ranks();

    -- Clear the flag
    PERFORM set_config('app.recalculating_ranks', 'false', true);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop old triggers (if they exist)
DROP TRIGGER IF EXISTS recalculate_ranks_on_task_change ON tasks;
DROP TRIGGER IF EXISTS recalculate_ranks_on_project_change ON projects;

-- Create the safe triggers
CREATE TRIGGER recalculate_ranks_on_task_change
  AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_recalculate_ranks_safe();

CREATE TRIGGER recalculate_ranks_on_project_change
  AFTER UPDATE ON projects
  FOR EACH STATEMENT
  EXECUTE FUNCTION trigger_recalculate_ranks_safe();

-- ============================================================
-- Run initial calculation
-- ============================================================
SELECT recalculate_all_task_ranks();

COMMENT ON FUNCTION recalculate_all_task_ranks() IS
'Recalculates ranks separately for active and pending tasks. Active tasks get ranks 1,2,3... and pending tasks get independent ranks 1,2,3... This keeps each queue prioritized independently.';
