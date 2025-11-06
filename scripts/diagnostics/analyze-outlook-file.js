/**
 * Analyze Outlook Calendar File
 * Checks for events with missing subjects or times
 */

const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');

const gdrivePath = process.env.GDRIVE_FOLDER_PATH;
const file = 'calendar-2025-10-18-1600.json';
const filePath = path.join(gdrivePath, file);

const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

logger.debug('📊 Outlook Calendar File Analysis\n');
logger.info('File:', { arg0: file });
logger.info('Total events:');

// Group by calendar
const byCalendar = {};
data.events?.forEach(e => {
  const cal = e.calendar || 'Unknown';
  if (!byCalendar[cal]) byCalendar[cal] = [];
  byCalendar[cal].push(e);
});

logger.info('\nEvents by calendar:');
Object.keys(byCalendar).forEach(cal => {
  logger.info(':  events', { cal: cal, length: byCalendar[cal].length });
});

// Count events with missing subjects
const missingSubject = data.events?.filter(e => !e.subject || e.subject.trim() === '') || [];
logger.warn('\n⚠️  Events with missing subjects:', { length: missingSubject.length });

// Show first 10 missing subject events
if (missingSubject.length > 0) {
  logger.info('\nSample events with no subject:');
  missingSubject.slice(0, 10).forEach((e, i) => {
    logger.info('. Calendar: , Start: , isAllDay:', { i+1: i+1, calendar: e.calendar, slice(0, 16) || 'MISSING': e.start?.slice(0, 16) || 'MISSING', isAllDay: e.isAllDay });
  });
}

// Count events with missing times
const missingTime = data.events?.filter(e => !e.start || !e.end) || [];
logger.warn('\n⚠️  Events with missing times:', { length: missingTime.length });

// Events that are valid (have subject AND time)
const validEvents = data.events?.filter(e => {
  const hasSubject = e.subject && e.subject.trim() !== '';
  const hasTime = e.start && e.end;
  return hasSubject && hasTime;
}) || [];
logger.info('\n✅ Valid events (have subject AND time):', { length: validEvents.length });

logger.info('\n');
