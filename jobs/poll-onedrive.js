const cron = require('node-cron');
const axios = require('axios');
const { processCalendarData, processEmailData } = require('../services/data-processor');

const FOLDER_LINK = 'https://forsmanbodenforsglobal-my.sharepoint.com/:f:/g/personal/tom_suharto_forsman_com/EjfvvdzNz6ZHghi_h_PNTpgBmOkxjU0ouAOUD1jEn1S9VQ?e=KzAfIN';

async function getFileFromFolder(filename) {
  try {
    // Convert SharePoint share link to direct download
    const baseUrl = 'https://forsmanbodenforsglobal-my.sharepoint.com/personal/tom_suharto_forsman_com/_layouts/15/download.aspx';
    const fileUrl = `${baseUrl}?share=${FOLDER_LINK.split('?')[0].split('/').pop()}&file=${filename}`;
    
    const { data } = await axios.get(fileUrl);
    return data;
  } catch (error) {
    console.error(`Failed to get ${filename}:`, error.message);
    return null;
  }
}

async function pollOneDrive() {
  console.log('🔄 Polling OneDrive...');
  
  const today = new Date().toISOString().split('T')[0];
  
  try {
    // Get calendar file
    const calendarFile = `calendar-${today}.json`;
    const calendarData = await getFileFromFolder(calendarFile);
    if (calendarData) {
      await processCalendarData(calendarData, today);
    }
    
    // Get emails file
    const emailsFile = `emails-${today}.json`;
    const emailsData = await getFileFromFolder(emailsFile);
    if (emailsData) {
      await processEmailData(emailsData, today);
    }
    
    console.log('✅ Polling complete');
  } catch (error) {
    console.error('❌ Polling error:', error.message);
  }
}

function startPolling() {
  cron.schedule('5 * * * *', pollOneDrive);
  console.log('⏰ Polling scheduled (hourly at :05)');
  
  // Run once on startup for testing
  setTimeout(pollOneDrive, 5000);
}

module.exports = { startPolling };
