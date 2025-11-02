/**
 * Calendar Normalizer
 * Shared utilities for normalizing calendar events from different sources
 * into a standard format for the Brief system
 */

/**
 * Format name from email address
 * If email matches First.Last@company.com pattern, return "First Last"
 * Otherwise return username as-is
 */
function formatNameFromEmail(email) {
  const username = email.split('@')[0];
  const parts = username.split('.');

  // Check if exactly 2 parts (First.Last pattern)
  if (parts.length === 2) {
    const firstName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
    const lastName = parts[1].charAt(0).toUpperCase() + parts[1].slice(1).toLowerCase();
    return `${firstName} ${lastName}`;
  }

  // Otherwise keep username as-is
  return username;
}

/**
 * Standard Event Schema
 * All calendar sources should normalize to this format:
 * {
 *   id: string,
 *   summary: string,
 *   start: { dateTime?: string, date?: string, timeZone?: string },
 *   end: { dateTime?: string, date?: string, timeZone?: string },
 *   location: string,
 *   description: string,
 *   attendees: Array,
 *   calendar_category: 'Outlook' | 'Google',
 *   ...other fields
 * }
 */

/**
 * Normalize Outlook event to standard format
 * Returns null if event is invalid (no subject)
 */
function normalizeOutlookEvent(outlookEvent) {
  // LAYER 1 DEFENSE: Reject events without valid subject at source
  // This prevents "No Title" events from ever entering the system
  const subject = outlookEvent.subject || '';
  if (!subject || subject.trim() === '' || subject.trim() === 'No Title') {
    console.log(`     🚫 [LAYER 1] Rejecting Outlook event without valid subject (ID: ${outlookEvent.id || 'unknown'})`);
    return null;
  }

  // Convert Outlook's string format to Google Calendar's object format
  // Outlook: "2025-10-05T12:00:00.0000000"
  // Google: { dateTime: "2025-10-05T12:00:00-04:00", timeZone: "America/New_York" }

  const start = outlookEvent.isAllDay
    ? { date: outlookEvent.start.split('T')[0] }  // All-day events use 'date'
    : {
        dateTime: outlookEvent.startWithTimeZone || outlookEvent.start,
        timeZone: outlookEvent.timeZone || 'UTC'
      };

  const end = outlookEvent.isAllDay
    ? { date: outlookEvent.end.split('T')[0] }
    : {
        dateTime: outlookEvent.endWithTimeZone || outlookEvent.end,
        timeZone: outlookEvent.timeZone || 'UTC'
      };

  // Parse Outlook attendees
  // Outlook format: requiredAttendees and optionalAttendees as semicolon-separated email strings
  // Example: "peter.kamstedt@forsman.com;David.Proudlock@forsman.com;"
  const requiredEmails = (outlookEvent.requiredAttendees || '').split(';').filter(e => e.trim());
  const optionalEmails = (outlookEvent.optionalAttendees || '').split(';').filter(e => e.trim());

  const attendees = [
    ...requiredEmails.map(email => ({
      email: email.trim(),
      name: formatNameFromEmail(email.trim()), // Format as "First Last" if pattern matches
      responseStatus: 'accepted' // Required attendees are typically accepted
    })),
    ...optionalEmails.map(email => ({
      email: email.trim(),
      name: formatNameFromEmail(email.trim()), // Format as "First Last" if pattern matches
      responseStatus: 'tentative' // Optional attendees marked as tentative
    }))
  ];

  return {
    id: outlookEvent.id,
    summary: subject.trim(),
    start,
    end,
    location: outlookEvent.location || '',
    description: outlookEvent.body || '',
    attendees,
    calendar_category: 'Outlook',
    // Preserve original fields
    _original: outlookEvent
  };
}

/**
 * Normalize Google Calendar event to standard format
 * Returns null if event is invalid (no summary)
 */
function normalizeGoogleEvent(googleEvent) {
  // LAYER 1 DEFENSE: Reject events without valid summary at source
  // This prevents "No Title" events from ever entering the system
  const summary = googleEvent.summary || '';
  if (!summary || summary.trim() === '' || summary.trim() === 'No Title') {
    console.log(`     🚫 [LAYER 1] Rejecting Google event without valid summary (ID: ${googleEvent.id || 'unknown'})`);
    return null;
  }

  // NOTE: Even if this is an imported Outlook calendar, we treat it as 'Google'
  // because it's accessed via Google Calendar API and should follow Google Calendar
  // work/life categorization rules (Google → Life by default)
  // The original categorization logic was:
  //   const isImportedOutlook = organizerEmail.includes('@import.calendar.google.com');
  //   calendar_category: isImportedOutlook ? 'Outlook' : 'Google'
  // But this caused imported calendars to be incorrectly marked as Work events.

  return {
    id: googleEvent.id,
    summary: summary.trim(),
    start: googleEvent.start,
    end: googleEvent.end,
    location: googleEvent.location || '',
    description: googleEvent.description || '',
    attendees: googleEvent.attendees?.map(a => ({
      email: a.email,
      name: a.displayName,
      responseStatus: a.responseStatus
    })) || [],
    calendar_category: 'Google',  // Always 'Google' since fetched via Google Calendar API
    // Preserve original fields
    _original: googleEvent
  };
}

/**
 * Check if event occurs on a specific date (in Eastern Time)
 */
function eventOccursOnDate(event, targetDateStr) {
  // targetDateStr format: "2025-10-13"

  // Get event start date
  const eventStartStr = event.start?.dateTime || event.start?.date;
  if (!eventStartStr) return false;

  const eventStart = new Date(eventStartStr);
  const eventEnd = event.end?.dateTime || event.end?.date
    ? new Date(event.end.dateTime || event.end.date)
    : eventStart;

  // Extract date parts in EASTERN TIME (not UTC!)
  const etFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York'
  });

  const eventStartDate = etFormatter.format(eventStart);  // "2025-10-12"
  const eventEndDate = etFormatter.format(eventEnd);      // "2025-10-12"

  // Event occurs on target date if:
  // 1. It starts on target date, OR
  // 2. It's a multi-day event spanning target date
  const occursOnDate = (
    eventStartDate === targetDateStr ||
    (eventStartDate <= targetDateStr && eventEndDate >= targetDateStr)
  );

  // Special handling for all-day events
  if (event.start?.date && !event.start?.dateTime) {
    // All-day event - use the date string directly since it's not timezone-aware
    const allDayStart = event.start.date;
    const allDayEnd = event.end?.date || event.start.date;

    // Google Calendar uses EXCLUSIVE end dates for all-day events
    // (end date is the day AFTER the last day of the event)
    // Include if: start <= target AND end > target
    // This correctly handles multi-day events that span the target date
    return allDayStart <= targetDateStr && allDayEnd > targetDateStr;
  }

  return occursOnDate;
}

/**
 * Filter events array by date
 */
function filterEventsByDate(events, targetDateStr) {
  return events.filter(event => eventOccursOnDate(event, targetDateStr));
}

/**
 * Deduplicate events using iCalUID (preferred) or title + start time (fallback)
 * Prefers Outlook over Google when duplicates found
 * Filters out events without titles
 */
function deduplicateEvents(events) {
  const eventMap = new Map();

  // First pass: group duplicates and decide which to keep
  for (const event of events) {
    // Skip events without a title (these are likely noise or deleted events)
    if (!event.summary || event.summary.trim() === '' || event.summary === 'No Title') {
      continue;
    }

    // Try to get iCalUID from the event (this is the proper unique identifier)
    const iCalUID = event._original?.iCalUId || event._original?.iCalUID;

    let key;
    if (iCalUID) {
      // Use iCalUID as the primary dedup key (most reliable)
      key = `ical:${iCalUID}`;
    } else {
      // Fallback: Create unique key based on title + start time
      const title = event.summary || '';
      let startTime = event.start?.dateTime || event.start?.date || '';

      // Normalize timestamp format: Convert "+00:00" to "Z" for consistent comparison
      // Gmail uses "Z", Outlook uses "+00:00", but they represent the same time
      if (startTime) {
        try {
          const date = new Date(startTime);
          // Convert to ISO string (always uses Z format)
          startTime = date.toISOString();
        } catch (e) {
          // If parsing fails, use original string
        }
      }

      key = `title:${title.toLowerCase().trim()}|${startTime}`;
    }

    if (!eventMap.has(key)) {
      // First occurrence of this event
      eventMap.set(key, event);
    } else {
      // Duplicate found - prefer Outlook over Google (Outlook has better attendee data)
      const existing = eventMap.get(key);
      if (event.calendar_category === 'Outlook' && existing.calendar_category === 'Google') {
        // Replace Google with Outlook
        console.log(`     🔄 Dedup: Preferring Outlook over Google for "${event.summary}"`);
        eventMap.set(key, event);
      }
      // Otherwise keep the existing one (first occurrence wins)
      else {
        console.log(`     🔄 Dedup: Skipping duplicate "${event.summary}"`);
      }
    }
  }

  // Return deduplicated events as array
  return Array.from(eventMap.values());
}

module.exports = {
  normalizeOutlookEvent,
  normalizeGoogleEvent,
  filterEventsByDate,
  deduplicateEvents,
  eventOccursOnDate
};
