const express = require('express');
const router = express.Router();
const { processEmailData } = require('../services/data-processor');
const { generateBriefings } = require('../jobs/generate-briefings');
const OneDriveClient = require('../services/onedrive-client');
const logger = require('../utils/logger').route('webhook');

const onedrive = new OneDriveClient();

// Calendar webhook
// Power Automate sends calendar file to OneDrive, then triggers this webhook
router.post('/calendar-ready', async (req, res) => {
  try {
    const { date, shareLink } = req.body;
    logger.info('📅 [WEBHOOK] Calendar data ready for', { date: date });
    logger.info('Share link:', { shareLink: shareLink });

    // IMPORTANT: Do NOT process calendar data directly here!
    // The Power Automate flow has already saved the file to Google Drive.
    // Instead, trigger the main briefing generation job which will:
    // 1. Fetch from Google Drive (the file PA just uploaded)
    // 2. Normalize events properly
    // 3. Enrich with projects and contacts
    // 4. Generate AI briefings
    // 5. Save to database with full enrichment

    logger.info('   ⏭️  Skipping direct processing (file already in Google Drive)');
    logger.info('   🔄 Triggering main briefing generation job...');

    // Trigger briefing generation asynchronously
    // Don't await - let it run in background
    generateBriefings().catch(err => {
      logger.error('   ❌ Briefing generation failed:', { arg0: err });
    });

    logger.info('✅ Webhook acknowledged, briefing generation triggered');
    res.json({
      status: 'success',
      message: 'Calendar webhook received, briefing generation triggered',
      note: 'File will be processed by main briefing job from Google Drive'
    });
  } catch (error) {
    logger.error('❌ Calendar webhook error:', { arg0: error });
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Email webhook
router.post('/emails-ready', async (req, res) => {
  try {
    const { date, shareLink } = req.body;
    logger.info('📧 Email data ready for', { date: date });

    // Download from OneDrive share link
    const fileContent = await onedrive.downloadFile(shareLink);

    // Process emails (emails don't go through briefing generation)
    await processEmailData(fileContent, date);

    logger.info('✅ Emails processed');
    res.json({ status: 'success', message: 'Email data processed' });
  } catch (error) {
    logger.error('❌ Email webhook error:', { arg0: error });
    res.status(500).json({ status: 'error', message: error.message });
  }
});

module.exports = router;
