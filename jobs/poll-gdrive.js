const cron = require('node-cron');
const axios = require('axios');
const { processCalendarData, processEmailData } = require('../services/data-processor');

// Google Drive folder IDs
const CALENDAR_FOLDER_ID = '15CJiwytPs1A0rAIectouqr8xExIYMiMf';
const EMAILS_FOLDER_ID = '1P47U133gdAKaA86sfHp8tFAMaYz3zs5t';

/**
 * Get most recent file from a Google Drive folder
 */
async function getMostRecentFile(folderId, folderName) {
  try {
    const listUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&orderBy=modifiedTime desc&pageSize=1&fields=files(id,name,modifiedTime)&key=${process.env.GOOGLE_API_KEY}`;
    
    const listResponse = await axios.get(listUrl);
    
    if (!listResponse.data.files || listResponse.data.files.length === 0) {
      console.log(`📭 No files found in ${folderName} folder`);
      return null;
    }
    
    const file = listResponse.data.files[0];
    console.log(`📄 Found in ${folderName}: ${file.name} (modified: ${file.modifiedTime})`);
    
    // Download file content
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${process.env.GOOGLE_API_KEY}`;
    const downloadResponse = await axios.get(downloadUrl);
    
    console.log(`✅ Downloaded: ${file.name}`);
    return {
      name: file.name,
      data: downloadResponse.data
    };
    
  } catch (error) {
    console.error(`❌ Failed to get file from ${folderName}:`, error.message);
    return null;
  }
}

/**
 * Extract date from filename: calendar-2025-10-09-1840.json -> 2025-10-09
 */
function extractDateFromFilename(filename) {
  const match = filename.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

async function pollGoogleDrive() {
  console.log('🔄 Polling Google Drive...');
  
  try {
    // Get most recent calendar file
    const calendarFile = await getMostRecentFile(CALENDAR_FOLDER_ID, 'Calendar');
    if (calendarFile) {
      const date = extractDateFromFilename(calendarFile.name);
      if (date) {
        await processCalendarData(calendarFile.data, date);
        console.log(`✅ Processed calendar for ${date}`);
      }
    }
    
    // Get most recent emails file
    const emailsFile = await getMostRecentFile(EMAILS_FOLDER_ID, 'Emails');
    if (emailsFile) {
      const date = extractDateFromFilename(emailsFile.name);
      if (date) {
        await processEmailData(emailsFile.data, date);
        console.log(`✅ Processed emails for ${date}`);
      }
    }
    
    console.log('✅ Polling complete');
    return { success: true };
  } catch (error) {
    console.error('❌ Polling error:', error);
    return { success: false, error: error.message };
  }
}

function startPolling() {
  // Poll 3x daily at 6:10am, 12:10pm, 6:10pm (10 minutes after Power Automate)
  cron.schedule('10 6,12,18 * * *', pollGoogleDrive, {
    timezone: 'America/New_York'
  });
  console.log('⏰ Google Drive polling scheduled (3x daily at 6:10am, 12:10pm, 6:10pm ET)');
  
  // Run once on startup after 5 seconds
  setTimeout(() => {
    console.log('🚀 Running initial poll on startup...');
    pollGoogleDrive();
  }, 5000);
}

module.exports = { startPolling, pollGoogleDrive };
