/**
 * Quality Control Job
 * Runs QC checks every 6 hours (midnight, 6am, noon, 6pm ET)
 * Detects and fixes data quality issues automatically
 */

const cron = require('node-cron');
const QualityControlService = require('../services/quality-control-service');
const qcConfig = require('../config/qc-config');

// Concurrency protection: Prevent overlapping executions
let isRunning = false;

/**
 * Run QC checks
 */
async function runQualityControl() {
  // Check if another job is already running
  if (isRunning) {
    console.log('⏭️  QC already in progress, skipping this run');
    return { success: false, message: 'Already running' };
  }

  // Check if QC is enabled in config
  if (!qcConfig.schedule.enabled) {
    console.log('⏸️  QC is disabled in config, skipping');
    return { success: false, message: 'QC disabled' };
  }

  isRunning = true;
  console.log('\n🔍 Quality Control job starting...');
  console.log('🔒 Acquired QC lock');

  const startTime = Date.now();

  try {
    // Initialize and run QC service
    const qcService = new QualityControlService(qcConfig);
    const result = await qcService.run();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (result.success) {
      console.log(`✅ QC completed in ${duration}s`);
      console.log(`   Issues detected: ${result.stats.issues_detected}`);
      console.log(`   Issues fixed: ${result.stats.issues_fixed}`);
      console.log(`   Alerts raised: ${result.stats.alerts_raised}`);

      // If issues were detected/fixed, log summary
      if (result.stats.issues_detected > 0) {
        console.log('\n📊 QC Summary:');
        if (result.stats.issues_fixed > 0) {
          console.log(`   ✓ Auto-fixed ${result.stats.issues_fixed} issues`);
        }
        if (result.stats.alerts_raised > 0) {
          console.log(`   ⚠️  ${result.stats.alerts_raised} items need manual review`);
        }
      } else {
        console.log('   🎉 No issues found - data quality is excellent!');
      }

      return {
        success: true,
        stats: result.stats,
        runId: result.runId,
        duration: parseFloat(duration),
      };
    } else {
      console.error('❌ QC run failed:', result.error);
      return {
        success: false,
        error: result.error,
        duration: parseFloat(duration),
      };
    }

  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`❌ QC job error after ${duration}s:`, error);
    return {
      success: false,
      error: error.message,
      duration: parseFloat(duration),
    };

  } finally {
    isRunning = false;
    console.log('🔓 Released QC lock\n');
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

  console.log(`⏰ Quality Control scheduled: ${cronExpression} (${timezone})`);
  console.log(`   Mode: ${qcConfig.schedule.readOnlyMode ? 'Read-Only (Detection)' : 'Auto-Fix Enabled'}`);
  console.log(`   Phase: ${qcConfig.phases.currentPhase}`);

  return schedule;
}

module.exports = {
  runQualityControl,
  scheduleQualityControl,
};
