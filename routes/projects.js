const express = require('express');
const logger = require('../utils/logger').route('projects');
const router = express.Router();
const { supabase } = require('../db/supabase-client');

/**
 * GET /api/projects
 * Fetches all projects with their power rankings and metadata
 */
router.get('/', async (req, res) => {
  try {
    logger.debug('\n📊 Fetching all projects from database');

    const { data: projects, error } = await supabase
      .from('projects')
      .select('*')
      .order('power_ranking', { ascending: false });

    if (error) {
      logger.error('   ❌ Database error:', { arg0: error });
      return res.status(500).json({ error: 'Failed to fetch projects' });
    }

    logger.info('✅ Found  projects', { length || 0: projects?.length || 0 });

    res.json({
      projects: projects || [],
      count: projects?.length || 0
    });

  } catch (error) {
    logger.error('   ❌ Error fetching projects:', { arg0: error });
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
    logger.debug('\n📊 Fetching project details for ID:', { id: id });

    // Fetch project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (projectError) {
      logger.error('   ❌ Database error:', { arg0: projectError });
      return res.status(404).json({ error: 'Project not found' });
    }

    // Fetch related tasks
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('id, title, status, urgency, created_at, due_date')
      .eq('project_id', id)
      .order('created_at', { ascending: false });

    if (tasksError) {
      logger.error('   ⚠️ Error fetching tasks:', { arg0: tasksError });
    }

    logger.info('✅ Found project with  tasks', { length || 0: tasks?.length || 0 });

    res.json({
      project,
      tasks: tasks || []
    });

  } catch (error) {
    logger.error('   ❌ Error fetching project:', { arg0: error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
