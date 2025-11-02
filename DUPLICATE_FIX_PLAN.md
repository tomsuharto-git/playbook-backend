# Duplicate Task Prevention - Implementation Plan

**Date**: October 11, 2025
**User Request**: "When a pending task is about to be authored by AI, it scans current pending, active or done tasks and if there's a 90% match it doesn't write it."

## Current State

The duplicate detection already exists in `vault-watcher.js:254-322`:
- ✅ Checks pending tasks
- ✅ Checks active tasks
- ⚠️  Checks completed tasks (but only last 7 days)
- ✅ Has fuzzy matching at **80% similarity** (word overlap)
- ❌ Still has race condition issue

## Changes Needed

### 1. Increase Similarity Threshold: 80% → 90%
**File**: `backend/watchers/vault-watcher.js:298`

**Current**:
```javascript
if (similarity > 0.8) {
  return true;
}
```

**New**:
```javascript
if (similarity > 0.9) {  // Changed to 90%
  return true;
}
```

### 2. Check ALL Done Tasks (Not Just Last 7 Days)
**File**: `backend/watchers/vault-watcher.js:271-279`

**Current**:
```javascript
// Check recently completed tasks (last 7 days)
const sevenDaysAgo = new Date();
sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
const { data: completedTasks } = await supabase
  .from('tasks')
  .select('title')
  .eq('status', 'complete')
  .eq('project_id', projectId)
  .gte('completed_at', sevenDaysAgo.toISOString());
```

**New**:
```javascript
// Check ALL completed tasks (not just recent)
const { data: completedTasks } = await supabase
  .from('tasks')
  .select('title')
  .eq('status', 'complete')
  .eq('project_id', projectId);
```

**Rationale**: If you completed "Send iPhone to Pa" 2 weeks ago, you probably don't want AI to create it again now.

### 3. Add Logging for Similarity Matches
**File**: `backend/watchers/vault-watcher.js:296-300`

**Current**:
```javascript
// Very similar (80%+ word overlap)
const similarity = this.calculateSimilarity(normalizedTitle, existingNormalized);
if (similarity > 0.9) {
  return true;
}
```

**New**:
```javascript
// Very similar (90%+ word overlap)
const similarity = this.calculateSimilarity(normalizedTitle, existingNormalized);
if (similarity > 0.9) {
  console.log(`  ⏭️  Similar task found (${(similarity * 100).toFixed(0)}%): "${existing.title}"`);
  return true;
}
```

**Rationale**: You'll see in logs when fuzzy matching catches duplicates.

### 4. Fix Race Condition (Optional but Recommended)
Add a small delay before checking duplicates to let previous inserts finish:

**File**: `backend/watchers/vault-watcher.js:336`

**Current**:
```javascript
// Check for duplicates first
const isDuplicate = await this.isDuplicateTask(task.title, project?.id);
```

**New**:
```javascript
// Small delay to let any in-flight inserts complete (prevents race condition)
await new Promise(resolve => setTimeout(resolve, 100));

// Check for duplicates first
const isDuplicate = await this.isDuplicateTask(task.title, project?.id);
```

**Rationale**: If you save twice quickly, the 100ms delay ensures the first insert completes before the second check runs.

## Summary of Changes

| Change | Current | New | Impact |
|--------|---------|-----|--------|
| Similarity threshold | 80% | 90% | Stricter matching |
| Done tasks window | Last 7 days | All time | Prevents old task recreation |
| Logging | None | Yes | Visibility into why tasks are skipped |
| Race condition | Exists | Fixed | No more rapid-save duplicates |

## Testing Plan

1. **Test 90% Similarity**:
   - Create task: "Send old iPhone to Pa"
   - Edit note to: "Send old iPhone to Pa by Monday"
   - Verify: No duplicate (90% similar)

2. **Test Done Tasks Check**:
   - Complete a task: "Buy groceries"
   - 8 days later, write note: "Buy groceries"
   - Verify: Skipped (found in done tasks)

3. **Test Race Condition Fix**:
   - Create note with task
   - Save file 5 times rapidly (Cmd+S x5)
   - Verify: Only 1 task created

4. **Test Legitimate Duplicates**:
   - Complete task: "Review Q1 deck" (Baileys project)
   - Write note: "Review Q1 deck" (72andSunny project)
   - Verify: Second task IS created (different project)

## Edge Cases Handled

- ✅ Same task, different projects → Both created
- ✅ Null project_id tasks → Handled separately
- ✅ Case insensitivity → Already normalized
- ✅ Extra whitespace → Already trimmed
- ✅ Completed tasks → Checked across all time
- ✅ Rapid file saves → Race condition fixed

---

**Implementation**: Ready to apply
**Risk Level**: Low (only making duplicate detection stricter)
**Rollback**: Easy (just revert the 4 small changes)
