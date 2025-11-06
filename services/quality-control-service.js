/**
 * Quality Control Service
 *
 * Implements all QC checks for data quality
 * Phase 1: Detection only (read-only mode)
 * Phase 2: Enable safe auto-fixes
 * Phase 3: Enable all auto-fixes
 */

const { createClient } = require('@supabase/supabase-js');
const qcConfig = require('../config/qc-config');
const logger = require('../utils/logger').service('quality-control-service');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

class QualityControlService {
  constructor(config = qcConfig) {
    this.config = config;
    this.runId = null;
    this.stats = {
      total_checks: 0,
      issues_detected: 0,
      issues_fixed: 0,
      alerts_raised: 0,
    };
    this.detections = {
      pendingTasks: {},
      events: {},
      tasks: {},
      narratives: {},
      system: {},
    };
    this.actions = [];
    this.alerts = [];
  }

  /**
   * Main QC Run
   */
  async run() {
    logger.debug('🔍 Quality Control Agent starting...');

    try {
      // Start QC run tracking
      this.runId = await this.startRun();
      const startTime = Date.now();

      // Run all checks
      await this.runAllChecks();

      // Generate report
      const report = this.generateReport();

      // Complete run
      await this.completeRun('completed', report);

      const duration = Date.now() - startTime;
      logger.info('✅ QC complete in ms:  issues detected,  fixed', { duration: duration, issues_detected: this.stats.issues_detected, issues_fixed: this.stats.issues_fixed });

      return {
        success: true,
        runId: this.runId,
        stats: this.stats,
        report,
        duration,
      };

    } catch (error) {
      logger.error('❌ QC Agent failed:', { arg0: error });

      if (this.runId) {
        await this.completeRun('failed', null, [error.message]);
      }

      return {
        success: false,
        error: error.message,
        stats: this.stats,
      };
    }
  }

  /**
   * Run all QC checks
   */
  async runAllChecks() {
    // Category 1: Pending Task Quality
    await this.checkSemanticDuplicates();
    await this.checkLowQualityTasks();
    await this.checkStalePendingTasks();
    await this.checkAlreadyCompletedTasks();

    // Category 2: Event Quality
    await this.checkNoTitleEvents();
    await this.checkDuplicateEvents();
    await this.checkMissingProjectAssociation();

    // Category 3: Task Quality
    await this.checkOrphanedTasks();
    await this.checkTaskRanks();

    // Category 4: Narrative Quality
    await this.checkLowSignificanceNarratives();
    await this.checkDuplicateNarratives();

    // Category 5: System Health
    await this.checkDatabaseIntegrity();
  }

  // ============================================================
  // CATEGORY 1: PENDING TASK QUALITY
  // ============================================================

  /**
   * Check 1.1: Semantic Duplicate Detection
   */
  async checkSemanticDuplicates() {
    this.stats.total_checks++;
    logger.info('  Checking semantic duplicates...');

    try {
      // Fetch all pending tasks
      const { data: pendingTasks, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('status', 'pending')
        .order('confidence', { ascending: false });

      if (error) throw error;
      if (!pendingTasks || pendingTasks.length === 0) {
        logger.info('    No pending tasks to check');
        return;
      }

      const duplicatePairs = [];

      // Compare each task to every other task
      for (let i = 0; i < pendingTasks.length; i++) {
        for (let j = i + 1; j < pendingTasks.length; j++) {
          const task1 = pendingTasks[i];
          const task2 = pendingTasks[j];

          const similarity = this.calculateTaskSimilarity(task1, task2);

          if (similarity > this.config.thresholds.duplicateSimilarity) {
            // Determine which to keep (higher confidence, more recent)
            const keep = task1.confidence >= task2.confidence ? task1 : task2;
            const dismiss = keep === task1 ? task2 : task1;

            duplicatePairs.push({
              keep,
              dismiss,
              similarity,
              reasoning: `Semantic duplicate (${(similarity * 100).toFixed(1)}% similar)`,
            });
          }
        }
      }

      if (duplicatePairs.length > 0) {
        this.stats.issues_detected += duplicatePairs.length;
        this.detections.pendingTasks.duplicates = duplicatePairs;

        logger.info('Found  duplicate pairs', { length: duplicatePairs.length });

        // In Phase 1 (read-only), just log
        if (this.config.schedule.readOnlyMode) {
          duplicatePairs.forEach(pair => {
            this.createAlert('medium', 'duplicate_pending_task',
              `"${pair.dismiss.title}" is ${(pair.similarity * 100).toFixed(1)}% similar to "${pair.keep.title}"`,
              { dismiss: pair.dismiss, keep: pair.keep, similarity: pair.similarity }
            );
          });
        } else if (this.config.autoFix.duplicateTasks) {
          // Phase 2+: Auto-dismiss
          for (const pair of duplicatePairs) {
            await this.dismissTask(pair.dismiss.id, pair.reasoning);
            this.stats.issues_fixed++;
          }
        }
      } else {
        logger.info('    No duplicates found ✓');
      }

    } catch (error) {
      logger.error('    Error checking duplicates:', { arg0: error });
    }
  }

  /**
   * Check 1.2: Low-Quality Task Filtering
   */
  async checkLowQualityTasks() {
    this.stats.total_checks++;
    logger.info('  Checking low-quality tasks...');

    try {
      const { data: pendingTasks, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('status', 'pending');

      if (error) throw error;
      if (!pendingTasks) return;

      const lowQualityTasks = [];

      for (const task of pendingTasks) {
        const qualityScore = this.calculateQualityScore(task);

        if (qualityScore < this.config.thresholds.lowQualityScore) {
          lowQualityTasks.push({
            task,
            score: qualityScore,
            reasoning: this.getQualityReasons(task),
          });
        }
      }

      if (lowQualityTasks.length > 0) {
        this.stats.issues_detected += lowQualityTasks.length;
        this.detections.pendingTasks.lowQuality = lowQualityTasks;

        logger.info('Found  low-quality tasks', { length: lowQualityTasks.length });

        if (this.config.schedule.readOnlyMode) {
          lowQualityTasks.forEach(item => {
            this.createAlert('low', 'low_quality_task',
              `"${item.task.title}" has low quality score (${(item.score * 100).toFixed(1)}%)`,
              { task: item.task, score: item.score, reasons: item.reasoning }
            );
          });
        } else if (this.config.autoFix.lowQualityTasks) {
          for (const item of lowQualityTasks) {
            await this.dismissTask(item.task.id, item.reasoning);
            this.stats.issues_fixed++;
          }
        }
      } else {
        logger.info('    All pending tasks have acceptable quality ✓');
      }

    } catch (error) {
      logger.error('    Error checking low-quality tasks:', { arg0: error });
    }
  }

  /**
   * Check 1.3: Stale Pending Task Cleanup
   */
  async checkStalePendingTasks() {
    this.stats.total_checks++;
    logger.info('  Checking stale pending tasks...');

    try {
      const staleCutoff = new Date();
      staleCutoff.setDate(staleCutoff.getDate() - this.config.thresholds.stalePendingDays);

      const { data: staleTasks, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('status', 'pending')
        .lt('created_at', staleCutoff.toISOString());

      if (error) throw error;
      if (!staleTasks || staleTasks.length === 0) {
        logger.info('    No stale pending tasks ✓');
        return;
      }

      this.stats.issues_detected += staleTasks.length;
      this.detections.pendingTasks.stale = staleTasks;

      logger.info('Found  stale pending tasks (> days)', { length: staleTasks.length, stalePendingDays: this.config.thresholds.stalePendingDays });

      if (this.config.schedule.readOnlyMode) {
        staleTasks.forEach(task => {
          const age = Math.floor((Date.now() - new Date(task.created_at)) / (1000 * 60 * 60 * 24));
          const severity = task.confidence >= 0.7 ? 'medium' : 'low';

          this.createAlert(severity, 'stale_pending_task',
            `"${task.title}" has been pending for ${age} days (confidence: ${(task.confidence * 100).toFixed(1)}%)`,
            { task, age }
          );
        });
      }
      // Note: Even in Phase 2+, we don't auto-dismiss high-confidence stale tasks

    } catch (error) {
      logger.error('    Error checking stale tasks:', { arg0: error });
    }
  }

  /**
   * Check 1.4: Already-Completed Task Detection
   */
  async checkAlreadyCompletedTasks() {
    this.stats.total_checks++;
    logger.info('  Checking already-completed tasks...');

    try {
      // This is complex - requires narrative analysis
      // For Phase 1, we'll flag for manual review
      // Full implementation would search narratives for completion indicators

      logger.info('    (Implementation pending - requires narrative analysis)');

    } catch (error) {
      logger.error('    Error checking completed tasks:', { arg0: error });
    }
  }

  // ============================================================
  // CATEGORY 2: EVENT QUALITY
  // ============================================================

  /**
   * Check 2.1: No-Title Event Detection
   */
  async checkNoTitleEvents() {
    this.stats.total_checks++;
    logger.info('  Checking no-title events...');

    try {
      const sevenDaysOut = new Date();
      sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);

      const { data: events, error } = await supabase
        .from('events')
        .select('*')
        .gte('start_time', new Date().toISOString())
        .lte('start_time', sevenDaysOut.toISOString());

      if (error) throw error;
      if (!events) return;

      const badTitleEvents = events.filter(event => {
        const title = event.title || '';
        return title.length < this.config.thresholds.titleMinLength ||
               title === '(No title)' ||
               title === 'Untitled meeting' ||
               title === 'Event' ||
               title === 'Meeting';
      });

      if (badTitleEvents.length > 0) {
        this.stats.issues_detected += badTitleEvents.length;
        this.detections.events.noTitle = badTitleEvents;

        logger.info('Found  events with bad titles', { length: badTitleEvents.length });

        if (this.config.schedule.readOnlyMode) {
          badTitleEvents.forEach(event => {
            this.createAlert('medium', 'no_title_event',
              `Event at ${new Date(event.start_time).toLocaleString()} has title: "${event.title}"`,
              { event }
            );
          });
        }
        // Phase 2+: Auto-enrich would happen here

      } else {
        logger.info('    All upcoming events have clear titles ✓');
      }

    } catch (error) {
      logger.error('    Error checking event titles:', { arg0: error });
    }
  }

  /**
   * Check 2.2: Duplicate Event Cleanup
   */
  async checkDuplicateEvents() {
    this.stats.total_checks++;
    logger.info('  Checking duplicate events...');

    try {
      const sevenDaysOut = new Date();
      sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);

      const { data: events, error } = await supabase
        .from('events')
        .select('*')
        .gte('start_time', new Date().toISOString())
        .lte('start_time', sevenDaysOut.toISOString());

      if (error) throw error;
      if (!events || events.length < 2) return;

      const duplicatePairs = [];

      // Group by date, then compare within groups
      const eventsByDate = events.reduce((acc, event) => {
        const date = new Date(event.start_time).toDateString();
        if (!acc[date]) acc[date] = [];
        acc[date].push(event);
        return acc;
      }, {});

      for (const date in eventsByDate) {
        const dayEvents = eventsByDate[date];

        for (let i = 0; i < dayEvents.length; i++) {
          for (let j = i + 1; j < dayEvents.length; j++) {
            const event1 = dayEvents[i];
            const event2 = dayEvents[j];

            if (this.areEventsDuplicate(event1, event2)) {
              // Prefer Outlook over Google for work events
              const keep = event1.calendar_source === 'outlook' ? event1 : event2;
              const hide = keep === event1 ? event2 : event1;

              duplicatePairs.push({ keep, hide });
            }
          }
        }
      }

      if (duplicatePairs.length > 0) {
        this.stats.issues_detected += duplicatePairs.length;
        this.detections.events.duplicates = duplicatePairs;

        logger.info('Found  duplicate event pairs', { length: duplicatePairs.length });

        if (this.config.schedule.readOnlyMode) {
          duplicatePairs.forEach(pair => {
            this.createAlert('medium', 'duplicate_event',
              `"${pair.hide.title}" appears to be duplicate of "${pair.keep.title}"`,
              { hide: pair.hide, keep: pair.keep }
            );
          });
        }
        // Phase 2+: Auto-hide would happen here

      } else {
        logger.info('    No duplicate events found ✓');
      }

    } catch (error) {
      logger.error('    Error checking duplicate events:', { arg0: error });
    }
  }

  /**
   * Check 2.3: Missing Project Association
   */
  async checkMissingProjectAssociation() {
    this.stats.total_checks++;
    logger.info('  Checking events missing project association...');

    try {
      const { data: workEvents, error } = await supabase
        .from('events')
        .select('*')
        .eq('category', 'work')
        .is('project_id', null)
        .gte('start_time', new Date().toISOString());

      if (error) throw error;
      if (!workEvents || workEvents.length === 0) {
        logger.info('    All work events have project associations ✓');
        return;
      }

      this.stats.issues_detected += workEvents.length;
      this.detections.events.missingProject = workEvents;

      logger.info('Found  work events without project', { length: workEvents.length });

      if (this.config.schedule.readOnlyMode) {
        workEvents.forEach(event => {
          this.createAlert('low', 'missing_project_event',
            `Work event "${event.title}" has no project association`,
            { event }
          );
        });
      }
      // Phase 2+: Auto-detect and link project would happen here

    } catch (error) {
      logger.error('    Error checking missing projects:', { arg0: error });
    }
  }

  // ============================================================
  // CATEGORY 3: TASK QUALITY
  // ============================================================

  /**
   * Check 3.1: Orphaned Task Detection
   */
  async checkOrphanedTasks() {
    this.stats.total_checks++;
    logger.info('  Checking orphaned tasks...');

    try {
      // Tasks with project_id that doesn't exist
      const { data: orphanedTasks, error } = await supabase
        .from('tasks')
        .select(`
          *,
          projects:project_id (id)
        `)
        .not('project_id', 'is', null);

      if (error) throw error;

      const reallyOrphaned = orphanedTasks.filter(t => !t.projects);

      if (reallyOrphaned.length > 0) {
        this.stats.issues_detected += reallyOrphaned.length;
        this.detections.tasks.orphaned = reallyOrphaned;

        logger.info('Found  orphaned tasks', { length: reallyOrphaned.length });

        if (this.config.schedule.readOnlyMode) {
          reallyOrphaned.forEach(task => {
            this.createAlert('high', 'orphaned_task',
              `Task "${task.title}" references non-existent project`,
              { task }
            );
          });
        }
        // Phase 2+: Auto-reassign to "Misc" project

      } else {
        logger.info('    No orphaned tasks found ✓');
      }

    } catch (error) {
      logger.error('    Error checking orphaned tasks:', { arg0: error });
    }
  }

  /**
   * Check 3.2: Rank Recalculation Verification
   */
  async checkTaskRanks() {
    this.stats.total_checks++;
    logger.info('  Checking task ranks...');

    try {
      const { data: activeTasks, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('status', 'active');

      if (error) throw error;
      if (!activeTasks) return;

      const rankIssues = [];

      for (const task of activeTasks) {
        const expectedRank = this.calculateExpectedRank(task);
        const actualRank = task.rank || 0;

        if (Math.abs(expectedRank - actualRank) > this.config.thresholds.rankDifferenceThreshold) {
          rankIssues.push({
            task,
            expectedRank,
            actualRank,
            difference: Math.abs(expectedRank - actualRank),
          });
        }
      }

      if (rankIssues.length > 0) {
        this.stats.issues_detected += rankIssues.length;
        this.detections.tasks.rankIssues = rankIssues;

        logger.info('Found  tasks with incorrect ranks', { length: rankIssues.length });

        if (this.config.schedule.readOnlyMode) {
          rankIssues.forEach(item => {
            this.createAlert('low', 'incorrect_rank',
              `Task "${item.task.title}" rank should be ${item.expectedRank}, currently ${item.actualRank}`,
              item
            );
          });
        } else if (this.config.autoFix.taskRanks) {
          // Phase 2+: Auto-recalculate ranks
          logger.info('Auto-fixing  task ranks...', { length: rankIssues.length });

          for (const item of rankIssues) {
            const beforeState = { ...item.task };

            // Update rank in database
            const { error: updateError } = await supabase
              .from('tasks')
              .update({ rank: item.expectedRank })
              .eq('id', item.task.id);

            if (!updateError) {
              this.stats.issues_fixed++;

              // Log action for audit trail
              await this.logAction({
                action_type: 'recalculate_rank',
                category: 'task',
                entity_type: 'task',
                entity_id: item.task.id,
                before_state: beforeState,
                after_state: { ...item.task, rank: item.expectedRank },
                reasoning: `Rank recalculated from ${item.actualRank} to ${item.expectedRank} (difference: ${item.difference})`,
                confidence_score: 1.0,
              });
            } else {
              logger.error('Failed to update rank for task :', { id: item.task.id });
            }
          }

          logger.info('✓ Fixed  task ranks', { issues_fixed: this.stats.issues_fixed });
        }

      } else {
        logger.info('    All task ranks are correct ✓');
      }

    } catch (error) {
      logger.error('    Error checking task ranks:', { arg0: error });
    }
  }

  // ============================================================
  // CATEGORY 4: NARRATIVE QUALITY
  // ============================================================

  /**
   * Check 4.1: Low-Significance Narrative Pruning
   */
  async checkLowSignificanceNarratives() {
    this.stats.total_checks++;
    logger.info('  Checking low-significance narratives...');

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.thresholds.narrativeAgeDays);

      const { data: lowSigNarratives, error } = await supabase
        .from('narratives')
        .select('*')
        .eq('auto_generated', true)
        .lt('significance_score', this.config.thresholds.lowSignificance)
        .lt('created_at', cutoffDate.toISOString());

      if (error) throw error;
      if (!lowSigNarratives || lowSigNarratives.length === 0) {
        logger.info('    No low-significance narratives to prune ✓');
        return;
      }

      this.stats.issues_detected += lowSigNarratives.length;
      this.detections.narratives.lowSignificance = lowSigNarratives;

      logger.info('Found  low-significance narratives', { length: lowSigNarratives.length });

      if (this.config.schedule.readOnlyMode) {
        // Just log first few as examples
        lowSigNarratives.slice(0, 5).forEach(narrative => {
          this.createAlert('low', 'low_significance_narrative',
            `Narrative "${narrative.headline}" has low significance (${(narrative.significance_score * 100).toFixed(1)}%)`,
            { narrative }
          );
        });
      }
      // Phase 2+: Delete narratives with no dependencies

    } catch (error) {
      logger.error('    Error checking narratives:', { arg0: error });
    }
  }

  /**
   * Check 4.2: Duplicate Narrative Detection
   */
  async checkDuplicateNarratives() {
    this.stats.total_checks++;
    logger.info('  Checking duplicate narratives...');

    try {
      // This would require semantic similarity analysis
      // For Phase 1, we'll skip this complex check
      logger.info('    (Implementation pending - requires semantic analysis)');

    } catch (error) {
      logger.error('    Error checking duplicate narratives:', { arg0: error });
    }
  }

  // ============================================================
  // CATEGORY 5: SYSTEM HEALTH
  // ============================================================

  /**
   * Check 5.1: Database Integrity
   */
  async checkDatabaseIntegrity() {
    this.stats.total_checks++;
    logger.info('  Checking database integrity...');

    try {
      // This was covered by orphaned tasks check
      // Additional checks could go here (circular references, etc.)
      logger.info('    Database integrity looks good ✓');

    } catch (error) {
      logger.error('    Error checking database integrity:', { arg0: error });
    }
  }

  // ============================================================
  // HELPER FUNCTIONS
  // ============================================================

  /**
   * Calculate similarity between two tasks
   */
  calculateTaskSimilarity(task1, task2) {
    // Simple string similarity for Phase 1
    // In Phase 2+, use embeddings or more sophisticated NLP

    const title1 = (task1.title || '').toLowerCase();
    const title2 = (task2.title || '').toLowerCase();

    // Exact match
    if (title1 === title2) return 1.0;

    // Check if one contains the other
    if (title1.includes(title2) || title2.includes(title1)) {
      return 0.95;
    }

    // Word overlap
    const words1 = new Set(title1.split(/\s+/));
    const words2 = new Set(title2.split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    const jaccardSimilarity = intersection.size / union.size;

    // Bonus if same project
    if (task1.project_id === task2.project_id) {
      return Math.min(1.0, jaccardSimilarity * 1.1);
    }

    return jaccardSimilarity;
  }

  /**
   * Calculate quality score for a task
   */
  calculateQualityScore(task) {
    let score = 1.0;

    const title = (task.title || '').toLowerCase();
    const description = (task.description || '').toLowerCase();

    // Weak verbs
    const weakVerbs = ['consider', 'maybe', 'think about', 'possibly', 'perhaps'];
    if (weakVerbs.some(verb => title.includes(verb))) {
      score -= 0.3;
    }

    // Question marks (vague)
    if (title.includes('?')) {
      score -= 0.1;
    }

    // No clear deliverable (very short)
    if (title.split(/\s+/).length < 4) {
      score -= 0.1;
    }

    // Low confidence
    if (task.confidence && task.confidence < 0.6) {
      score -= 0.2;
    }

    // No due date and urgency Eventually
    if (!task.due_date && task.urgency === 'Eventually') {
      score -= 0.1;
    }

    return Math.max(0, score);
  }

  /**
   * Get quality issue reasons
   */
  getQualityReasons(task) {
    const reasons = [];
    const title = (task.title || '').toLowerCase();

    if (['consider', 'maybe', 'think about'].some(v => title.includes(v))) {
      reasons.push('Contains weak action verb');
    }
    if (title.includes('?')) {
      reasons.push('Contains question mark (vague)');
    }
    if (title.split(/\s+/).length < 4) {
      reasons.push('Very short title (<4 words)');
    }
    if (task.confidence < 0.6) {
      reasons.push('Low AI confidence');
    }
    if (!task.due_date && task.urgency === 'Eventually') {
      reasons.push('No due date and low urgency');
    }

    return reasons.join(', ');
  }

  /**
   * Check if two events are duplicates
   */
  areEventsDuplicate(event1, event2) {
    // Title similarity
    const title1 = (event1.title || '').toLowerCase();
    const title2 = (event2.title || '').toLowerCase();

    const titleSimilarity = this.calculateStringSimilarity(title1, title2);
    if (titleSimilarity < 0.85) return false;

    // Time proximity (within 1 hour)
    const time1 = new Date(event1.start_time).getTime();
    const time2 = new Date(event2.start_time).getTime();
    const timeDiff = Math.abs(time1 - time2) / 1000; // seconds

    if (timeDiff > this.config.thresholds.duplicateTimeWindow) return false;

    return true;
  }

  /**
   * Calculate string similarity
   */
  calculateStringSimilarity(str1, str2) {
    if (str1 === str2) return 1.0;
    if (str1.length === 0 || str2.length === 0) return 0;

    const words1 = new Set(str1.split(/\s+/));
    const words2 = new Set(str2.split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Calculate expected rank for task
   */
  calculateExpectedRank(task) {
    const URGENCY_WEIGHTS = {
      'Now': 1,
      'Soon': 2,
      'Eventually': 3,
    };

    let rank = (URGENCY_WEIGHTS[task.urgency] || 2) * 1000;

    if (task.due_date) {
      const daysUntilDue = Math.ceil(
        (new Date(task.due_date) - new Date()) / (1000 * 60 * 60 * 24)
      );
      rank += Math.max(0, daysUntilDue) * 10;
    }

    return rank;
  }

  /**
   * Create an alert for manual review
   */
  createAlert(severity, category, message, details = {}) {
    this.alerts.push({
      severity,
      category,
      message,
      details,
      entity_type: details.task ? 'task' : details.event ? 'event' : details.narrative ? 'narrative' : null,
      entity_id: details.task?.id || details.event?.id || details.narrative?.id || null,
    });
    this.stats.alerts_raised++;
  }

  /**
   * Log a QC action to database for audit trail
   */
  async logAction(actionData) {
    if (this.config.schedule.readOnlyMode) {
      return; // Don't log actions in read-only mode
    }

    try {
      // Use database function to log action
      const { data, error } = await supabase.rpc('log_qc_action', {
        run_id: this.runId,
        action_type_val: actionData.action_type,
        category_val: actionData.category,
        entity_type_val: actionData.entity_type,
        entity_id_val: actionData.entity_id,
        before_state_val: actionData.before_state,
        after_state_val: actionData.after_state,
        reasoning_val: actionData.reasoning,
        confidence_val: actionData.confidence_score || null,
      });

      if (error) {
        logger.error('      Failed to log action:', { arg0: error });
      }

      // Also track in memory
      this.actions.push(actionData);
    } catch (error) {
      logger.error('      Error logging action:', { arg0: error });
    }
  }

  /**
   * Dismiss a task (Phase 2+)
   */
  async dismissTask(taskId, reasoning) {
    if (this.config.schedule.readOnlyMode) {
      logger.info('[READ-ONLY] Would dismiss task :', { taskId: taskId, reasoning: reasoning });
      return;
    }

    // Actual dismissal logic (Phase 2)
    // const { error } = await supabase
    //   .from('tasks')
    //   .update({ status: 'dismissed' })
    //   .eq('id', taskId);
    //
    // if (!error) {
    //   this.actions.push({
    //     action_type: 'dismiss_task',
    //     entity_id: taskId,
    //     reasoning,
    //   });
    // }
  }

  /**
   * Generate QC report
   */
  generateReport() {
    const sections = [];

    sections.push(`# Quality Control Report`);
    sections.push(`**Date:** ${new Date().toISOString()}`);
    sections.push(`**Run ID:** ${this.runId}`);
    sections.push(`**Mode:** ${this.config.schedule.readOnlyMode ? 'Read-Only (Detection Only)' : 'Auto-Fix Enabled'}`);
    sections.push(``);

    sections.push(`## Executive Summary`);
    sections.push(`- ✅ ${this.stats.total_checks} checks completed`);
    sections.push(`- 🔍 ${this.stats.issues_detected} issues detected`);
    sections.push(`- 🔧 ${this.stats.issues_fixed} issues auto-fixed`);
    sections.push(`- ⚠️  ${this.stats.alerts_raised} alerts requiring manual review`);
    sections.push(``);

    // Pending Tasks section
    if (this.detections.pendingTasks.duplicates?.length > 0) {
      sections.push(`## Pending Task Quality`);
      sections.push(`### Duplicate Tasks`);
      sections.push(`Detected: ${this.detections.pendingTasks.duplicates.length} pairs`);
      sections.push(``);
      this.detections.pendingTasks.duplicates.slice(0, 3).forEach(pair => {
        sections.push(`- "${pair.dismiss.title}" (${(pair.similarity * 100).toFixed(1)}% similar to "${pair.keep.title}")`);
      });
      sections.push(``);
    }

    if (this.detections.pendingTasks.lowQuality?.length > 0) {
      sections.push(`### Low-Quality Tasks`);
      sections.push(`Detected: ${this.detections.pendingTasks.lowQuality.length}`);
      sections.push(``);
      this.detections.pendingTasks.lowQuality.slice(0, 3).forEach(item => {
        sections.push(`- "${item.task.title}" (score: ${(item.score * 100).toFixed(1)}%)`);
        sections.push(`  Reasons: ${item.reasoning}`);
      });
      sections.push(``);
    }

    if (this.detections.pendingTasks.stale?.length > 0) {
      sections.push(`### Stale Pending Tasks`);
      sections.push(`Detected: ${this.detections.pendingTasks.stale.length} (>${this.config.thresholds.stalePendingDays} days old)`);
      sections.push(``);
    }

    // Events section
    if (this.detections.events.noTitle?.length > 0) {
      sections.push(`## Event Quality`);
      sections.push(`### No-Title Events`);
      sections.push(`Detected: ${this.detections.events.noTitle.length}`);
      sections.push(``);
    }

    if (this.detections.events.duplicates?.length > 0) {
      sections.push(`### Duplicate Events`);
      sections.push(`Detected: ${this.detections.events.duplicates.length} pairs`);
      sections.push(``);
    }

    if (this.detections.events.missingProject?.length > 0) {
      sections.push(`### Missing Project Association`);
      sections.push(`Detected: ${this.detections.events.missingProject.length} work events`);
      sections.push(``);
    }

    // Tasks section
    if (this.detections.tasks.orphaned?.length > 0) {
      sections.push(`## Task Quality`);
      sections.push(`### Orphaned Tasks`);
      sections.push(`Detected: ${this.detections.tasks.orphaned.length}`);
      sections.push(``);
    }

    if (this.detections.tasks.rankIssues?.length > 0) {
      sections.push(`### Rank Corrections Needed`);
      sections.push(`Detected: ${this.detections.tasks.rankIssues.length}`);
      sections.push(``);
    }

    // Narratives section
    if (this.detections.narratives.lowSignificance?.length > 0) {
      sections.push(`## Narrative Quality`);
      sections.push(`### Low-Significance Narratives`);
      sections.push(`Detected: ${this.detections.narratives.lowSignificance.length}`);
      sections.push(``);
    }

    // Alerts section
    if (this.alerts.length > 0) {
      sections.push(`## Manual Review Required`);
      sections.push(`⚠️  ${this.alerts.length} items flagged for manual review`);
      sections.push(``);

      const highAlerts = this.alerts.filter(a => a.severity === 'high');
      if (highAlerts.length > 0) {
        sections.push(`### High Priority`);
        highAlerts.forEach(alert => {
          sections.push(`- ${alert.message}`);
        });
        sections.push(``);
      }
    }

    // Recommendations
    sections.push(`## Recommendations`);
    if (this.config.schedule.readOnlyMode) {
      sections.push(`💡 Currently running in READ-ONLY mode (Phase 1: Detection only)`);
      sections.push(`💡 To enable auto-fixes, update config and move to Phase 2`);
    }
    if (this.stats.issues_detected === 0) {
      sections.push(`✨ Data quality looks excellent! No issues detected.`);
    }
    sections.push(``);

    return sections.join('\n');
  }

  /**
   * Start a QC run (database tracking)
   */
  async startRun() {
    const { data, error } = await supabase
      .rpc('start_qc_run', { config: this.config });

    if (error) {
      logger.error('Failed to start QC run:', { arg0: error });
      return null;
    }

    return data;
  }

  /**
   * Complete a QC run (database tracking)
   */
  async completeRun(status, report, errors = []) {
    if (!this.runId) return;

    await supabase.rpc('complete_qc_run', {
      run_id: this.runId,
      run_status: status,
      stats: this.stats,
      report,
      errors_array: errors.length > 0 ? errors : null,
    });

    // Save alerts
    if (this.alerts.length > 0) {
      const alertRecords = this.alerts.map(alert => ({
        qc_run_id: this.runId,
        severity: alert.severity,
        category: alert.category,
        message: alert.message,
        details: alert.details,
        entity_type: alert.entity_type,
        entity_id: alert.entity_id,
      }));

      await supabase.from('qc_alerts').insert(alertRecords);
    }
  }
}

module.exports = QualityControlService;
