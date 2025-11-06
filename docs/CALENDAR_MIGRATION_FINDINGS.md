# Calendar Events Migration Investigation

**Date:** October 29, 2025
**Status:** Investigation Complete - Ready for Migration
**Purpose:** Understand differences between `calendar_events` (old) and `events` (Phase 2)

---

## 🔍 Executive Summary

The system currently has **TWO separate event tables** with significant overlap but different data sources:

- **`calendar_events`**: 139 records (Outlook + Google, recent 3 weeks)
- **`events`**: 76 records (Google only, historical 18+ months)

**Critical Finding:** The Phase 2 `events` table is **missing all Outlook calendar events** (119 events). Only Google events (76) were migrated during Phase 2 implementation.

---

## 📊 Detailed Analysis

### Record Counts
```
calendar_events: 139 records
events:          76 records
Missing:         63 records (45%)
```

### Data Source Breakdown

**calendar_events:**
- Outlook: 119 events (86%)
- Google: 20 events (14%)
- Total: 139 events

**events:**
- Google: 76 events (100%)
- Outlook: 0 events (0%)
- Total: 76 events

**Finding:** The 63 missing records are primarily Outlook events that were never migrated to Phase 2.

### Content Overlap

- **Title matches:** 86 out of 139 (62%)
- **Match rate:** 62% overlap between tables
- **Sample matches:**
  - "ITA Airways: Check-in"
  - "ADK introduction"
  - "Baileys Final Regroup"
  - "Baileys BBI - F&B"

**Finding:** Significant overlap exists, but 38% of events in calendar_events are unique (not in events table).

### Time Distribution

**calendar_events:**
- Event date range: October 9-30, 2025 (3 weeks)
- Created: October 23, 2025
- Future events: 9
- Past/current: 130

**events:**
- Event date range: January 11, 2024 - October 30, 2025 (18+ months)
- Created: October 29, 2025
- Future events: 4
- Past/current: 72

**Finding:** calendar_events contains recent/current data from active calendar syncing, while events contains historical data accumulated over time.

### Project Associations

- calendar_events with project_id: 32/139 (23%)
- events with project_id: 26/76 (34%)

**Finding:** Both tables have project associations, but events has higher percentage of project-linked events.

---

## 📐 Schema Differences

### calendar_events Schema
```javascript
{
  id: uuid,
  external_id: string,
  source: "outlook" | "google",
  summary: string,
  start: { dateTime: string, timeZone: string } | { date: string },
  end: { dateTime: string, timeZone: string } | { date: string },
  description: string,
  location: string,
  attendees: array,
  is_all_day: boolean,
  project_id: uuid,
  project_name: string,
  project_color: string,
  project_work_life_context: "Work" | "Life",
  ai_briefing: string,
  calendar_category: "Google" | "Outlook",
  enriched_attendees: array,
  created_at: timestamp,
  updated_at: timestamp,
  last_synced_at: timestamp
}
```

**Unique Features:**
- Denormalized project data (name, color, context)
- `enriched_attendees` field
- `calendar_category` for UI display
- `ai_briefing` for generated summaries
- Complex start/end objects with timezone support

### events Schema (Phase 2)
```javascript
{
  id: uuid,
  project_id: uuid,
  title: string,
  start_time: timestamp,
  end_time: timestamp,
  location: string,
  attendees: jsonb, // with LinkedIn enrichment
  description: text,
  calendar_source: "google" | "outlook",
  calendar_id: string,
  briefing: text,
  briefing_type: string,
  category: string,
  created_at: timestamp,
  updated_at: timestamp
}
```

**Unique Features:**
- Normalized design (project data via foreign key)
- `briefing` and `briefing_type` for Phase 2 intelligence
- Simple timestamp fields for start/end
- `calendar_id` for external reference
- Attendees with enriched LinkedIn data

---

## 🎯 Field Mapping for Migration

```
calendar_events         →  events (Phase 2)
-----------------          ----------------
summary                 →  title
start (object)          →  start_time (timestamp)
end (object)            →  end_time (timestamp)
external_id             →  calendar_id
source                  →  calendar_source
description             →  description
location                →  location
attendees               →  attendees (needs enrichment)
project_id              →  project_id
ai_briefing             →  briefing
calendar_category       →  (derive from calendar_source)
```

**Data Transformations Needed:**
1. **Start/End Objects → Timestamps**: Parse `{ dateTime, timeZone }` or `{ date }` → ISO timestamp
2. **Attendees**: Preserve structure, add LinkedIn enrichment if available
3. **AI Briefing**: Map to `briefing` field with appropriate `briefing_type`
4. **Project Context**: Lose denormalized fields (name, color, context) - fetch via foreign key

---

## ⚠️ Migration Risks

1. **Duplicate Events**: 62% overlap means we need upsert logic to avoid duplicates
2. **Data Loss**: calendar_events has fields that don't exist in events (project_name, project_color, enriched_attendees)
3. **Timezone Handling**: Start/end objects have explicit timezone info that must be preserved
4. **All-Day Events**: `is_all_day` field exists in calendar_events but not in events
5. **Active Syncing**: calendar_events may be actively updated by calendar sync processes

---

## 💡 Migration Strategy

### Phase 1: Prepare Migration Script
```javascript
// For each event in calendar_events:
// 1. Check if event already exists in events (by title + start_time)
// 2. If not exists, INSERT with field mapping
// 3. If exists, UPDATE only if calendar_events is newer
// 4. Handle timezone conversion for start/end
// 5. Preserve attendee data structure
```

### Phase 2: Execute Migration
```bash
node backend/migrations/migrate-calendar-to-events.js
```

### Phase 3: Update Routes
```javascript
// backend/routes/calendar.js
// Change FROM:
.from('calendar_events')

// Change TO:
.from('events')
```

### Phase 4: Test in Parallel
- Keep both tables during testing
- Verify brief page loads correctly
- Ensure no data loss
- Check that Outlook events appear

### Phase 5: Deprecate calendar_events
- Once verified, stop syncing to calendar_events
- Update all calendar sync processes to write to events
- Eventually drop calendar_events table

---

## 🚨 Critical Considerations

### Why This Investigation Was Necessary

**If we had migrated blindly:**
- ❌ Would have lost 119 Outlook events (86% of calendar_events data)
- ❌ Brief page would only show Google events
- ❌ Users would lose visibility into work calendar (mostly Outlook)
- ❌ Calendar routes would return incomplete data

**By investigating first:**
- ✅ Identified missing Outlook events
- ✅ Understood schema differences
- ✅ Can preserve all data during migration
- ✅ Can create proper field mapping
- ✅ Can handle timezone conversions correctly

### Current System State

**As of October 29, 2025:**
- Calendar routes (`/api/calendar/brief`) query `calendar_events` table
- Frontend brief page receives data from `calendar_events`
- This is **working correctly** and includes both Outlook + Google events
- Switching to `events` table without migration would **break the brief page**

---

## 📋 Next Steps

1. ✅ **Investigation Complete** (this document)
2. ⏳ **Create Migration Script** - Write `migrate-calendar-to-events.js`
3. ⏳ **Run Migration** - Execute script to move data
4. ⏳ **Update Routes** - Change calendar.js to query from events
5. ⏳ **Test Thoroughly** - Verify brief page with both data sources
6. ⏳ **Deploy to Railway** - Push changes to production
7. ⏳ **Update Calendar Sync** - Point sync processes to events table
8. ⏳ **Monitor** - Ensure no data loss or issues
9. ⏳ **Deprecate** - Remove calendar_events once stable

---

## 📁 Related Files

- `backend/routes/calendar.js:70` - Currently queries calendar_events
- `backend/services/google-calendar.js` - Google Calendar sync service
- `backend/migrations/migration_009_three_entity_architecture.sql` - Created events table
- `backend/compare-event-tables.js` - Initial comparison script
- `backend/analyze-event-migration.js` - Detailed analysis script (this data)

---

**Conclusion:** Migration is feasible and necessary to complete Phase 2 architecture, but must be done carefully to preserve all Outlook events and handle schema differences correctly.
