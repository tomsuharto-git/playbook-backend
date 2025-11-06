/**
 * Debug script to test event normalization
 */

const { normalizeOutlookEvent } = require('./services/calendar-normalizer');

// Test with sample Outlook event
const sampleEvent = {
  "subject": "Test Meeting",
  "start": "2025-10-17T12:00:00.0000000",
  "end": "2025-10-17T13:00:00.0000000",
  "startWithTimeZone": "2025-10-17T12:00:00+00:00",
  "endWithTimeZone": "2025-10-17T13:00:00+00:00",
  "body": "Test body",
  "id": "test-123",
  "isAllDay": false,
  "timeZone": "UTC",
  "location": "Test location",
  "requiredAttendees": "test1@example.com;test2@example.com;",
  "optionalAttendees": ""
};

console.log('🔍 Testing event normalization\n');
console.log('Input event:');
console.log(JSON.stringify(sampleEvent, null, 2));

const normalized = normalizeOutlookEvent(sampleEvent);

console.log('\n✅ Normalized event:');
console.log(JSON.stringify(normalized, null, 2));

console.log('\n🔍 Field check:');
console.log(`  - id: ${normalized.id || 'MISSING'}`);
console.log(`  - summary: ${normalized.summary || 'MISSING'}`);
console.log(`  - start: ${JSON.stringify(normalized.start) || 'MISSING'}`);
console.log(`  - end: ${JSON.stringify(normalized.end) || 'MISSING'}`);
console.log(`  - calendar_category: ${normalized.calendar_category || 'MISSING'}`);
console.log(`  - attendees: ${normalized.attendees?.length || 0}`);

// Test with event missing subject
console.log('\n\n🔍 Testing with missing subject:\n');
const noSubjectEvent = { ...sampleEvent, subject: undefined };
const normalizedNoSubject = normalizeOutlookEvent(noSubjectEvent);
console.log(`  - summary: ${normalizedNoSubject.summary || 'MISSING'} (should be "No Title")`);

// Test with empty subject
console.log('\n🔍 Testing with empty subject:\n');
const emptySubjectEvent = { ...sampleEvent, subject: '' };
const normalizedEmptySubject = normalizeOutlookEvent(emptySubjectEvent);
console.log(`  - summary: ${normalizedEmptySubject.summary || 'MISSING'} (should be "No Title")`);

process.exit(0);
