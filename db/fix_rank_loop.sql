-- ============================================================
-- EMERGENCY FIX: Drop infinite loop triggers
-- ============================================================

-- Drop the problematic triggers
DROP TRIGGER IF EXISTS recalculate_ranks_on_task_change ON tasks;
DROP TRIGGER IF EXISTS recalculate_ranks_on_project_change ON projects;

-- The functions are fine, just the triggers caused the loop
-- We'll recreate them properly
