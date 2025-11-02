-- Migration 002: Projects Page Features
-- Adds columns and indexes needed for the new Projects page with AI-powered journey system
-- Date: 2025-10-17

-- ============================================================
-- 1. ADD NEW COLUMNS TO PROJECTS TABLE
-- ============================================================

ALTER TABLE projects
  -- Deadline details
  ADD COLUMN IF NOT EXISTS deadline_label TEXT,          -- "First Round Presentation"
  ADD COLUMN IF NOT EXISTS deliverable TEXT,             -- Description of what's being delivered

  -- Power ranking system
  ADD COLUMN IF NOT EXISTS power_ranking INTEGER DEFAULT 50,
  ADD COLUMN IF NOT EXISTS power_ranking_updated_at TIMESTAMP,

  -- AI Journey system
  ADD COLUMN IF NOT EXISTS ai_insights JSONB,            -- Stores journey, milestones, status
  ADD COLUMN IF NOT EXISTS journey_generated_at TIMESTAMP,

  -- Activity tracking
  ADD COLUMN IF NOT EXISTS last_narrative_date TIMESTAMP; -- For HOT filter

-- ============================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- ============================================================

-- Index for sorting by power ranking
CREATE INDEX IF NOT EXISTS idx_projects_power_ranking
  ON projects(power_ranking DESC NULLS LAST);

-- Index for HOT filter (recent narrative activity)
CREATE INDEX IF NOT EXISTS idx_projects_last_narrative
  ON projects(last_narrative_date DESC);

-- Index for deadline proximity
CREATE INDEX IF NOT EXISTS idx_projects_deadline
  ON projects(deadline) WHERE deadline IS NOT NULL;

-- Index for AI insights JSONB queries
CREATE INDEX IF NOT EXISTS idx_projects_ai_insights_status
  ON projects((ai_insights->>'status')) WHERE ai_insights IS NOT NULL;

-- ============================================================
-- 3. UPDATE EXISTING TAGS/COLOR STRUCTURE
-- ============================================================

-- Ensure tags column exists (for Work/Code/Life filtering)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS tag TEXT DEFAULT 'Work'
  CHECK (tag IN ('Work', 'Code', 'Life'));

-- Ensure color column exists (for left border)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS project_color TEXT DEFAULT '#95A5A6';

-- ============================================================
-- 4. CREATE HELPER FUNCTIONS
-- ============================================================

-- Function to calculate power ranking
CREATE OR REPLACE FUNCTION calculate_power_ranking(project_id UUID)
RETURNS INTEGER AS $$
DECLARE
  deadline_score INTEGER := 0;
  file_creation_score INTEGER := 0;
  narrative_activity_score INTEGER := 0;
  narrative_sentiment_score INTEGER := 0;
  status_score INTEGER := 50;
  task_score INTEGER := 0;

  project_deadline DATE;
  days_until_deadline INTEGER;
  narrative_count_5d INTEGER;
  avg_narratives_per_day DECIMAL;
  files_count_30d INTEGER;
  files_per_week DECIMAL;
  project_status TEXT;
  active_task_count INTEGER;
  overdue_task_count INTEGER;
  due_soon_3d_count INTEGER;
  due_soon_7d_count INTEGER;

  final_ranking INTEGER;
BEGIN
  -- Get project data
  SELECT deadline, ai_insights->>'status'
  INTO project_deadline, project_status
  FROM projects WHERE id = project_id;

  -- 1. DEADLINE SCORE (30% weight)
  IF project_deadline IS NOT NULL THEN
    days_until_deadline := project_deadline - CURRENT_DATE;

    IF days_until_deadline < 0 THEN
      deadline_score := 100; -- Overdue
    ELSIF days_until_deadline <= 3 THEN
      deadline_score := 95;
    ELSIF days_until_deadline <= 7 THEN
      deadline_score := 90;
    ELSIF days_until_deadline <= 14 THEN
      deadline_score := 80;
    ELSIF days_until_deadline <= 30 THEN
      deadline_score := 60;
    ELSIF days_until_deadline <= 60 THEN
      deadline_score := 40;
    ELSE
      deadline_score := 20;
    END IF;
  END IF;

  -- 2. FILE CREATION FREQUENCY SCORE (20% weight)
  -- Count files created in last 30 days
  SELECT COUNT(*)
  INTO files_count_30d
  FROM meeting_notes
  WHERE project_id = calculate_power_ranking.project_id
    AND created_at >= CURRENT_DATE - INTERVAL '30 days';

  -- Calculate files per week
  files_per_week := (files_count_30d::DECIMAL / 30.0) * 7.0;

  -- Score based on files per week
  IF files_per_week >= 15.0 THEN
    file_creation_score := 100;  -- 15+/week = very active
  ELSIF files_per_week >= 10.0 THEN
    file_creation_score := 85;   -- 10-15/week = highly active
  ELSIF files_per_week >= 5.0 THEN
    file_creation_score := 70;   -- 5-10/week = active
  ELSIF files_per_week >= 3.0 THEN
    file_creation_score := 50;   -- 3-5/week = moderate
  ELSIF files_per_week >= 1.0 THEN
    file_creation_score := 30;   -- 1-3/week = light
  ELSIF files_per_week >= 0.5 THEN
    file_creation_score := 15;   -- 0.5-1/week = minimal
  ELSE
    file_creation_score := 0;    -- < 0.5/week = dormant
  END IF;

  -- 3. NARRATIVE ACTIVITY SCORE (15% weight)
  -- Count narratives in last 5 days and calculate average per day
  SELECT COUNT(*)
  INTO narrative_count_5d
  FROM meeting_notes
  WHERE project_id = calculate_power_ranking.project_id
    AND date >= CURRENT_DATE - INTERVAL '5 days'
    AND date IS NOT NULL;

  -- Calculate average narratives per day over last 5 days
  avg_narratives_per_day := narrative_count_5d::DECIMAL / 5.0;

  -- Score based on average narratives per day
  IF avg_narratives_per_day >= 2.0 THEN
    narrative_activity_score := 100;  -- 2+ per day = very active
  ELSIF avg_narratives_per_day >= 1.0 THEN
    narrative_activity_score := 85;   -- 1+ per day = active
  ELSIF avg_narratives_per_day >= 0.6 THEN
    narrative_activity_score := 70;   -- 3+ over 5 days = moderate
  ELSIF avg_narratives_per_day >= 0.4 THEN
    narrative_activity_score := 50;   -- 2+ over 5 days = light activity
  ELSIF avg_narratives_per_day >= 0.2 THEN
    narrative_activity_score := 30;   -- 1+ over 5 days = minimal
  ELSE
    narrative_activity_score := 0;    -- No recent activity
  END IF;

  -- 4. NARRATIVE SENTIMENT SCORE (10% weight)
  -- Simplified: check for warning keywords in recent narratives
  -- (Could be enhanced with actual sentiment analysis)
  narrative_sentiment_score := 30; -- Default neutral

  -- 5. STATUS SCORE (10% weight)
  status_score := CASE project_status
    WHEN 'critical' THEN 100
    WHEN 'at_risk' THEN 85
    WHEN 'stalled' THEN 70
    WHEN 'on_track' THEN 30
    ELSE 50
  END;

  -- 6. TASK SCORE (20% weight)
  -- Count tasks by priority (HOT, Soon, Eventually)
  -- Includes active tasks AND recently completed/dismissed tasks (last 14 days)
  -- HOT tasks count 3x, Soon tasks count 2x, Eventually tasks count 1x
  SELECT
    COUNT(*) FILTER (WHERE
      (status IN ('pending', 'active', 'blocked') OR
       (status IN ('complete', 'dismissed') AND updated_at >= CURRENT_DATE - INTERVAL '14 days'))
      AND (LOWER(priority) IN ('hot', 'urgent'))
    ),
    COUNT(*) FILTER (WHERE
      (status IN ('pending', 'active', 'blocked') OR
       (status IN ('complete', 'dismissed') AND updated_at >= CURRENT_DATE - INTERVAL '14 days'))
      AND (LOWER(priority) IN ('soon', 'high'))
    ),
    COUNT(*) FILTER (WHERE
      (status IN ('pending', 'active', 'blocked') OR
       (status IN ('complete', 'dismissed') AND updated_at >= CURRENT_DATE - INTERVAL '14 days'))
      AND (LOWER(priority) IN ('eventually', 'normal'))
    ),
    COUNT(*) FILTER (WHERE
      status IN ('pending', 'active', 'blocked') OR
      (status IN ('complete', 'dismissed') AND updated_at >= CURRENT_DATE - INTERVAL '14 days')
    )
  INTO overdue_task_count, due_soon_3d_count, due_soon_7d_count, active_task_count
  FROM tasks WHERE tasks.project_id = calculate_power_ranking.project_id;

  -- Calculate weighted task score based on priority
  -- HOT = 3x, Soon = 2x, Eventually = 1x
  task_score := (overdue_task_count * 3) + (due_soon_3d_count * 2) + (due_soon_7d_count * 1);

  -- Normalize to 0-100 scale (assuming 20 total tasks would be very high activity)
  task_score := LEAST((task_score::DECIMAL / 20.0) * 100, 100);
  task_score := ROUND(task_score);

  -- CALCULATE FINAL RANKING
  final_ranking := ROUND(
    (deadline_score * 0.30) +
    (file_creation_score * 0.15) +
    (narrative_activity_score * 0.15) +
    (status_score * 0.10) +
    (task_score * 0.20) +
    (narrative_sentiment_score * 0.10)
  );

  -- Update the project with new ranking and breakdown
  UPDATE projects
  SET
    power_ranking = final_ranking,
    power_ranking_updated_at = NOW(),
    ai_insights = COALESCE(ai_insights, '{}'::jsonb) ||
      jsonb_build_object('power_ranking_breakdown', jsonb_build_object(
        'deadline_score', deadline_score,
        'file_creation_score', file_creation_score,
        'files_count_30d', files_count_30d,
        'files_per_week', ROUND(files_per_week::numeric, 2),
        'narrative_activity_score', narrative_activity_score,
        'narrative_count_5d', narrative_count_5d,
        'avg_narratives_per_day', ROUND(avg_narratives_per_day::numeric, 2),
        'narrative_sentiment_score', narrative_sentiment_score,
        'status_score', status_score,
        'task_score', task_score,
        'active_task_count', active_task_count,
        'hot_task_count', overdue_task_count,
        'soon_task_count', due_soon_3d_count,
        'eventually_task_count', due_soon_7d_count,
        'final_score', final_ranking
      ))
  WHERE id = project_id;

  RETURN final_ranking;
END;
$$ LANGUAGE plpgsql;

-- Function to update last_narrative_date when narrative is added
CREATE OR REPLACE FUNCTION update_project_last_narrative_date()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE projects
  SET last_narrative_date = NEW.date
  WHERE id = NEW.project_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 5. CREATE TRIGGERS
-- ============================================================

-- Trigger to update last_narrative_date when meeting_notes added
DROP TRIGGER IF EXISTS trigger_update_last_narrative_date ON meeting_notes;
CREATE TRIGGER trigger_update_last_narrative_date
  AFTER INSERT ON meeting_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_project_last_narrative_date();

-- ============================================================
-- 6. MIGRATE EXISTING DATA
-- ============================================================

-- Set initial power ranking for all projects
UPDATE projects
SET power_ranking = 50
WHERE power_ranking IS NULL;

-- Set last_narrative_date from most recent meeting_notes
UPDATE projects p
SET last_narrative_date = (
  SELECT MAX(n.date)
  FROM meeting_notes n
  WHERE n.project_id = p.id
);

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================

SELECT 'Migration 002 completed successfully! Projects page features are ready.' as status;
