/**
 * Project Context Enhancer Service
 * Fetches project narrative and active tasks to enrich event briefings
 */

const { supabase } = require('../db/supabase-client');

/**
 * Fetch full project context (narrative + active tasks)
 */
async function fetchProjectContext(projectId) {
  try {
    console.log(`   📚 Fetching context for project: ${projectId}`);

    // Fetch project details
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, name, narrative, color, urgency, status, objectives, context')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      console.error('   ⚠️  Error fetching project:', projectError);
      return null;
    }

    console.log(`   ✓ Project: ${project.name}`);

    // Fetch active tasks for this project
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('id, title, description, urgency, status, due_date, rank')
      .eq('project_id', projectId)
      .in('status', ['active', 'blocked'])
      .order('rank', { ascending: true, nullsFirst: false })
      .order('urgency', { ascending: true })
      .limit(15); // Get top 15 tasks

    if (tasksError) {
      console.error('   ⚠️  Error fetching tasks:', tasksError);
    }

    const taskCount = tasks?.length || 0;
    console.log(`   ✓ Tasks: ${taskCount} active`);

    return {
      project: {
        id: project.id,
        name: project.name,
        narrative: project.narrative,
        objectives: project.objectives,
        color: project.color,
        urgency: project.urgency,
        status: project.status,
        context: project.context  // 'Work' or 'Life'
      },
      tasks: tasks || []
    };
  } catch (error) {
    console.error('Error fetching project context:', error);
    return null;
  }
}

/**
 * Enrich event with project information
 */
async function enrichEventWithProject(event, projectMatch) {
  if (!projectMatch) {
    return event;
  }

  // Fetch full context
  const projectContext = await fetchProjectContext(projectMatch.id);

  if (!projectContext) {
    return event;
  }

  return {
    ...event,
    project_id: projectContext.project.id,
    project_name: projectContext.project.name,
    project_color: projectContext.project.color,
    project_urgency: projectContext.project.urgency,
    project_confidence: projectMatch.confidence || 1.0,
    project_detection_method: projectMatch.detection_method || 'unknown',
    project_work_life_context: projectContext.project.context,  // 'Work' or 'Life' - for categorization
    project_context: projectContext  // Full project details + tasks - for briefing generation
  };
}

module.exports = {
  fetchProjectContext,
  enrichEventWithProject
};
