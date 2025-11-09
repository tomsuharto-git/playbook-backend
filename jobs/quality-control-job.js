/**
 * Quality Control Job
 * Runs QC checks every 6 hours (midnight, 6am, noon, 6pm ET)
 * Detects and fixes data quality issues automatically
 */

const cron = require('node-cron');
const QualityControlService = require('../services/quality-control-service');
const qcConfig = require('../config/qc-config');
const logger = require('../utils/logger').job('quality-control-job');

// Concurrency protection: Prevent overlapping executions
let isRunning = false;

/**
 * Run QC checks
 */
async function runQualityControl() {
  // Check if another job is already running
  if (isRunning) {
    logger.info('⏭️  QC already in progress, skipping this run');
    return { success: false, message: 'Already running' };
  }

  // Check if QC is enabled in config
  if (!qcConfig.schedule.enabled) {
    logger.info('⏸️  QC is disabled in config, skipping');
    return { success: false, message: 'QC disabled' };
  }

  isRunning = true;
  logger.debug('\n🔍 Quality Control job starting...');
  logger.info('🔒 Acquired QC lock');

  const startTime = Date.now();

  try {
    // Initialize and run QC service
    const qcService = new QualityControlService(qcConfig);
    const result = await qcService.run();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (result.success) {
      logger.info('✅ QC completed in s', { duration: duration });
      logger.info('Issues detected:', { issues_detected: result.stats.issues_detected });
      logger.info('Issues fixed:', { issues_fixed: result.stats.issues_fixed });
      logger.info('Alerts raised:', { alerts_raised: result.stats.alerts_raised });

      // If issues were detected/fixed, log summary
      if (result.stats.issues_detected > 0) {
        logger.debug('\n📊 QC Summary:');
        if (result.stats.issues_fixed > 0) {
          logger.info('✓ Auto-fixed  issues', { issues_fixed: result.stats.issues_fixed });
        }
        if (result.stats.alerts_raised > 0) {
          logger.warn('⚠️   items need manual review', { alerts_raised: result.stats.alerts_raised });
        }
      } else {
        logger.info('   🎉 No issues found - data quality is excellent!');
      }

      return {
        success: true,
        stats: result.stats,
        runId: result.runId,
        duration: parseFloat(duration),
      };
    } else {
      logger.error('❌ QC run failed:', { arg0: result.error });
      return {
        success: false,
        error: result.error,
        duration: parseFloat(duration),
      };
    }

  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.error('❌ QC job error after s:', { duration: duration });
    return {
      success: false,
      error: error.message,
      duration: parseFloat(duration),
    };

  } finally {
    isRunning = false;
    logger.info('🔓 Released QC lock\n');
  }
}

/**
 * Schedule QC to run every 6 hours (midnight, 6am, noon, 6pm ET)
 */
function scheduleQualityControl() {
  // Using config cron expression
  const cronExpression = qcConfig.schedule.cron;
  const timezone = qcConfig.schedule.timezone;

  const schedule = cron.schedule(
    cronExpression,
    async () => {
      await runQualityControl();
    },
    {
      scheduled: true,
      timezone: timezone,
    }
  );

  logger.info('⏰ Quality Control scheduled:  ()', { cronExpression: cronExpression, timezone: timezone });
  const mode = qcConfig.schedule.readOnlyMode ? 'Read-Only (Detection)' : 'Auto-Fix Enabled';
  logger.info('Mode:', { mode: mode });
  logger.info('Phase:', { currentPhase: qcConfig.phases.currentPhase });

  return schedule;
}

module.exports = {
  runQualityControl,
  scheduleQualityControl,
};
