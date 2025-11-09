const logger = require('../utils/logger').service('google-calendar');

const { google } = require('googleapis');
const { normalizeGoogleEvent, filterEventsByDate } = require('./calendar-normalizer');
const { getGoogleCalendarCredentials, getGoogleCalendarToken } = require('../config/google-calendar-config');

// Calendar IDs (same as Python script)
const CALENDARS = {
  'tomsuharto@gmail.com': 'Personal',
  '67qeidqgbdro795lpr2dc9miho@group.calendar.google.com': 'Family',
  'fv18afmp4k955cpl6jgb1gu21a7c6khm@import.calendar.google.com': 'Work'
};

/**
 * Load Google Calendar credentials and create authorized client
 */
async function getCalendarClient() {
  try {
    // Load credentials from config helper (supports both env vars and files)
    const credentials = getGoogleCalendarCredentials();
    const token = getGoogleCalendarToken();

    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    // Set credentials
    oAuth2Client.setCredentials(token);

    return google.calendar({ version: 'v3', auth: oAuth2Client });
  } catch (error) {
    logger.error('Error loading Google Calendar credentials:', { arg0: error.message });
    throw error;
  }
}

/**
 * Fetch events from a specific calendar
 */
async function fetchCalendarEvents(calendar, calendarId, startTime, endTime) {
  try {
    const response = await calendar.events.list({
      calendarId,
      timeMin: startTime,
      timeMax: endTime,
      singleEvents: true,
      orderBy: 'startTime',
      maxAttendees: 50, // Include up to 50 attendees per event
      showDeleted: false // Exclude deleted/cancelled events
    });

    const events = response.data.items || [];

    // Additional filter: exclude events without summaries and cancelled events
    const validEvents = events.filter(event => {
      // Skip cancelled events (shouldn't happen with showDeleted: false, but double-check)
      if (event.status === 'cancelled') return false;

      // Skip events without titles (these are likely placeholders or errors)
      if (!event.summary || event.summary.trim() === '') return false;

      return true;
    });

    const calendarName = CALENDARS[calendarId];
    const filteredOutCount = events.length - validEvents.length;
    logger.info('✅ Fetched  events from  ( filtered out)', { validEventsCount: validEvents.length, calendar: calendarName, filteredOutCount: filteredOutCount });

    // Debug: Log attendee counts
    const eventsWithAttendees = validEvents.filter(e => e.attendees && e.attendees.length > 0);
    logger.info('👥  events have attendees', { length: eventsWithAttendees.length });

    // Normalize events using shared normalizer
    // normalizeGoogleEvent() returns null for invalid events (no summary)
    const normalizedEvents = validEvents
      .map(event => normalizeGoogleEvent(event))
      .filter(event => event !== null); // Remove invalid events rejected by Layer 1

    const rejectedCount = validEvents.length - normalizedEvents.length;
    if (rejectedCount > 0) {
      logger.info('🚫 [LAYER 1] Rejected  invalid Google event(s)', { rejectedCount: rejectedCount });
    }

    return normalizedEvents;
  } catch (error) {
    logger.error('❌ Error fetching from :', { calendarId: calendarId });
    return [];
  }
}

/**
 * Fetch events from all Google Calendars for a specific date
 */
async function fetchTodaysEvents(targetDate = new Date()) {
  try {
    logger.info('📅 Fetching Google Calendar events...');

    const calendar = await getCalendarClient();

    // Get target date string in Eastern Time
    const etFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York'
    });
    const targetDateStr = etFormatter.format(targetDate);

    // Set time range for the target date (all day)
    // Note: Google Calendar API timeMin/timeMax returns ALL events overlapping this range,
    // including multi-day events. We'll filter after fetching.
    const startTime = new Date(targetDate);
    startTime.setHours(0, 0, 0, 0);

    const endTime = new Date(targetDate);
    endTime.setHours(23, 59, 59, 999);

    logger.info('Date:', { targetDateStr: targetDateStr });

    // Fetch from all calendars in parallel
    const calendarIds = Object.keys(CALENDARS);
    const eventPromises = calendarIds.map(calendarId =>
      fetchCalendarEvents(calendar, calendarId, startTime.toISOString(), endTime.toISOString())
    );

    const eventArrays = await Promise.all(eventPromises);

    // Flatten all events
    const allEvents = eventArrays.flat();
    logger.debug('📊 Total events from API:', { length: allEvents.length });

    // Filter to only include events that START on target date (in ET)
    // This removes multi-day events from previous days
    const filteredEvents = filterEventsByDate(allEvents, targetDateStr);
    logger.info('✅ Filtered to  events for', { length: filteredEvents.length, targetDateStr: targetDateStr });

    // Sort by start time
    filteredEvents.sort((a, b) => {
      const aTime = a.start?.dateTime || a.start?.date || '';
      const bTime = b.start?.dateTime || b.start?.date || '';
      return aTime.localeCompare(bTime);
    });

    logger.info('✅ Fetched  Google Calendar events\n', { length: filteredEvents.length });
    return filteredEvents;
  } catch (error) {
    logger.error('❌ Error fetching Google Calendar events:', { arg0: error });
    throw error;
  }
}

module.exports = {
  fetchTodaysEvents
};
