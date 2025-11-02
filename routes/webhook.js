const express = require('express');
const router = express.Router();
const { processEmailData } = require('../services/data-processor');
const { generateBriefings } = require('../jobs/generate-briefings');
const OneDriveClient = require('../services/onedrive-client');

const onedrive = new OneDriveClient();

// Calendar webhook
// Power Automate sends calendar file to OneDrive, then triggers this webhook
router.post('/calendar-ready', async (req, res) => {
  try {
    const { date, shareLink } = req.body;
    console.log(`📅 [WEBHOOK] Calendar data ready for ${date}`);
    console.log(`   Share link: ${shareLink}`);

    // IMPORTANT: Do NOT process calendar data directly here!
    // The Power Automate flow has already saved the file to Google Drive.
    // Instead, trigger the main briefing generation job which will:
    // 1. Fetch from Google Drive (the file PA just uploaded)
    // 2. Normalize events properly
    // 3. Enrich with projects and contacts
    // 4. Generate AI briefings
    // 5. Save to database with full enrichment

    console.log('   ⏭️  Skipping direct processing (file already in Google Drive)');
    console.log('   🔄 Triggering main briefing generation job...');

    // Trigger briefing generation asynchronously
    // Don't await - let it run in background
    generateBriefings().catch(err => {
      console.error('   ❌ Briefing generation failed:', err);
    });

    console.log('✅ Webhook acknowledged, briefing generation triggered');
    res.json({
      status: 'success',
      message: 'Calendar webhook received, briefing generation triggered',
      note: 'File will be processed by main briefing job from Google Drive'
    });
  } catch (error) {
    console.error('❌ Calendar webhook error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Email webhook
router.post('/emails-ready', async (req, res) => {
  try {
    const { date, shareLink } = req.body;
    console.log(`📧 Email data ready for ${date}`);

    // Download from OneDrive share link
    const fileContent = await onedrive.downloadFile(shareLink);

    // Process emails (emails don't go through briefing generation)
    await processEmailData(fileContent, date);

    console.log('✅ Emails processed');
    res.json({ status: 'success', message: 'Email data processed' });
  } catch (error) {
    console.error('❌ Email webhook error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

module.exports = router;
