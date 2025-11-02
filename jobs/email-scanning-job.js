/**
 * Email Scanning Job
 * Scans Gmail and Outlook for new emails and processes them through central processor
 * Runs every 30 minutes on Railway
 */

const cron = require('node-cron');
const GmailClient = require('../services/gmail-client');
const unifiedEmailHandler = require('../services/unified-email-handler');

// Concurrency protection
let isRunning = false;

/**
 * Scan Gmail for recent emails
 */
async function scanGmail() {
  const gmailClient = new GmailClient();

  try {
    console.log('📧 Scanning Gmail...');

    // Search for emails from last 2 hours (to avoid reprocessing everything on each scan)
    // Gmail query: newer_than:2h (emails from last 2 hours)
    const emails = await gmailClient.search('newer_than:2h', 50);

    console.log(`   Found ${emails.length} recent Gmail messages`);

    let processed = 0;
    let skipped = 0;

    for (const email of emails) {
      const result = await unifiedEmailHandler.processEmail(email, 'gmail');

      if (result.skipped) {
        skipped++;
      } else if (result.success) {
        processed++;
        console.log(`   ✅ Processed: ${email.subject}`);
      }
    }

    return {
      source: 'gmail',
      found: emails.length,
      processed,
      skipped
    };

  } catch (error) {
    console.error('❌ Gmail scanning error:', error.message);
    return {
      source: 'gmail',
      error: error.message
    };
  }
}

/**
 * Scan Outlook emails from Google Drive
 */
async function scanOutlook() {
  try {
    console.log('📧 Scanning Outlook (via Drive)...');

    // For Outlook, we're reading from the Google Drive JSON file
    // This is a snapshot approach - we need to check when it was last updated
    // and track which emails we've already processed

    // TODO: Implement Outlook email scanning
    // For now, we'll skip this since Outlook is primarily used for calendar

    console.log('   ⏭️  Outlook email scanning not yet implemented (calendar works)');

    return {
      source: 'outlook',
      skipped: true,
      reason: 'not_implemented'
    };

  } catch (error) {
    console.error('❌ Outlook scanning error:', error.message);
    return {
      source: 'outlook',
      error: error.message
    };
  }
}

/**
 * Run email scanning
 */
async function runEmailScanning() {
  // Check if another job is already running
  if (isRunning) {
    console.log('⏭️  Email scanning already in progress, skipping this run');
    return { success: false, message: 'Already running' };
  }

  isRunning = true;
  console.log('\n🔍 Email Scanning job starting...');
  console.log('🔒 Acquired email scanning lock');

  const startTime = Date.now();
  const results = {
    gmail: null,
    outlook: null
  };

  try {
    // Scan Gmail
    results.gmail = await scanGmail();

    // Scan Outlook (currently skipped)
    results.outlook = await scanOutlook();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Summary
    console.log(`\n✅ Email scanning completed in ${duration}s`);
    console.log(`   Gmail: ${results.gmail.processed || 0} processed, ${results.gmail.skipped || 0} skipped`);

    return {
      success: true,
      results,
      duration: parseFloat(duration)
    };

  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`❌ Email scanning error after ${duration}s:`, error);
    return {
      success: false,
      error: error.message,
      duration: parseFloat(duration)
    };

  } finally {
    isRunning = false;
    console.log('🔓 Released email scanning lock\n');
  }
}

/**
 * Schedule email scanning to run every 30 minutes
 */
function scheduleEmailScanning() {
  // Run every 30 minutes
  const cronExpression = '*/30 * * * *';
  const timezone = 'America/New_York';

  const schedule = cron.schedule(
    cronExpression,
    async () => {
      await runEmailScanning();
    },
    {
      scheduled: true,
      timezone: timezone,
    }
  );

  console.log(`⏰ Email scanning scheduled: Every 30 minutes (${timezone})`);

  return schedule;
}

module.exports = {
  runEmailScanning,
  scheduleEmailScanning,
};
