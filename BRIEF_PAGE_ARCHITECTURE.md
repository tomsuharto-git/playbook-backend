# Brief Page Architecture

**Last Updated**: October 13, 2025
**Status**: Production-ready with known limitations

---

## Overview

The Brief page is an intelligent calendar view that aggregates events from multiple calendar sources (Google Calendar + Outlook), enriches them with AI-generated briefings and project context, and displays them organized by date with timezone-aware filtering.

---

## Core Architecture

### Data Flow

```
┌─────────────────┐
│  Google Calendar │
│  (3 calendars)   │
└────────┬─────────┘
         │
         ├─────────────────┐
         │                 │
         v                 v
    ┌─────────┐      ┌──────────┐
    │ Fetch & │      │  Google  │
    │Normalize│      │  Drive   │
    └────┬────┘      │ (Outlook)│
         │           └─────┬────┘
         │                 │
         │           ┌─────v────┐
         │           │  Fetch & │
         │           │Normalize │
         │           └─────┬────┘
         │                 │
         └────────┬────────┘
                  │
                  v
         ┌────────────────┐
         │  Deduplicate   │
         │ (title + time) │
         └────────┬───────┘
                  │
                  v
         ┌────────────────┐
         │ Filter by Date │
         │ (Eastern Time) │
         └────────┬───────┘
                  │
                  v
         ┌────────────────┐
         │ Detect Projects│
         │   & Enrich     │
         └────────┬───────┘
                  │
                  v
         ┌────────────────┐
         │Generate AI     │
         │Briefings       │
         └────────┬───────┘
                  │
                  v
         ┌────────────────┐
         │Store in        │
         │daily_briefs    │
         └────────┬───────┘
                  │
                  v
         ┌────────────────┐
         │Frontend Display│
         └────────────────┘
```

---

## Timezone Strategy

### The Challenge

The system must handle events from multiple timezones and ensure consistent date labeling across backend and frontend:

- **Server timezone**: UTC (typical for cloud servers)
- **User timezone**: America/New_York (Eastern Time)
- **Calendar APIs**: Return events in UTC or with timezone offsets

### The Solution

**All date calculations use Eastern Time (America/New_York) explicitly:**

```javascript
// Backend & Frontend Pattern
const etFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York'
});
const todayET = etFormatter.format(new Date());
```

**Key Implementation Points:**

1. **Backend determines "today" in ET** (`/backend/routes/calendar.js`)
   - Uses `Intl.DateTimeFormat` with `America/New_York` timezone
   - Calculates future dates by parsing ET date string, not by adding to UTC Date object

2. **Frontend labels dates in ET** (`/frontend/app/brief/page.tsx`)
   - Uses same `Intl.DateTimeFormat` approach
   - Compares event dates using ET-formatted strings

3. **Event filtering uses ET** (`/backend/services/calendar-normalizer.js`)
   - Converts event timestamps to ET before comparing dates
   - Handles multi-day events with timezone-aware logic

4. **Brief generation uses ET** (`/backend/jobs/generate-briefings.js`)
   - Calculates date range in ET for fetching events
   - Ensures briefings are generated for correct ET dates

### Why 'en-CA' Locale?

The Canadian English locale (`en-CA`) formats dates as `YYYY-MM-DD` which is ISO 8601 compliant and allows for reliable string comparison:

```javascript
"2025-10-12" < "2025-10-13" // true (works for date comparison)
```

---

## Calendar Integration

### Google Calendar

**Source**: `/backend/services/google-calendar.js`

**Calendars Monitored**:
- Personal: `tomsuharto@gmail.com`
- Family: `67qeidqgbdro795lpr2dc9miho@group.calendar.google.com`
- Work: `fv18afmp4k955cpl6jgb1gu21a7c6khm@import.calendar.google.com`

**Fetch Strategy**:
```javascript
// Set time range for the full target date
const startTime = new Date(targetDate);
startTime.setHours(0, 0, 0, 0);

const endTime = new Date(targetDate);
endTime.setHours(23, 59, 59, 999);

// Fetch events
const response = await calendar.events.list({
  calendarId,
  timeMin: startTime.toISOString(),
  timeMax: endTime.toISOString(),
  singleEvents: true,
  orderBy: 'startTime',
});
```

**Important Note**: Google Calendar API's `timeMin`/`timeMax` returns **all events that overlap the time range**, including:
- Multi-day events that started before the range
- Events that extend beyond the range

Therefore, **post-fetch filtering is required** using `filterEventsByDate()`.

**Event Format**:
```javascript
{
  id: "event123",
  summary: "Meeting Title",
  start: {
    dateTime: "2025-10-13T13:00:00Z",  // Timed events
    date: "2025-10-13"                  // All-day events
  },
  end: { dateTime: "...", date: "..." },
  location: "Conference Room",
  description: "Meeting notes",
  attendees: [{ email, displayName, responseStatus }]
}
```

### Outlook Calendar

**Source**: `/backend/services/outlook-calendar.js`

**Integration Method**: Google Drive polling
- Outlook calendar is synced to JSON files in Google Drive
- Files are named: `calendar-YYYY-MM-DD-HHMM.json`
- Polling job runs 3x daily (6am, 12pm, 6pm ET)

**Raw Outlook Format**:
```javascript
{
  id: "outlook123",
  subject: "Meeting Title",  // Note: "subject" not "summary"
  start: "2025-10-13T13:00:00.0000000",
  startWithTimeZone: "2025-10-13T13:00:00+00:00",
  end: "2025-10-13T14:00:00.0000000",
  endWithTimeZone: "2025-10-13T14:00:00+00:00",
  isAllDay: false,
  location: "Teams Meeting",
  body: "Meeting description",
  timeZone: "UTC"
}
```

**Normalization**: Raw Outlook events are converted to Google Calendar format by `normalizeOutlookEvent()` in `/backend/services/calendar-normalizer.js`.

---

## Event Normalization

**Source**: `/backend/services/calendar-normalizer.js`

### Standard Event Schema

All calendar sources are normalized to this format:

```javascript
{
  id: string,
  summary: string,                    // Event title
  start: {
    dateTime?: string,                // ISO 8601 with timezone
    date?: string,                    // YYYY-MM-DD for all-day
    timeZone?: string
  },
  end: { dateTime?, date?, timeZone? },
  location: string,
  description: string,
  attendees: Array<{
    email: string,
    name: string,
    responseStatus: string
  }>,
  calendar_category: 'Outlook' | 'Google',
  _original: object                   // Preserved original data
}
```

### Key Transformations

**Outlook → Standard**:
- `subject` → `summary`
- String timestamps → Object format with `dateTime` and `timeZone`
- All-day events: Extract date portion only
- Add `calendar_category: 'Outlook'`

**Google → Standard**:
- Already in correct format (minimal transformation)
- Add `calendar_category: 'Google'`

---

## Deduplication Logic

**Source**: `/backend/services/calendar-normalizer.js` → `deduplicateEvents()`

### The Problem

Events synced across Gmail and Outlook calendars appear twice:
- Same event title
- Same event time
- Different calendar source

**Example**:
```
Baileys creative check-in [Gmail]  @ 2025-10-13T13:00:00Z
Baileys creative check-in [Outlook] @ 2025-10-13T13:00:00+00:00
```

### The Solution

**Deduplication Key**: `{title}|{normalized_timestamp}`

```javascript
function deduplicateEvents(events) {
  const eventMap = new Map();

  for (const event of events) {
    const title = event.summary || '';
    let startTime = event.start?.dateTime || event.start?.date || '';

    // CRITICAL: Normalize timestamp format
    // Gmail uses "Z", Outlook uses "+00:00"
    // Convert both to ISO string for consistent comparison
    if (startTime) {
      try {
        const date = new Date(startTime);
        startTime = date.toISOString(); // Always "Z" format
      } catch (e) {
        // If parsing fails, use original string
      }
    }

    const key = `${title.toLowerCase().trim()}|${startTime}`;

    if (!eventMap.has(key)) {
      eventMap.set(key, event);
    } else {
      // Prefer Outlook over Google for work events
      const existing = eventMap.get(key);
      if (event.calendar_category === 'Outlook' &&
          existing.calendar_category === 'Google') {
        eventMap.set(key, event);
      }
    }
  }

  return Array.from(eventMap.values());
}
```

### Why Timestamp Normalization is Critical

Without normalization:
```javascript
"2025-10-13T13:00:00Z" !== "2025-10-13T13:00:00+00:00"
// Different strings, not detected as duplicates!
```

With normalization:
```javascript
new Date("2025-10-13T13:00:00Z").toISOString()
// "2025-10-13T13:00:00.000Z"

new Date("2025-10-13T13:00:00+00:00").toISOString()
// "2025-10-13T13:00:00.000Z"

// Same string, detected as duplicate! ✓
```

---

## Date Filtering

**Source**: `/backend/services/calendar-normalizer.js` → `eventOccursOnDate()`

### Requirements

1. Events must be filtered to only those occurring on the target date **in Eastern Time**
2. Multi-day events spanning the target date must be included
3. All-day events must handle Google Calendar's exclusive end dates
4. Late-night events (e.g., 11 PM ET) must stay on the correct date

### Implementation

```javascript
function eventOccursOnDate(event, targetDateStr) {
  // targetDateStr format: "2025-10-13"

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

  const eventStartDate = etFormatter.format(eventStart);
  const eventEndDate = etFormatter.format(eventEnd);

  // Timed events: include if start OR spanning
  const occursOnDate = (
    eventStartDate === targetDateStr ||
    (eventStartDate <= targetDateStr && eventEndDate >= targetDateStr)
  );

  // Special handling for all-day events
  if (event.start?.date && !event.start?.dateTime) {
    const allDayStart = event.start.date;
    const allDayEnd = event.end?.date || event.start.date;

    // Google Calendar uses EXCLUSIVE end dates
    // "Teddy in town" Oct 9-14 → start: "2025-10-09", end: "2025-10-14"
    // Should appear on Oct 9, 10, 11, 12, 13 (not 14)
    return allDayStart <= targetDateStr && allDayEnd > targetDateStr;
  }

  return occursOnDate;
}
```

### Multi-Day Event Examples

**Event**: "Teddy in town" (Oct 9-14)
- **Stored as**: `start: "2025-10-09"`, `end: "2025-10-14"`
- **Oct 9**: `"2025-10-09" <= "2025-10-09" && "2025-10-14" > "2025-10-09"` → ✓
- **Oct 13**: `"2025-10-09" <= "2025-10-13" && "2025-10-14" > "2025-10-13"` → ✓
- **Oct 14**: `"2025-10-09" <= "2025-10-14" && "2025-10-14" > "2025-10-14"` → ✗

---

## Caching & Performance

### Brief Generation Job

**Source**: `/backend/jobs/generate-briefings.js`

**Schedule**: 3x daily at 6am, 12pm, 6pm ET using `node-cron`

**Process**:
```javascript
1. Fetch events from Google Calendar (all 3 calendars)
2. Fetch events from Outlook (via Google Drive)
3. Combine events
4. Deduplicate (title + time)
5. Filter by date (ET timezone-aware)
6. Detect projects for each event
7. Check for cached briefings
8. Generate new briefings (only for uncached events)
9. Store all events + briefings in daily_briefs table
```

### Caching Strategy

**Database Schema** (`daily_briefs` table):
```sql
CREATE TABLE daily_briefs (
  id UUID PRIMARY KEY,
  date DATE UNIQUE NOT NULL,        -- Target date (YYYY-MM-DD)
  calendar_events JSONB NOT NULL,   -- Array of enriched events
  generated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Cache Hit Logic**:
```javascript
// Check for existing briefings
const { data: cachedBriefings } = await supabase
  .from('daily_briefs')
  .select('calendar_events')
  .eq('date', dateStr)
  .single();

// Build map of event IDs → cached briefings
const cachedBriefingsMap = new Map();
cachedBriefings?.calendar_events.forEach(event => {
  if (event.id && event.ai_briefing) {
    cachedBriefingsMap.set(event.id, event.ai_briefing);
  }
});

// Only generate for new events
const eventsNeedingBriefings = dayEvents.filter(e =>
  !cachedBriefingsMap.has(e.id)
);
```

**Benefits**:
- Instant page loads (pre-generated data)
- Reduced AI API costs (only generate for new events)
- Resilience to calendar API failures (stale data available)

---

## AI Briefing Generation

**Source**: `/backend/services/event-briefing.js`

### Process

For each event without a cached briefing:

1. **Extract keywords** from event title
2. **Search Obsidian vault** for related context
3. **Generate AI briefing** using Claude API with:
   - Event details
   - Vault context snippets
   - Project information (if detected)
   - Related active tasks

### Briefing Format

```javascript
{
  ai_briefing: {
    summary: "3-4 sentence strategic overview",
    preparation: "Bullet points of prep needed",
    context: "Relevant background info",
    related_tasks: ["Task 1", "Task 2"]
  }
}
```

### Rate Limiting

To avoid Claude API rate limits:
- Process events **sequentially** (not in parallel)
- Add small delays between requests
- Cache aggressively to minimize regeneration

---

## Project Detection & Enrichment

**Source**: `/backend/services/project-detector.js`

### Detection Methods

**1. Keyword Matching**:
```javascript
// Extract keywords from event title
const keywords = extractKeywords(event.summary);

// Match against project names/keywords
const matches = projects.filter(project =>
  keywords.some(keyword =>
    project.name.toLowerCase().includes(keyword) ||
    project.keywords?.includes(keyword)
  )
);
```

**2. AI Classification** (fallback):
```javascript
// Use Claude to classify event if no keyword match
const prompt = `
Event: ${event.summary}
Description: ${event.description}
Attendees: ${event.attendees.map(a => a.email).join(', ')}

Available Projects:
${projects.map(p => `- ${p.name}: ${p.description}`).join('\n')}

Which project does this event belong to?
`;
```

### Event Enrichment

Once a project is detected, events are enriched with:
```javascript
{
  ...event,
  project_id: "uuid",
  project_name: "Baileys",
  project_color: "#4ECDC4",
  project_context: {
    description: "...",
    recent_activity: [...],
    active_tasks: [...]
  }
}
```

### Visual Indicators

Frontend displays project affiliation:
- **Colored border** on event card (using `project_color`)
- **Project tag** below event title
- **Project-specific briefing context** in AI summary

---

## Frontend Display

**Source**: `/frontend/app/brief/page.tsx`

### Date Grouping

Events are grouped by date with labels:
```javascript
const getDayLabel = (dateStr: string) => {
  const etFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York'
  });
  const todayStr = etFormatter.format(new Date());
  const tomorrowStr = etFormatter.format(new Date(Date.now() + 86400000));

  if (dateStr === todayStr) return 'Today';
  if (dateStr === tomorrowStr) return 'Tomorrow';

  // Format as "Friday, October 12"
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });
}
```

### Event Card Components

```jsx
<EventCard>
  <TimeRange>9:00 - 10:00 AM</TimeRange>
  <Title>Meeting Name</Title>
  {project && <ProjectTag color={project_color}>{project_name}</ProjectTag>}
  <Location>📍 {location}</Location>
  {ai_briefing && (
    <Briefing>
      💡 Briefing
      <Summary>{ai_briefing.summary}</Summary>
      <Preparation>{ai_briefing.preparation}</Preparation>
    </Briefing>
  )}
</EventCard>
```

### Visual Differentiation

**Outlook Events**:
- Blue left border
- "Outlook" badge

**Google Events**:
- Default styling
- Calendar category shown in metadata

**Project Events**:
- Custom colored left border (from `project_color`)
- Project tag badge

---

## Known Issues & Limitations

### 1. Outlook Time Offsets

**Issue**: Some Outlook events have 1-2 hour time differences from Gmail duplicates.

**Example**:
- Gmail: "Tom + Micco" @ 13:30
- Outlook: "Tom + Micco" @ 12:30

**Root Cause**: Outlook calendar sync may not preserve original timezone correctly.

**Status**: Investigating Outlook export settings. Not blocking since events are still visible.

### 2. Gmail API Quota

**Limitation**: Google Calendar API has daily quota limits.

**Current Usage**: ~300 requests/day (3 calendars × 3 fetches/day × 2 days ahead × 3 runs)

**Mitigation**: Caching reduces regeneration frequency.

### 3. Multi-Day Event Deduplication

**Edge Case**: If Gmail and Outlook have slightly different start/end dates for the same multi-day event, they won't deduplicate.

**Status**: Rare occurrence, acceptable trade-off.

### 4. Past Events

**Current Behavior**: Only generates briefings for today + 1 day ahead.

**Future Enhancement**: Could add "Yesterday" section or expand range.

---

## Testing Strategy

### Manual Test Cases

**Timezone Tests**:
```
✓ Event at 11:00 PM ET on Oct 12 appears on Oct 12 (not Oct 13)
✓ Event at 1:00 AM ET on Oct 13 appears on Oct 13 (not Oct 12)
✓ All-day event on Oct 12 appears on Oct 12 only
```

**Multi-Day Event Tests**:
```
✓ "Teddy in town" (Oct 9-14) appears on Oct 9, 10, 11, 12, 13 (not Oct 8 or 14)
✓ "Lexie visit" (Oct 12-14) appears on Oct 12, 13 (not Oct 11 or 14)
```

**Deduplication Tests**:
```
✓ Gmail + Outlook event with same title & time → 1 event shown
✓ Gmail + Outlook event with different times → 2 events shown (correct)
✓ Outlook event preferred over Gmail event in deduplication
```

### Diagnostic Scripts

**Location**: `/backend/*.js`

- `check-duplicate-times.js` - Analyze duplicate events and their timestamps
- `list-gmail-oct13.js` - List all Gmail events for a specific date
- `analyze-oct13.js` - Comprehensive analysis of events, duplicates, and timezone issues

---

## Maintenance & Operations

### Monitoring

**Key Metrics to Watch**:
- Brief generation success rate (should be ~100%)
- Event count per day (typical: 10-20 events)
- Duplicate count (should be minimal after fixes)
- AI briefing generation time (typical: 2-5 seconds per event)

### Logs

**Brief Generation Logs**:
```
📅 Brief generation job starting...
  📆 Processing 2025-10-13...
  📅 Fetching Google Calendar events...
    ✅ Fetched 13 Google Calendar events
  📅 Fetching Outlook events for 2025-10-13...
    ✅ Fetched 8 Outlook events
     Sources: 13 Google + 8 Outlook
     📊 Total after filtering: 13 events
     ♻️  Cached briefings: 10
     🆕 Need generation: 3
✅ Brief generation complete: 26 events processed
```

### Troubleshooting

**Events appear on wrong date**:
1. Check timezone calculations in `/backend/routes/calendar.js`
2. Verify `eventOccursOnDate()` logic in `calendar-normalizer.js`
3. Check database for stored event timestamps

**Duplicate events showing**:
1. Run `check-duplicate-times.js` to analyze
2. Verify timestamp normalization in `deduplicateEvents()`
3. Check if events have different times (may not be duplicates)

**Missing events**:
1. Check Google Calendar API quotas
2. Verify calendar IDs are correct
3. Check `filterEventsByDate()` isn't excluding valid events
4. Review Google Drive for Outlook calendar JSON files

**AI briefings not generating**:
1. Check Claude API key and quotas
2. Review rate limiting delays
3. Check vault search results (may have no context)

---

## Future Enhancements

### Short Term
- [ ] Add "Yesterday" section for reference
- [ ] Expand to 3-4 days ahead
- [ ] Add event edit/delete functionality
- [ ] Improve AI briefing quality with better prompts

### Long Term
- [ ] Real-time calendar sync (webhooks instead of polling)
- [ ] Custom event categories beyond projects
- [ ] Meeting preparation checklist generation
- [ ] Integration with email context
- [ ] Automatic meeting notes generation

---

## References

### Key Files

**Backend**:
- `/backend/routes/calendar.js` - API endpoint
- `/backend/services/google-calendar.js` - Google Calendar integration
- `/backend/services/outlook-calendar.js` - Outlook integration via Google Drive
- `/backend/services/calendar-normalizer.js` - Event normalization, deduplication, filtering
- `/backend/services/event-briefing.js` - AI briefing generation
- `/backend/services/project-detector.js` - Project detection and enrichment
- `/backend/jobs/generate-briefings.js` - Scheduled brief generation job

**Frontend**:
- `/frontend/app/brief/page.tsx` - Brief page UI
- `/frontend/lib/hooks.ts` - useBrief hook for data fetching

### External Dependencies

- `googleapis` - Google Calendar API client
- `node-cron` - Job scheduling
- `@supabase/supabase-js` - Database client
- Anthropic Claude API - AI briefing generation

---

**Document Version**: 1.0
**Last Reviewed**: October 13, 2025
**Next Review**: November 2025
