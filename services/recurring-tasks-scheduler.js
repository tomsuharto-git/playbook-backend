const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

class RecurringTasksScheduler {
  constructor() {
    this.job = null;
  }

  /**
   * Start the recurring tasks scheduler
   * Runs every 3 hours to check for tasks that need to be generated
   */
  start() {
    console.log('🔄 Starting recurring tasks scheduler (runs every 3 hours)');

    // Run immediately on startup
    this.checkAndGenerateTasks();

    // Schedule to run every 3 hours: 0 */3 * * * (at minute 0 of every 3rd hour)
    this.job = cron.schedule('0 */3 * * *', () => {
      this.checkAndGenerateTasks();
    });

    console.log('✅ Recurring tasks scheduler started');
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.job) {
      this.job.stop();
      console.log('🛑 Recurring tasks scheduler stopped');
    }
  }

  /**
   * Main function to check and generate recurring tasks
   */
  async checkAndGenerateTasks() {
    try {
      console.log('🔍 Checking for recurring tasks to generate...');

      // Get current time in Eastern timezone
      const now = new Date();
      const easternTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const currentDay = easternTime.getDay(); // 0=Sunday, 1=Monday, etc.
      const currentTime = easternTime.toTimeString().split(' ')[0]; // HH:MM:SS
      const currentHour = easternTime.getHours();
      const currentMinute = easternTime.getMinutes();

      console.log(`📅 Current Eastern time: ${easternTime.toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
      console.log(`   Day: ${currentDay} (0=Sunday), Time: ${currentTime}`);

      // Fetch all active recurring tasks
      const { data: recurringTasks, error: fetchError } = await supabase
        .from('recurring_tasks')
        .select('*')
        .eq('active', true);

      if (fetchError) {
        console.error('❌ Error fetching recurring tasks:', fetchError);
        return;
      }

      if (!recurringTasks || recurringTasks.length === 0) {
        console.log('📭 No active recurring tasks found');
        return;
      }

      console.log(`📋 Found ${recurringTasks.length} active recurring task(s)`);

      for (const recurringTask of recurringTasks) {
        await this.processRecurringTask(recurringTask, easternTime, currentDay, currentTime);
      }

      console.log('✅ Recurring tasks check complete');
    } catch (error) {
      console.error('❌ Error in checkAndGenerateTasks:', error);
    }
  }

  /**
   * Process a single recurring task
   */
  async processRecurringTask(recurringTask, easternTime, currentDay, currentTime) {
    try {
      // Check if this task should run today
      const shouldRunToday = this.shouldRunToday(recurringTask, currentDay);

      if (!shouldRunToday) {
        return; // Not scheduled for today
      }

      // Check if we've already generated a task today
      const alreadyGeneratedToday = await this.wasGeneratedToday(recurringTask, easternTime);

      if (alreadyGeneratedToday) {
        return; // Already generated today
      }

      // Check if it's time to generate (past the scheduled time)
      const isPastScheduledTime = this.isPastScheduledTime(currentTime, recurringTask.recurrence_time);

      if (!isPastScheduledTime) {
        return; // Not time yet
      }

      // Generate the task!
      await this.generateTask(recurringTask, easternTime);
    } catch (error) {
      console.error(`❌ Error processing recurring task ${recurringTask.id}:`, error);
    }
  }

  /**
   * Check if recurring task should run on the current day
   */
  shouldRunToday(recurringTask, currentDay) {
    if (recurringTask.recurrence_type === 'daily') {
      return true;
    }

    if (recurringTask.recurrence_type === 'weekly') {
      return currentDay === recurringTask.recurrence_day;
    }

    // TODO: Add monthly support if needed
    return false;
  }

  /**
   * Check if a task was already generated today
   */
  async wasGeneratedToday(recurringTask, easternTime) {
    const startOfDay = new Date(easternTime);
    startOfDay.setHours(0, 0, 0, 0);

    const { data: existingTasks, error } = await supabase
      .from('tasks')
      .select('id, created_at')
      .eq('recurring_task_id', recurringTask.id)
      .gte('created_at', startOfDay.toISOString());

    if (error) {
      console.error('Error checking for existing task:', error);
      return false;
    }

    return existingTasks && existingTasks.length > 0;
  }

  /**
   * Check if current time is past the scheduled time
   */
  isPastScheduledTime(currentTime, scheduledTime) {
    // Convert both to comparable format (HH:MM:SS)
    const current = currentTime.split(':').map(Number);
    const scheduled = scheduledTime.split(':').map(Number);

    const currentMinutes = current[0] * 60 + current[1];
    const scheduledMinutes = scheduled[0] * 60 + scheduled[1];

    return currentMinutes >= scheduledMinutes;
  }

  /**
   * Generate a new task from the recurring template
   */
  async generateTask(recurringTask, easternTime) {
    try {
      console.log(`🎯 Generating task from recurring template: "${recurringTask.title}"`);

      const newTask = {
        title: recurringTask.title,
        description: recurringTask.description,
        project_id: recurringTask.project_id,
        context: recurringTask.context,
        urgency: recurringTask.urgency,
        extra_tags: recurringTask.extra_tags || [],
        icon: recurringTask.icon,
        time_estimate: recurringTask.time_estimate,
        status: 'active', // Goes straight to active list
        auto_detected: true,
        detected_from: 'recurring_scheduler',
        recurring_task_id: recurringTask.id,
        confidence: 1.0, // 100% confidence since it's scheduled
        progress: 0,
        created_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('tasks')
        .insert([newTask])
        .select()
        .single();

      if (error) {
        console.error('❌ Error creating task:', error);
        return;
      }

      console.log(`✅ Task created successfully: ${data.id}`);

      // Update last_generated_at
      const { error: updateError } = await supabase
        .from('recurring_tasks')
        .update({ last_generated_at: new Date().toISOString() })
        .eq('id', recurringTask.id);

      if (updateError) {
        console.error('⚠️  Error updating last_generated_at:', updateError);
      }

      console.log(`📅 Updated last_generated_at for recurring task ${recurringTask.id}`);
    } catch (error) {
      console.error('❌ Error in generateTask:', error);
    }
  }
}

module.exports = new RecurringTasksScheduler();
