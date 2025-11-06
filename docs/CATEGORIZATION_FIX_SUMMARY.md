# Event Categorization Fix - Implementation Summary

**Status:** Phase 1 Complete - Awaiting Migration + Project Categorization
**Date:** 2025-10-16

---

## Problem Identified

Events were being miscategorized between Work and Life sections:
- "Growth Diagnosis" and "Nuveen" (work meetings) showing as Life events
- "Insurance" (personal appointment) showing as Work event

### Root Causes

1. **Imported Outlook calendars miscategorized as Google**
   - Imported calendars have organizer emails like `fv18afmp4k955cpl6jgb1gu21a7c6khm@import.calendar.google.com`
   - These were being tagged as 'Google' instead of 'Outlook'

2. **Oversimplified categorization logic**
   - Current: "Has project = Work, No project = Life"
   - Problem: Doesn't account for personal appointments on work calendar

3. **Projects table missing context field**
   - No way to mark if a project is Work or Life context

---

## Phase 1: Fixes Implemented ✅

### 1. Fixed Calendar Source Detection

**File:** `backend/services/calendar-normalizer.js` (lines 101-123)

**Change:** Added detection for imported Outlook calendars
```javascript
function normalizeGoogleEvent(googleEvent) {
  // Detect imported Outlook calendars
  const organizerEmail = googleEvent.organizer?.email || '';
  const isImportedOutlook = organizerEmail.includes('@import.calendar.google.com');

  return {
    // ... other fields
    calendar_category: isImportedOutlook ? 'Outlook' : 'Google',
  };
}
```

**Impact:**
- Growth Diagnosis, Nuveen, and other work meetings from imported Outlook will now be correctly tagged as 'Outlook'
- Native Gmail events (personal) will remain tagged as 'Google'

### 2. Created Database Migration

**File:** `backend/db/migration_008_add_project_context.sql`

Adds `context` column to projects table:
- Values: 'Work' or 'Life'
- Default: 'Work'
- Indexed for performance

### 3. Created Helper Scripts

- **`list-all-projects.js`** - Lists all 27 projects for review
- **`update-project-contexts.js`** - Updates project contexts in bulk

---

## Phase 2: Next Steps (User Action Required)

### Step 1: Run Database Migration

**IMPORTANT:** You must run this migration before proceeding.

1. Go to Supabase Dashboard: https://supabase.com/dashboard
2. Select your project → **SQL Editor**
3. Open file: `backend/db/migration_008_add_project_context.sql`
4. Copy contents → Paste into SQL Editor → **Run**

**Expected output:**
```
NOTICE: Migration 008: Context field added to projects table successfully!
```

### Step 2: Categorize All 27 Projects

Review the project list below and identify which are **Work** vs **Life**:

```
WORK PROJECTS (examples - update based on your actual usage):
- 72andSunny
- Baileys
- CAVA
- Global Strategy
- Growth Diagnosis
- ITA Airlines
- Nuveen
- Popsockets
- Therabody
- TIAA
- Wasa
- Yankee Candle

LIFE PROJECTS (examples - update based on your actual usage):
- A Thankful Life
- Admin
- Cars
- Claude Code
- Eldercare
- Finance
- Fitness
- Grid Kings
- Healthcare
- Insurance
- Kaya
- Misc
- Playbook
- School
- Trivia
```

### Step 3: Update Project Contexts Script

Edit `backend/update-project-contexts.js` and fill in the `PROJECT_CONTEXTS` map:

```javascript
const PROJECT_CONTEXTS = {
  // WORK
  'Nuveen': 'Work',
  'Growth Diagnosis': 'Work',
  'Baileys': 'Work',
  // ... add all work projects

  // LIFE
  'Insurance': 'Life',
  'Finance': 'Life',
  'Healthcare': 'Life',
  // ... add all life projects
};
```

### Step 4: Run Update Script

```bash
cd backend
node update-project-contexts.js
```

This will set the context for all projects in the database.

---

## Phase 3: Implement Categorization Logic (After Steps 1-4)

### Proposed Logic (Per User Request)

```
Priority order:
1. Gmail calendar (native, not imported) → Life (always)
   - Rationale: No work events on Gmail as a rule

2. Outlook + attendees → Work (almost always)
   - Rationale: Meetings with other people are work

3. Outlook + no attendees → Check project context
   - If project.context = 'Life' → Life
   - If project.context = 'Work' → Work
   - If no project assigned → Life (default)
```

### Implementation Location

**File:** `frontend/app/brief/page.tsx` (lines 618-621)

**Current (INCORRECT):**
```typescript
const workEvents = visibleEvents.filter((e: any) => e.project_name)
const lifeEvents = visibleEvents.filter((e: any) => !e.project_name)
```

**New (TO BE IMPLEMENTED):**
```typescript
const workEvents = visibleEvents.filter((e: any) => {
  // Rule 1: Native Gmail calendar = Life (always)
  if (e.calendar_category === 'Google') {
    return false; // Goes to Life
  }

  // Rule 2: Outlook + attendees = Work
  if (e.calendar_category === 'Outlook' && e.attendees?.length > 0) {
    return true; // Goes to Work
  }

  // Rule 3: Outlook + no attendees = Check project context
  if (e.calendar_category === 'Outlook') {
    if (e.project_context === 'Work') return true;
    if (e.project_context === 'Life') return false;
    return false; // Default to Life if no project
  }

  return false; // Default to Life
});

const lifeEvents = visibleEvents.filter((e: any) => !workEvents.includes(e));
```

### Data Flow Requirements

Events need to include `project_context` field from the projects table.

**Current enrichment:** `backend/services/briefing-generator.js` (lines ~200-250)
- Already joins events with projects
- Need to ensure `context` field is included in the join

---

## Phase 4: Testing Plan

### Test Cases

1. **Native Gmail Event (no attendees, no project)**
   - Expected: Life section

2. **Native Gmail Event (with project)**
   - Expected: Life section (Gmail always = Life per user rule)

3. **Outlook Event (with attendees)**
   - Expected: Work section (regardless of project)

4. **Outlook Event (no attendees, Work project)**
   - Example: "Growth Diagnosis" meeting
   - Expected: Work section

5. **Outlook Event (no attendees, Life project)**
   - Example: "Insurance" appointment
   - Expected: Life section

6. **Imported Outlook in Gmail (with attendees)**
   - Example: "Growth Diagnosis" from `@import.calendar.google.com`
   - Expected: Work section (treated as Outlook)

---

## Files Modified

### Created
- `backend/db/migration_008_add_project_context.sql`
- `backend/list-all-projects.js`
- `backend/update-project-contexts.js`
- `backend/CATEGORIZATION_FIX_SUMMARY.md` (this file)

### Modified
- `backend/services/calendar-normalizer.js` (lines 101-123)

### To Be Modified (Phase 3)
- `frontend/app/brief/page.tsx` (lines 618-621)
- `backend/services/briefing-generator.js` (verify context field inclusion)

---

## Current Status

✅ **Complete:**
- Calendar source detection fixed
- Migration file created
- Helper scripts created
- All 27 projects listed

⏳ **Waiting For:**
- User to run migration in Supabase
- User to categorize 27 projects as Work/Life
- User to update and run update-project-contexts.js

❌ **Not Started:**
- Update categorization logic in brief/page.tsx
- Verify project context in briefing enrichment
- Test all categorization scenarios

---

## Quick Start Checklist

- [ ] Run `migration_008_add_project_context.sql` in Supabase
- [ ] Review 27 projects and determine Work vs Life
- [ ] Edit `update-project-contexts.js` with categorizations
- [ ] Run `node update-project-contexts.js`
- [ ] Confirm with me - I'll implement Phase 3 categorization logic
- [ ] Restart backend server
- [ ] Test event categorization on Brief page

---

**Questions or issues?** Let me know which projects are Work vs Life, and I'll update the script and implement the categorization logic.
