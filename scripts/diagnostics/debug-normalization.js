const logger = require('../../utils/logger');

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

logger.debug('🔍 Testing event normalization\n');
logger.info('Input event:');
logger.info(JSON.stringify(sampleEvent, { arg0: null });

const normalized = normalizeOutlookEvent(sampleEvent);

logger.info('\n✅ Normalized event:');
logger.info(JSON.stringify(normalized, { arg0: null });

logger.debug('\n🔍 Field check:');
logger.info('- id:', { id || 'MISSING': normalized.id || 'MISSING' });
logger.info('- summary:', { summary || 'MISSING': normalized.summary || 'MISSING' });
logger.info('- start:', { start) || 'MISSING': JSON.stringify(normalized.start) || 'MISSING' });
logger.info('- end:', { end) || 'MISSING': JSON.stringify(normalized.end) || 'MISSING' });
logger.info('- calendar_category:', { calendar_category || 'MISSING': normalized.calendar_category || 'MISSING' });
logger.info('- attendees:', { length || 0: normalized.attendees?.length || 0 });

// Test with event missing subject
logger.debug('\n\n🔍 Testing with missing subject:\n');
const noSubjectEvent = { ...sampleEvent, subject: undefined };
const normalizedNoSubject = normalizeOutlookEvent(noSubjectEvent);
logger.info('- summary:  (should be "No Title")', { summary || 'MISSING': normalizedNoSubject.summary || 'MISSING' });

// Test with empty subject
logger.debug('\n🔍 Testing with empty subject:\n');
const emptySubjectEvent = { ...sampleEvent, subject: '' };
const normalizedEmptySubject = normalizeOutlookEvent(emptySubjectEvent);
logger.info('- summary:  (should be "No Title")', { summary || 'MISSING': normalizedEmptySubject.summary || 'MISSING' });

process.exit(0);
