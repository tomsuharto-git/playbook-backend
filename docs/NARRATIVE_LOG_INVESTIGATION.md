# Narrative Log Investigation

## Problem Discovered

**ITA Airlines meeting notes from Oct 13 and Oct 15 did NOT generate narrative logs**, even though they contain rich project context that should be surfaced in briefings.

## Current System Analysis

### Where Narrative Logs ARE Created

**1. Gmail Scanner** (`backend/jobs/gmail-scanner.js`)
- **Function**: `updateProjectNarrative()` (lines 325-388)
- **Trigger**: Runs 3x daily (6am, 12pm, 6pm)
- **Process**:
  1. Scans Gmail for project-related emails
  2. Uses AI to analyze email content
  3. Creates narrative entries with format:
     ```json
     {
       "date": "2025-10-09",
       "headline": "Brief summary",
       "bullets": ["Detail 1", "Detail 2", "Detail 3"],
       "source": "email"
     }
     ```
  4. Prepends new entries to `projects.narrative` array
  5. Keeps last 50 entries
- **Status**: ✅ WORKING (ITA has 50 email-based narrative logs from Oct 9)

### Where Narrative Logs ARE NOT Created

**2. Vault Watcher** (`backend/watchers/vault-watcher.js`)
- **Function**: Monitors Obsidian vault for new/modified markdown files
- **Trigger**: Real-time file system watcher
- **Process**:
  1. Detects new .md files in watched folders
  2. Calls `analyzeMeetingNote()` from `backend/ai/meeting-analyzer.js`
  3. **PROBLEM**: Only extracts tasks and project_updates
  4. **MISSING**: Does NOT create narrative log entries
- **Status**: ❌ NOT CREATING NARRATIVE LOGS

**3. Meeting Analyzer** (`backend/ai/meeting-analyzer.js`)
- **Function**: AI analysis of meeting notes
- **Returns**:
  ```json
  {
    "tasks": [...],
    "team_objectives": [...],
    "delegated_tasks": [...],
    "completed_tasks": [...],
    "blocked_tasks": [...],
    "project_updates": {
      "status_change": "...",
      "progress_notes": "...",
      "next_milestone": "..."
    }
  }
  ```
- **PROBLEM**: The `project_updates` object is NOT converted into narrative log entries
- **Status**: ❌ MISSING NARRATIVE LOG GENERATION

## Root Cause

The vault watcher processes meeting notes BUT:
1. ❌ Does not call `updateProjectNarrative()`
2. ❌ Does not convert `project_updates` into narrative log format
3. ❌ Does not append to `projects.narrative` array

**Result**: Oct 13 and Oct 15 ITA meeting notes exist in your vault but are NOT in the database narrative logs, so they don't appear in briefing context.

## Solution Required

### Option 1: Enhance Meeting Analyzer (RECOMMENDED)
**Update `analyzeMeetingNote()` to return narrative-ready data:**

```javascript
// Add to meeting-analyzer.js return value
{
  "tasks": [...],
  "project_updates": {...},
  "narrative": {  // NEW
    "headline": "Brief 1-line summary of meeting",
    "bullets": [
      "Key point 1",
      "Key point 2",
      "Key point 3"
    ]
  }
}
```

### Option 2: Update Vault Watcher
**Add narrative log creation after meeting analysis:**

```javascript
// In vault-watcher.js after analyzeMeetingNote()
if (analysis.project_updates) {
  const narrative = {
    headline: analysis.project_updates.next_milestone || "Project update",
    bullets: [
      analysis.project_updates.status_change,
      analysis.project_updates.progress_notes
    ].filter(Boolean)
  };

  await updateProjectNarrative(projectId, narrative, date, 'meeting');
}
```

## Files to Modify

1. **`backend/ai/meeting-analyzer.js`**
   - Add narrative generation to AI prompt
   - Include `narrative` in return object

2. **`backend/watchers/vault-watcher.js`**
   - Import `updateProjectNarrative` from gmail-scanner.js
   - Call it after meeting analysis
   - Pass narrative data to database

3. **`backend/jobs/gmail-scanner.js`**
   - Export `updateProjectNarrative` function
   - Make it reusable for both email and meeting sources

## Expected Behavior After Fix

When you create a meeting note like:
```markdown
# ITA Airways Check-In
Date: Oct 15

- Team collaboration on three creative territories
- "Italy happens within you" concept explored
- November 3/4 first client meeting scheduled
```

The system should:
1. ✅ Detect the new file (vault-watcher)
2. ✅ Analyze content (meeting-analyzer)
3. ✅ Extract narrative summary
4. ✅ Create narrative log entry:
   ```json
   {
     "date": "2025-10-15",
     "headline": "Team collaboration on three creative territories explored",
     "bullets": [
       "Team collaboration on three creative territories",
       "Italy happens within you concept explored",
       "November 3/4 first client meeting scheduled"
     ],
     "source": "meeting"
   }
   ```
5. ✅ Append to `projects.narrative` in database
6. ✅ Include in next briefing generation

## Impact

**Current**: Briefings only use email-based narratives (Oct 9) + vault keyword search
**After Fix**: Briefings will use email narratives + meeting note narratives (Oct 13, Oct 15, future meetings)

**Benefit**: More accurate, comprehensive briefing context that includes recent strategic discussions and creative development.
