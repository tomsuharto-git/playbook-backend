/**
 * Analyze Outlook Calendar File
 * Checks for events with missing subjects or times
 */

const fs = require('fs');
const path = require('path');

const gdrivePath = process.env.GDRIVE_FOLDER_PATH;
const file = 'calendar-2025-10-18-1600.json';
const filePath = path.join(gdrivePath, file);

const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

console.log('📊 Outlook Calendar File Analysis\n');
console.log('File:', file);
console.log('Total events:', data.events?.length || 0);

// Group by calendar
const byCalendar = {};
data.events?.forEach(e => {
  const cal = e.calendar || 'Unknown';
  if (!byCalendar[cal]) byCalendar[cal] = [];
  byCalendar[cal].push(e);
});

console.log('\nEvents by calendar:');
Object.keys(byCalendar).forEach(cal => {
  console.log(`  ${cal}: ${byCalendar[cal].length} events`);
});

// Count events with missing subjects
const missingSubject = data.events?.filter(e => !e.subject || e.subject.trim() === '') || [];
console.log(`\n⚠️  Events with missing subjects: ${missingSubject.length}`);

// Show first 10 missing subject events
if (missingSubject.length > 0) {
  console.log('\nSample events with no subject:');
  missingSubject.slice(0, 10).forEach((e, i) => {
    console.log(`  ${i+1}. Calendar: ${e.calendar}, Start: ${e.start?.slice(0, 16) || 'MISSING'}, isAllDay: ${e.isAllDay}`);
  });
}

// Count events with missing times
const missingTime = data.events?.filter(e => !e.start || !e.end) || [];
console.log(`\n⚠️  Events with missing times: ${missingTime.length}`);

// Events that are valid (have subject AND time)
const validEvents = data.events?.filter(e => {
  const hasSubject = e.subject && e.subject.trim() !== '';
  const hasTime = e.start && e.end;
  return hasSubject && hasTime;
}) || [];
console.log(`\n✅ Valid events (have subject AND time): ${validEvents.length}`);

console.log('\n');
