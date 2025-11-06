-- Migration 010: Quality Control Agent Tables
-- Created: 2025-11-02
-- Purpose: Track QC agent runs and actions for audit trail and rollback capability

-- ============================================================
-- QC RUNS TABLE
-- ============================================================
-- Tracks each QC agent execution
CREATE TABLE IF NOT EXISTS qc_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  status TEXT CHECK (status IN ('running', 'completed', 'completed_with_errors', 'failed')),

  -- Summary stats
  total_checks INTEGER DEFAULT 0,
  issues_detected INTEGER DEFAULT 0,
  issues_fixed INTEGER DEFAULT 0,
  alerts_raised INTEGER DEFAULT 0,

  -- Performance
  execution_time_ms INTEGER,

  -- Report location
  report_path TEXT,
  report_markdown TEXT, -- Full report stored inline

  -- Configuration snapshot (what thresholds were used)
  config_snapshot JSONB,

  -- Error tracking
  errors JSONB, -- Array of errors if any

  CONSTRAINT valid_status CHECK (
    (status = 'completed' AND completed_at IS NOT NULL) OR
    (status = 'running' AND completed_at IS NULL) OR
    (status IN ('completed_with_errors', 'failed'))
  )
);

-- Index for querying recent runs
CREATE INDEX IF NOT EXISTS idx_qc_runs_date ON qc_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_qc_runs_status ON qc_runs(status);

-- ============================================================
-- QC ACTIONS TABLE
-- ============================================================
-- Tracks individual QC actions for audit trail and rollback
CREATE TABLE IF NOT EXISTS qc_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qc_run_id UUID REFERENCES qc_runs(id) ON DELETE CASCADE,

  -- What was done
  action_type TEXT NOT NULL, -- 'dismiss_duplicate', 'enrich_title', 'fix_orphan', etc.
  category TEXT NOT NULL, -- 'pending_task', 'event', 'narrative', 'system'

  -- What entity
  entity_type TEXT NOT NULL, -- 'task', 'event', 'narrative', 'project'
  entity_id UUID NOT NULL,

  -- State tracking (for rollback)
  before_state JSONB, -- Full entity state before change
  after_state JSONB, -- Full entity state after change

  -- Why it was done
  reasoning TEXT NOT NULL,
  confidence_score DECIMAL, -- How confident QC was (0-1)

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Rollback tracking
  rolled_back BOOLEAN DEFAULT false,
  rolled_back_at TIMESTAMP WITH TIME ZONE,
  rolled_back_by TEXT -- 'user' or 'system'
);

-- Indexes for querying actions
CREATE INDEX IF NOT EXISTS idx_qc_actions_run ON qc_actions(qc_run_id);
CREATE INDEX IF NOT EXISTS idx_qc_actions_entity ON qc_actions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_qc_actions_type ON qc_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_qc_actions_date ON qc_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qc_actions_rollback ON qc_actions(rolled_back) WHERE rolled_back = false;

-- ============================================================
-- QC ALERTS TABLE
-- ============================================================
-- Tracks items that need manual review
CREATE TABLE IF NOT EXISTS qc_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qc_run_id UUID REFERENCES qc_runs(id) ON DELETE CASCADE,

  -- Alert details
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  details JSONB,

  -- Related entity (optional)
  entity_type TEXT,
  entity_id UUID,

  -- Resolution tracking
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed')),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by TEXT,
  resolution_notes TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for alert management
CREATE INDEX IF NOT EXISTS idx_qc_alerts_status ON qc_alerts(status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_qc_alerts_severity ON qc_alerts(severity) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_qc_alerts_date ON qc_alerts(created_at DESC);

-- ============================================================
-- QC STATS VIEW
-- ============================================================
-- Aggregated QC performance over time
CREATE OR REPLACE VIEW qc_stats AS
SELECT
  DATE_TRUNC('day', started_at) as date,
  COUNT(*) as runs_count,
  SUM(issues_detected) as total_issues_detected,
  SUM(issues_fixed) as total_issues_fixed,
  AVG(execution_time_ms) as avg_execution_time_ms,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_runs,
  AVG(CASE WHEN issues_detected > 0
    THEN (issues_fixed::DECIMAL / issues_detected)
    ELSE 1
  END) as avg_fix_rate
FROM qc_runs
WHERE status IN ('completed', 'completed_with_errors')
GROUP BY DATE_TRUNC('day', started_at)
ORDER BY date DESC;

-- ============================================================
-- QC ACTION SUMMARY VIEW
-- ============================================================
-- Summary of actions by type
CREATE OR REPLACE VIEW qc_action_summary AS
SELECT
  action_type,
  category,
  COUNT(*) as action_count,
  COUNT(DISTINCT entity_id) as unique_entities,
  AVG(confidence_score) as avg_confidence,
  SUM(CASE WHEN rolled_back THEN 1 ELSE 0 END) as rollback_count,
  MAX(created_at) as last_action_at
FROM qc_actions
GROUP BY action_type, category
ORDER BY action_count DESC;

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Function to start a new QC run
CREATE OR REPLACE FUNCTION start_qc_run(config JSON)
RETURNS UUID AS $$
DECLARE
  run_id UUID;
BEGIN
  INSERT INTO qc_runs (status, config_snapshot, started_at)
  VALUES ('running', config, NOW())
  RETURNING id INTO run_id;

  RETURN run_id;
END;
$$ LANGUAGE plpgsql;

-- Function to complete a QC run
CREATE OR REPLACE FUNCTION complete_qc_run(
  run_id UUID,
  run_status TEXT,
  stats JSON,
  report TEXT,
  errors_array JSON DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE qc_runs SET
    status = run_status,
    completed_at = NOW(),
    execution_time_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
    total_checks = (stats->>'total_checks')::INTEGER,
    issues_detected = (stats->>'issues_detected')::INTEGER,
    issues_fixed = (stats->>'issues_fixed')::INTEGER,
    alerts_raised = (stats->>'alerts_raised')::INTEGER,
    report_markdown = report,
    errors = errors_array
  WHERE id = run_id;
END;
$$ LANGUAGE plpgsql;

-- Function to log a QC action
CREATE OR REPLACE FUNCTION log_qc_action(
  run_id UUID,
  action_type_val TEXT,
  category_val TEXT,
  entity_type_val TEXT,
  entity_id_val UUID,
  before_state_val JSON,
  after_state_val JSON,
  reasoning_val TEXT,
  confidence_val DECIMAL DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  action_id UUID;
BEGIN
  INSERT INTO qc_actions (
    qc_run_id,
    action_type,
    category,
    entity_type,
    entity_id,
    before_state,
    after_state,
    reasoning,
    confidence_score
  ) VALUES (
    run_id,
    action_type_val,
    category_val,
    entity_type_val,
    entity_id_val,
    before_state_val,
    after_state_val,
    reasoning_val,
    confidence_val
  )
  RETURNING id INTO action_id;

  RETURN action_id;
END;
$$ LANGUAGE plpgsql;

-- Function to rollback a QC action
CREATE OR REPLACE FUNCTION rollback_qc_action(
  action_id UUID,
  rolled_back_by_val TEXT
)
RETURNS VOID AS $$
DECLARE
  action_record RECORD;
BEGIN
  -- Get the action record
  SELECT * INTO action_record FROM qc_actions WHERE id = action_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'QC action % not found', action_id;
  END IF;

  IF action_record.rolled_back THEN
    RAISE EXCEPTION 'QC action % already rolled back', action_id;
  END IF;

  -- Mark as rolled back
  UPDATE qc_actions SET
    rolled_back = true,
    rolled_back_at = NOW(),
    rolled_back_by = rolled_back_by_val
  WHERE id = action_id;

  -- Note: Actual entity restoration must be done by caller
  -- This just marks the action as rolled back
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- GRANTS (adjust as needed)
-- ============================================================
-- Grant permissions to your application role
-- GRANT ALL ON qc_runs, qc_actions, qc_alerts TO your_app_role;
-- GRANT EXECUTE ON FUNCTION start_qc_run TO your_app_role;
-- GRANT EXECUTE ON FUNCTION complete_qc_run TO your_app_role;
-- GRANT EXECUTE ON FUNCTION log_qc_action TO your_app_role;
-- GRANT EXECUTE ON FUNCTION rollback_qc_action TO your_app_role;

-- ============================================================
-- INITIAL DATA
-- ============================================================
-- None needed - tables start empty

-- ============================================================
-- VERIFICATION
-- ============================================================
-- Run this to verify migration succeeded:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name LIKE 'qc_%';

-- Should return: qc_runs, qc_actions, qc_alerts

COMMENT ON TABLE qc_runs IS 'Tracks each Quality Control agent execution';
COMMENT ON TABLE qc_actions IS 'Audit trail of individual QC actions for rollback capability';
COMMENT ON TABLE qc_alerts IS 'Manual review queue for items QC flagged but did not auto-fix';

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 010 (Quality Control) completed successfully';
  RAISE NOTICE 'Created tables: qc_runs, qc_actions, qc_alerts';
  RAISE NOTICE 'Created views: qc_stats, qc_action_summary';
  RAISE NOTICE 'Created functions: start_qc_run, complete_qc_run, log_qc_action, rollback_qc_action';
END $$;
