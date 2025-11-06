const cron = require('node-cron');
const axios = require('axios');
const logger = require('../utils/logger').job('cleanup-gdrive');

// Google Drive folder IDs
const CALENDAR_FOLDER_ID = '15CJiwytPs1A0rAIectouqr8xExIYMiMf';
const EMAILS_FOLDER_ID = '1P47U133gdAKaA86sfHp8tFAMaYz3zs5t';

/**
 * Delete old files from a Google Drive folder (older than 24 hours)
 */
async function cleanupFolder(folderId, folderName) {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const isoTime = twentyFourHoursAgo.toISOString();
    
    // List files older than 24 hours
    const listUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+modifiedTime<'${isoTime}'&fields=files(id,name,modifiedTime)&key=${process.env.GOOGLE_API_KEY}`;
    
    const listResponse = await axios.get(listUrl);
    const files = listResponse.data.files || [];
    
    logger.info('🗑️  Found  old files in', { length: files.length, folderName: folderName });
    
    if (files.length === 0) return;
    
    // Delete each file
    for (const file of files) {
      try {
        const deleteUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?key=${process.env.GOOGLE_API_KEY}`;
        await axios.delete(deleteUrl);
        logger.info('✅ Deleted:  (modified: )', { name: file.name, modifiedTime: file.modifiedTime });
      } catch (error) {
        logger.error('❌ Failed to delete :', { name: file.name });
      }
    }
  } catch (error) {
    logger.error('❌ Failed to cleanup :', { folderName: folderName });
  }
}

async function cleanupOldFiles() {
  logger.info('🧹 Starting Google Drive cleanup...');
  
  try {
    await cleanupFolder(CALENDAR_FOLDER_ID, 'Calendar');
    await cleanupFolder(EMAILS_FOLDER_ID, 'Emails');
    
    logger.info('🧹 Cleanup complete');
  } catch (error) {
    logger.error('❌ Cleanup failed:', { arg0: error });
  }
}

function startCleanupJob() {
  // Run daily at midnight ET
  cron.schedule('0 0 * * *', cleanupOldFiles, {
    timezone: 'America/New_York'
  });
  
  logger.info('🧹 Google Drive cleanup scheduled: Daily at midnight ET');
}

module.exports = { startCleanupJob, cleanupOldFiles };
