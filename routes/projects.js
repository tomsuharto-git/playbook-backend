const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase-client');

/**
 * GET /api/projects
 * Fetches all projects with their power rankings and metadata
 */
router.get('/', async (req, res) => {
  try {
    console.log('\n📊 Fetching all projects from database');

    const { data: projects, error } = await supabase
      .from('projects')
      .select('*')
      .order('power_ranking', { ascending: false });

    if (error) {
      console.error('   ❌ Database error:', error);
      return res.status(500).json({ error: 'Failed to fetch projects' });
    }

    console.log(`   ✅ Found ${projects?.length || 0} projects`);

    res.json({
      projects: projects || [],
      count: projects?.length || 0
    });

  } catch (error) {
    console.error('   ❌ Error fetching projects:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/projects/:id
 * Fetches a single project with all its details and related tasks
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`\n📊 Fetching project details for ID: ${id}`);

    // Fetch project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (projectError) {
      console.error('   ❌ Database error:', projectError);
      return res.status(404).json({ error: 'Project not found' });
    }

    // Fetch related tasks
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('id, title, status, urgency, created_at, due_date')
      .eq('project_id', id)
      .order('created_at', { ascending: false });

    if (tasksError) {
      console.error('   ⚠️ Error fetching tasks:', tasksError);
    }

    console.log(`   ✅ Found project with ${tasks?.length || 0} tasks`);

    res.json({
      project,
      tasks: tasks || []
    });

  } catch (error) {
    console.error('   ❌ Error fetching project:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
