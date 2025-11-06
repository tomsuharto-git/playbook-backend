-- Sample Data for Playbook
-- Run this in Supabase SQL Editor to populate the database with test tasks

-- First, create some projects
INSERT INTO projects (name, type, status, urgency, deadline, progress, team, lead, objectives, obsidian_path)
VALUES
  (
    'Baileys Creative Campaign',
    ARRAY['work', 'client'],
    'active',
    'high',
    CURRENT_DATE + 1,
    75,
    '[{"name": "Sarah Johnson", "role": "Creative Director"}, {"name": "Mike Chen", "role": "Client"}]'::jsonb,
    'Tom Suharto',
    '["Launch campaign Nov 1", "Win client approval", "Generate 50K impressions"]'::jsonb,
    'Notion/WORK/Clients/Baileys'
  ),
  (
    'Website Refresh',
    ARRAY['work'],
    'active',
    'normal',
    CURRENT_DATE + 7,
    60,
    '[{"name": "Design Team", "role": "Design"}, {"name": "Dev Team", "role": "Engineering"}]'::jsonb,
    'Tom Suharto',
    '["Modernize brand presence", "Improve UX", "Launch by Q4"]'::jsonb,
    'Notion/WORK/Projects/Website'
  ),
  (
    'Grid Kings F1 Fantasy',
    ARRAY['personal'],
    'active',
    'normal',
    CURRENT_DATE + 10,
    85,
    '[]'::jsonb,
    'Tom Suharto',
    '["Launch MVP", "Test with friends", "Deploy to production"]'::jsonb,
    'Claude Code/F1/Grid Kings'
  ),
  (
    'Monthly Admin',
    ARRAY['work'],
    'active',
    'low',
    CURRENT_DATE + 5,
    40,
    '[]'::jsonb,
    'Tom Suharto',
    '["Keep finances organized", "Submit on time"]'::jsonb,
    NULL
  );

-- Get project IDs for reference
DO $$
DECLARE
  baileys_id UUID;
  website_id UUID;
  gridkings_id UUID;
  admin_id UUID;
BEGIN
  SELECT id INTO baileys_id FROM projects WHERE name = 'Baileys Creative Campaign';
  SELECT id INTO website_id FROM projects WHERE name = 'Website Refresh';
  SELECT id INTO gridkings_id FROM projects WHERE name = 'Grid Kings F1 Fantasy';
  SELECT id INTO admin_id FROM projects WHERE name = 'Monthly Admin';

  -- ============================================================
  -- PENDING TASKS (AI-detected, awaiting approval)
  -- ============================================================

  INSERT INTO tasks (
    project_id, title, description, status, context, extra_tags, icon, urgency, rank,
    auto_detected, confidence, detected_from, detection_reasoning,
    due_date, time_estimate, suggested_time
  )
  VALUES
    (
      baileys_id,
      'Review Q4 Report',
      'Deep dive into customer sentiment metrics and prepare summary for leadership',
      'pending',
      'Work',
      ARRAY['Client', 'Data', 'Review'],
      '📊',
      'Now',
      1,
      true,
      0.95,
      'Notion/WORK/Clients/Baileys/2025-10-06-client-sync.md',
      'You said "I''ll review the Q4 analytics before tomorrow''s meeting" in the client sync. This is a clear commitment with an immediate deadline.',
      CURRENT_DATE,
      120,
      'morning'
    ),
    (
      website_id,
      'Finalize homepage wireframes',
      'Complete wireframe designs and get stakeholder sign-off',
      'pending',
      'Work',
      ARRAY['Design', 'Creative', 'Review'],
      '🎨',
      'Soon',
      5,
      true,
      0.92,
      'Notion/WORK/Projects/Website/2025-10-05-design-review.md',
      'Meeting notes mention "Tom will finalize homepage wireframes by end of week". Deadline is Friday.',
      CURRENT_DATE + 2,
      180,
      'afternoon'
    );

  -- ============================================================
  -- ACTIVE TASKS (Approved and in progress)
  -- ============================================================

  INSERT INTO tasks (
    project_id, title, description, status, context, extra_tags, icon, urgency, rank,
    due_date, time_estimate, time_spent, progress, approved_at
  )
  VALUES
    (
      baileys_id,
      'Finish presentation deck',
      'Complete final slides for tomorrow''s client pitch meeting',
      'active',
      'Work',
      ARRAY['Client', 'Creative', 'Urgent'],
      '🎯',
      'Now',
      1,
      CURRENT_DATE + 1,
      180,
      120,
      65,
      NOW() - INTERVAL '2 days'
    ),
    (
      website_id,
      'Homepage redesign',
      'Complete wireframes and prepare presentation for stakeholder review',
      'active',
      'Work',
      ARRAY['Design', 'Creative'],
      '🌐',
      'Now',
      2,
      CURRENT_DATE,
      180,
      60,
      35,
      NOW() - INTERVAL '3 days'
    ),
    (
      gridkings_id,
      'Fix draft picks database bug',
      'Resolve the issue where draft picks aren''t saving properly in Supabase',
      'active',
      'Work',
      ARRAY['Coding', 'Urgent'],
      '🐛',
      'Soon',
      8,
      CURRENT_DATE + 3,
      45,
      0,
      0,
      NOW() - INTERVAL '1 day'
    ),
    (
      admin_id,
      'Submit monthly expenses',
      'Compile and submit all business expenses from September',
      'active',
      'Work',
      ARRAY['Finance', 'Bills', 'Follow-up'],
      '💰',
      'Soon',
      10,
      CURRENT_DATE + 5,
      60,
      15,
      25,
      NOW() - INTERVAL '2 days'
    ),
    (
      gridkings_id,
      'Review F1 race schedule',
      'Check upcoming race calendar and update app deadlines',
      'active',
      'Life',
      ARRAY['Planning'],
      '🏎️',
      'Eventually',
      20,
      CURRENT_DATE + 10,
      30,
      0,
      0,
      NOW() - INTERVAL '1 day'
    );

  -- ============================================================
  -- COMPLETED TASKS (Last 2 days)
  -- ============================================================

  INSERT INTO tasks (
    project_id, title, description, status, context, extra_tags, icon, urgency,
    time_estimate, time_spent, progress, completed_at, approved_at
  )
  VALUES
    (
      baileys_id,
      'Review competitor analysis',
      'Analyzed competitor campaigns and messaging strategies',
      'complete',
      'Work',
      ARRAY['Research', 'Client'],
      '🔍',
      'Now',
      90,
      75,
      100,
      NOW() - INTERVAL '6 hours',
      NOW() - INTERVAL '3 days'
    ),
    (
      website_id,
      'Internal design review',
      'Got feedback from design team on initial concepts',
      'complete',
      'Work',
      ARRAY['Meeting', 'Design'],
      '💬',
      'Soon',
      60,
      60,
      100,
      NOW() - INTERVAL '1 day',
      NOW() - INTERVAL '4 days'
    );

  -- ============================================================
  -- BLOCKED TASK (Example)
  -- ============================================================

  INSERT INTO tasks (
    project_id, title, description, status, context, extra_tags, icon, urgency, rank,
    due_date, time_estimate, approved_at
  )
  VALUES
    (
      baileys_id,
      'Legal approval for ad claims',
      'Waiting on legal team to approve advertising claims for campaign',
      'blocked',
      'Work',
      ARRAY['Legal', 'Waiting On'],
      '⚖️',
      'Now',
      3,
      CURRENT_DATE + 1,
      30,
      NOW() - INTERVAL '4 days'
    );

END $$;

-- Success message
SELECT
  COUNT(*) FILTER (WHERE status = 'pending') as pending_tasks,
  COUNT(*) FILTER (WHERE status = 'active') as active_tasks,
  COUNT(*) FILTER (WHERE status = 'blocked') as blocked_tasks,
  COUNT(*) FILTER (WHERE status = 'complete') as completed_tasks,
  COUNT(*) as total_tasks
FROM tasks;

SELECT 'Sample data inserted successfully! 🎉' as status;
