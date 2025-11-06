/**
 * Outlook Calendar Service
 * Fetches Outlook calendar events from Google Drive
 */

const axios = require('axios');
const logger = require('../utils/logger').service('outlook-calendar');
const { normalizeOutlookEvent, filterEventsByDate } = require('./calendar-normalizer');

const CALENDAR_FOLDER_ID = '15CJiwytPs1A0rAIectouqr8xExIYMiMf';

/**
 * Get most recent calendar file from Google Drive
 */
async function getLatestCalendarFile() {
  try {
    // List files in calendar folder, sorted by modification time
    const listUrl = `https://www.googleapis.com/drive/v3/files?q='${CALENDAR_FOLDER_ID}'+in+parents&orderBy=modifiedTime desc&pageSize=1&fields=files(id,name,modifiedTime)&key=${process.env.GOOGLE_API_KEY}`;

    const listResponse = await axios.get(listUrl);

    if (!listResponse.data.files || listResponse.data.files.length === 0) {
      logger.info('📭 No calendar files found in Google Drive');
      return null;
    }

    const file = listResponse.data.files[0];
    logger.info('📄 Latest calendar file:  (modified: )', { name: file.name, modifiedTime: file.modifiedTime });

    // Download file content
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${process.env.GOOGLE_API_KEY}`;
    const downloadResponse = await axios.get(downloadUrl);

    return {
      name: file.name,
      data: downloadResponse.data
    };

  } catch (error) {
    logger.error('❌ Failed to fetch calendar from Drive:');
    throw error;
  }
}

/**
 * Fetch Outlook calendar events for a specific date
 * @param {string} targetDateStr - Date in format "2025-10-13"
 * @returns {Array} Normalized Outlook events occurring on target date
 */
async function fetchOutlookEventsForDate(targetDateStr) {
  try {
    logger.info('\n📅 Fetching Outlook events for ...', { targetDateStr: targetDateStr });

    // Get latest calendar file from Drive
    const calendarFile = await getLatestCalendarFile();

    if (!calendarFile) {
      logger.info('   No calendar file available');
      return [];
    }

    // Parse calendar data
    const allEvents = calendarFile.data.value || [];
    logger.info('Total events in file:', { length: allEvents.length });

    // LAYER 3 DEFENSE: Validate and normalize events, filtering out invalid ones
    // normalizeOutlookEvent() now returns null for invalid events (no subject)
    const normalizedEvents = allEvents
      .map(e => normalizeOutlookEvent(e))
      .filter(e => e !== null); // Remove invalid events rejected by Layer 1

    const rejectedCount = allEvents.length - normalizedEvents.length;
    if (rejectedCount > 0) {
      logger.info('🚫 [LAYER 3] Rejected  invalid Outlook event(s)', { rejectedCount: rejectedCount });
    }
    logger.info('✅ Normalized:  valid events', { length: normalizedEvents.length });

    // Then filter for target date
    const filteredEvents = filterEventsByDate(normalizedEvents, targetDateStr);
    logger.info('Events on :', { targetDateStr: targetDateStr, length: filteredEvents.length });

    logger.info('✅ Fetched  Outlook events\n', { length: filteredEvents.length });
    return filteredEvents;

  } catch (error) {
    logger.error('❌ Error fetching Outlook events for :', { targetDateStr: targetDateStr });
    return []; // Return empty array on error to allow Google Calendar to still work
  }
}

module.exports = {
  fetchOutlookEventsForDate,
  getLatestCalendarFile
};
