# Duplicate Detection Logging

## Overview

Comprehensive logging has been added to the duplicate detection system to help debug why tasks are being created when they shouldn't be.

## Log Format

The logging follows a hierarchical format with clear markers:

### Email Processing
```
📧 [EMAIL PROCESSOR] Starting for 2025-10-12
   Total emails: 5
   Active projects: 12
   🤖 Sending emails to AI for analysis...
   📊 AI returned 3 email analyses

   📨 Processing email: "Hechostudios Account Setup"
      From: admin@hechostudios.com
      Project: Hecho Studios
      🎯 Found 1 potential task(s)

      📋 Task: "Set up Hechostudios Okta account"
         Confidence: 0.95
```

### Task Creation
```
📝 [CREATE TASK] Attempting to create: "Set up Hechostudios Okta account"
   Source: email:AAMkAGY0MDI5OG...
   Priority: normal
   Confidence: 0.9
```

### Duplicate Check
```
🔍 [DUPLICATE CHECK] Starting for: "Set up Hechostudios Okta account"
   Project ID: 43c7a555-fe72-4dba-bc95-24f0aa51af08
   Time window: 2025-10-05T10:10:44.901Z to now
   📊 Found 8 existing tasks in time window
```

**If duplicate found:**
```
   🎯 DUPLICATE FOUND!
      Similarity: 100.0%
      Existing task: "Set up Hechostudios Okta account"
      Status: dismissed
      Created: 2025-10-11T03:41:29.716339
   ⏱️  Duration: 45ms

⏭️  [SKIPPED] Task blocked by duplicate detection: "Set up Hechostudios Okta account"
```

**If no duplicate found:**
```
   ✅ No duplicates found
   📍 Closest match: "Complete Hechostudios Okta account setup" (80.0% similar, status: dismissed)
   ⏱️  Duration: 52ms

   💾 Inserting into database...
✅ [SUCCESS] Created task: "Set up Hechostudios Okta account"
   Task ID: 133ed9dc-585e-4dd6-addf-10cb94a0ce67
   Status: pending
```

### Final Summary
```
✅ [EMAIL PROCESSOR] Complete
   Emails analyzed: 5
   Tasks created: 2
   Tasks skipped: 1
```

## What to Look For

### Problem: Task created when it shouldn't be

1. **Check if duplicate detection ran:**
   - Look for `🔍 [DUPLICATE CHECK]` in logs
   - If missing, the function wasn't called at all

2. **Check what was found:**
   - Look at `📊 Found X existing tasks in time window`
   - If 0, no tasks exist in the 7-day window

3. **Check similarity scores:**
   - Look for similarity percentages
   - Tasks with >90% similarity should be blocked
   - Check the "Closest match" line to see what was found

4. **Check database errors:**
   - Look for `❌ Database error during duplicate check`
   - This indicates a Supabase query failure

### Problem: Task NOT created when it should be

1. **Check confidence:**
   - Look for `Confidence: X` in the task log
   - Tasks with <0.9 confidence are skipped

2. **Check if it was blocked:**
   - Look for `⏭️  [SKIPPED] Task blocked by duplicate detection`
   - Review the similarity score - might be a false positive

3. **Check for database errors:**
   - Look for `❌ Failed to create task`

## Testing & Analysis Scripts

### 1. Test Duplicate Detection Algorithm

```bash
node test-duplicate-logging.js
```

This will:
- Test the similarity algorithm
- Show what tasks would be blocked
- Verify the logic is working correctly

### 2. Analyze Current Pending Tasks

```bash
node scripts/analyze-pending-tasks.js
```

This will:
- Show all pending tasks
- Explain why each was/wasn't blocked
- Identify duplicate groups
- Show what tasks SHOULD have been blocked

### 3. Generate Pending Task Report (Saved to File)

```bash
node scripts/log-pending-task-analysis.js
```

This will:
- Generate a complete analysis report
- Save to `logs/pending-task-analysis-[timestamp].log`
- Show statistics (duplicate rate, system failures, etc.)
- Great for keeping historical records

## Log Location

Logs are written to:
- Console output (when running manually)
- `combined.log` (when running as a service)

## Debugging Tips

1. **Search for task title:**
   ```bash
   grep "Hechostudios" combined.log
   ```

2. **Find all duplicate checks:**
   ```bash
   grep "DUPLICATE CHECK" combined.log
   ```

3. **Find all task creations:**
   ```bash
   grep "CREATE TASK" combined.log
   ```

4. **Find blocks/skips:**
   ```bash
   grep "SKIPPED" combined.log
   ```

## Known Issues

### Issue: Duplicate not detected

**Symptoms:**
- `🔍 [DUPLICATE CHECK]` runs
- Shows `📊 Found X existing tasks` (where X > 0)
- But still shows `✅ No duplicates found`
- Task gets created

**Causes:**
1. Similarity threshold too high (>90%)
2. Title normalization causing mismatch
3. Wrong status filter (not including all statuses)

**Debug:**
- Check the "Closest match" line
- Run `test-duplicate-logging.js` to verify logic
- Check if existing tasks have different statuses

### Issue: Duplicate check not running

**Symptoms:**
- No `🔍 [DUPLICATE CHECK]` log
- Task created immediately

**Causes:**
1. `createPendingTask()` not being called
2. Code path bypassing duplicate check
3. Function error occurring before log

**Debug:**
- Search for `📝 [CREATE TASK]` - should appear before each task
- Check if `processEmailData()` is running
- Look for JavaScript errors in logs

## Algorithm Details

### Similarity Calculation

The algorithm:
1. Normalizes text (lowercase, compound words)
2. Extracts significant words (>2 chars)
3. Checks for direct matches
4. Checks for synonym matches (e.g., "setup" ≈ "complete")
5. Returns: matchCount / totalUniqueWords

### Threshold

- **>90% similarity** = duplicate (task blocked)
- **≤90% similarity** = not duplicate (task created)

Examples:
- "Set up Okta account" vs "Set up Okta account" = **100%** ✅ Blocked
- "Set up Okta account" vs "Complete Okta account setup" = **80%** ❌ Not blocked
- "Set up Okta account" vs "Set up Hecho Studios Okta account" = **50%** ❌ Not blocked

### Time Window

Only checks tasks created in the **last 7 days**.

### Status Filter

Checks tasks with status:
- `pending`
- `active`
- `dismissed`
- `complete`

This prevents:
- Re-creating dismissed tasks
- Re-creating completed tasks
- Creating duplicates of pending tasks
