# Duplicate Task Issue - Root Cause Analysis

**Date:** 2025-10-12
**Issue:** Tasks being created as duplicates despite duplicate detection logic

## Problem

Multiple instances of the same task being created:
- "Set up Hechostudios Okta account" - 9 copies
- "Add credits to Claude API account" - 17+ copies
- "Send old iPhone to Pa" - 17+ copies

## Root Cause: TWO Separate Code Paths

The system has **two different places** that create tasks, each with its own duplicate detection:

### 1. Email Processor (`services/data-processor.js`)
**Used for:** Processing emails via jobs (OneDrive, GDrive polling)

**Duplicate Detection:**
- ✅ Checks 90% similarity
- ✅ Checks ALL statuses (pending, active, dismissed, complete)
- ✅ Works across projects
- ✅ **NOW HAS** comprehensive logging

**Problem:** This code path was rarely used, so the logging additions didn't catch the duplicates

---

### 2. Vault Watcher (`watchers/vault-watcher.js`)
**Used for:** Processing new/changed files in Obsidian vault (including email notes created by gmail-scanner)

**Original Duplicate Detection (BROKEN):**
- ❌ Only checked **exact matches** (no similarity calculation)
- ❌ Only checked tasks with **same project_id**
- ❌ Did NOT check **dismissed** tasks
- ❌ Only checked completed tasks from last 7 days
- ❌ **NO LOGGING**

**Fixed Duplicate Detection:**
- ✅ Now uses same 90% similarity algorithm
- ✅ Checks ALL statuses (pending, active, dismissed, complete)
- ✅ Searches all tasks (not just same project)
- ✅ Comprehensive logging

---

## The Flow That Created Duplicates

```
Gmail Scanner (jobs/gmail-scanner.js)
  ↓
Creates email note file in Obsidian
  ↓
Vault Watcher detects new file
  ↓
Analyzes file with AI
  ↓
Creates tasks with BROKEN duplicate detection ❌
  ↓
DUPLICATES CREATED
```

## Why The Logging Didn't Show It

- We added logging to `data-processor.js`
- But tasks were being created via `vault-watcher.js`
- Vault watcher had NO logging, so duplicates were silent

## The Fix

**File:** `watchers/vault-watcher.js`

**Changes:**
1. Replaced simple exact-match duplicate detection with full similarity algorithm
2. Added comprehensive logging (same format as data-processor)
3. Now checks ALL task statuses (not just pending/active/complete)
4. Removed project_id restriction (checks across all projects)

**Code Updated:**
- Line 254-316: Complete rewrite of `isDuplicateTask()` method
- Now matches the logic in `data-processor.js`

## Additional Fix

**File:** `watchers/vault-watcher.js` (delegated tasks)

**Problem:** Tasks delegated to others (e.g., Jack's poetry) were showing in your pending list

**Fix:** Changed delegated task status from `'pending'` to `'dismissed'`
- Line 458: `status: 'dismissed'` (was `'pending'`)

## Testing

Next time a duplicate is attempted, you'll see logs like:

```
🔍 [VAULT WATCHER DUPLICATE CHECK] Starting for: "Set up Hechostudios Okta account"
   📊 Found 8 existing tasks in time window
   🎯 DUPLICATE FOUND!
      Similarity: 100.0%
      Existing task: "Set up Hechostudios Okta account"
      Status: dismissed
```

## Monitoring

Check logs:
```bash
# See vault watcher duplicate checks
grep "VAULT WATCHER DUPLICATE CHECK" combined.log | tail -20

# See all duplicate checks (both code paths)
grep "DUPLICATE CHECK" combined.log | tail -20
```

## Files Changed

1. ✅ `services/data-processor.js` - Added logging (earlier session)
2. ✅ `watchers/vault-watcher.js` - Fixed duplicate detection + added logging
3. ✅ `watchers/vault-watcher.js` - Fixed delegated tasks status

## Expected Behavior Going Forward

- ✅ Duplicates should be caught immediately
- ✅ Detailed logs will show WHY a task was/wasn't blocked
- ✅ Delegated tasks won't clutter your pending list
- ✅ Both code paths now use the same robust duplicate detection
