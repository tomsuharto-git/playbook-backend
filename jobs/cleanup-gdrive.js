const cron = require('node-cron');
const axios = require('axios');

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
    
    console.log(`🗑️  Found ${files.length} old files in ${folderName}`);
    
    if (files.length === 0) return;
    
    // Delete each file
    for (const file of files) {
      try {
        const deleteUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?key=${process.env.GOOGLE_API_KEY}`;
        await axios.delete(deleteUrl);
        console.log(`✅ Deleted: ${file.name} (modified: ${file.modifiedTime})`);
      } catch (error) {
        console.error(`❌ Failed to delete ${file.name}:`, error.message);
      }
    }
  } catch (error) {
    console.error(`❌ Failed to cleanup ${folderName}:`, error.message);
  }
}

async function cleanupOldFiles() {
  console.log('🧹 Starting Google Drive cleanup...');
  
  try {
    await cleanupFolder(CALENDAR_FOLDER_ID, 'Calendar');
    await cleanupFolder(EMAILS_FOLDER_ID, 'Emails');
    
    console.log('🧹 Cleanup complete');
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  }
}

function startCleanupJob() {
  // Run daily at midnight ET
  cron.schedule('0 0 * * *', cleanupOldFiles, {
    timezone: 'America/New_York'
  });
  
  console.log('🧹 Google Drive cleanup scheduled: Daily at midnight ET');
}

module.exports = { startCleanupJob, cleanupOldFiles };
