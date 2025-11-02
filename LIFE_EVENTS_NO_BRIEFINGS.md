# Life Events - No Briefings (Cost Savings)

**Status:** ✅ Implemented
**Date:** 2025-10-17

---

## What Changed

AI briefings are now **only generated for Work events**, not Life events. This saves on API costs.

---

## Categorization Logic

Events are categorized using the same logic as the frontend:

### Work Events (GET BRIEFINGS)
1. **Outlook + attendees** → Work
2. **Outlook + no attendees + Work project** → Work
3. **Outlook + no attendees + no project** → Work (default)

### Life Events (NO BRIEFINGS)
1. **Gmail (native)** → Life (always)
2. **Outlook + no attendees + Life project** → Life

---

## Code Changes

**File:** `backend/jobs/generate-briefings.js`

**Lines 123-183:** Added categorization logic before briefing generation

```javascript
// Categorize events into Work and Life
const isWorkEvent = (event) => {
  if (event.calendar_category === 'Google') return false;
  if (event.calendar_category === 'Outlook' && event.attendees?.length > 0) return true;
  if (event.calendar_category === 'Outlook') {
    if (event.project_work_life_context === 'Life') return false;
    return true;
  }
  return false;
};

const workEvents = dayEvents.filter(isWorkEvent);
const lifeEvents = dayEvents.filter(e => !isWorkEvent(e));

// Only generate briefings for Work events
const eventsNeedingBriefings = workEvents.filter(e => !cachedBriefingsMap.has(e.id));
```

---

## Performance Impact

**Before:** ~90 seconds to generate briefings (all events)
**After:** ~19 seconds to generate briefings (Work events only)

**Improvement:** ~79% faster, ~50% fewer API calls (assuming roughly equal Work/Life split)

---

## Frontend Behavior

- **Work events:** Display with AI briefings (blue border)
- **Life events:** Display without briefings (yellow border)
- No visual indication that briefings are disabled for Life events
- Life events still show all other info (time, location, attendees, etc.)

---

## Cost Savings Estimate

Assuming:
- ~13 events per day (current average)
- ~50% are Life events (6-7 events)
- $0.01 per briefing (rough estimate)

**Daily savings:** ~$0.06-0.07
**Monthly savings:** ~$1.80-2.10
**Annual savings:** ~$21.60-25.20

Plus reduced token usage and faster page loads.

---

## Re-enabling Life Event Briefings

If you want to re-enable briefings for Life events in the future:

1. Open `backend/jobs/generate-briefings.js`
2. Find line 152: `const eventsNeedingBriefings = workEvents.filter(...)`
3. Change to: `const eventsNeedingBriefings = dayEvents.filter(...)`
4. Find line 169: `if (!isWorkEvent(event)) return event;`
5. Remove or comment out lines 169-171
6. Regenerate briefings: `node fix-todays-briefings.js && curl -X POST http://localhost:3001/api/generate-briefings-now`

---

## Testing

✅ Tested on 2025-10-17:
- 13 total events
- Work events: Received briefings
- Life events: No briefings generated
- Generation time: ~19 seconds (previously ~90 seconds)
- Frontend displays both event types correctly

---

**Questions or issues?** Check backend console logs for categorization output:
```
📊 Categorization: X Work, Y Life
💡 Only generating briefings for Work events (cost savings)
```
