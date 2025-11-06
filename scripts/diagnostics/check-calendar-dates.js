const logger = require('../../utils/logger');

/**
 * Check what dates are in the Outlook calendar file
 */

require('dotenv').config();
const { getLatestCalendarFile } = require('./services/outlook-calendar');

async function checkDates() {
  try {
    const calendarFile = await getLatestCalendarFile();

    if (!calendarFile) {
      logger.info('No calendar file found');
      return;
    }

    const events = calendarFile.data.value || [];
    logger.info('\nTotal events in file:', { length: events.length });

    // Count events by date
    const dateCounts = {};
    events.forEach(e => {
      // Outlook events have start as a STRING, not an object
      const start = e.start || e.startWithTimeZone;
      if (start) {
        const date = start.split('T')[0];
        dateCounts[date] = (dateCounts[date] || 0) + 1;
      }
    });

    logger.info('\nEvents by date:');
    Object.entries(dateCounts).sort().forEach(([date, count]) => {
      logger.info(':  events', { date: date, count: count });
    });

    // Show sample event for Oct 12 and 13
    logger.info('\n=== Sample events for Oct 12 ===');
    const oct12Events = events.filter(e => {
      const start = e.start || e.startWithTimeZone;
      return start && start.startsWith('2025-10-12');
    });
    oct12Events.slice(0, 3).forEach(e => {
      logger.info('"" -', { subject: e.subject, startWithTimeZone: e.start || e.startWithTimeZone });
    });

    logger.info('\n=== Sample events for Oct 13 ===');
    const oct13Events = events.filter(e => {
      const start = e.start || e.startWithTimeZone;
      return start && start.startsWith('2025-10-13');
    });
    oct13Events.slice(0, 3).forEach(e => {
      logger.info('"" -', { subject: e.subject, startWithTimeZone: e.start || e.startWithTimeZone });
    });

  } catch (error) {
    logger.error('Error:', { arg0: error.message });
  }
}

checkDates();
