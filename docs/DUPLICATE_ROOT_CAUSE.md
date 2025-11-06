# Root Cause Analysis: Duplicate AI-Detected Tasks

**Date**: October 11, 2025
**Status**: Identified - Needs Fix

## The Bug

**Location**: `backend/watchers/vault-watcher.js:176-179`

```javascript
async handleFileChange(filepath) {
  console.log(`📝 File changed: ${path.basename(filepath)}`);
  await this.handleNewFile(filepath);  // ❌ RE-ANALYZES ENTIRE FILE
}
```

## What's Happening

1. ✅ User creates note with task: "Send old iPhone to Pa"
2. ✅ AI analyzes note → Detects task → Creates in database
3. ✅ User edits note (adds deadline, fixes typo, etc.)
4. ❌ File `change` event fires
5. ❌ `handleFileChange()` calls `handleNewFile()`
6. ❌ **Entire file is re-analyzed from scratch**
7. ❌ AI detects same task again
8. ❌ Tries to create duplicate task

## Why Duplicate Detection Fails

The `isDuplicateTask()` function DOES run, but fails due to **race conditions**:

###Scenario A: Database Transaction Timing
```
T=0ms   : First analysis starts
T=100ms : First duplicate check → No tasks found → OK to create
T=200ms : File edited by user
T=250ms : Second analysis starts
T=350ms : Second duplicate check → First task not inserted yet → OK to create
T=400ms : First task inserted
T=450ms : Second task inserted ← DUPLICATE!
```

### Scenario B: Multiple Rapid Edits
User saves multiple times quickly (Cmd+S, Cmd+S, Cmd+S):
- Each save triggers re-analysis
- All checks happen before first insert completes
- All pass duplicate detection
- All create tasks

### Scenario C: The "Admin" Project Issue
Looking at the duplicate check code:
```javascript
const { data: pendingTasks } = await supabase
  .from('tasks')
  .select('title')
  .eq('status', 'pending')
  .eq('project_id', projectId);  // ❌ Admin project has SAME ID for all tasks
```

Wait, this should work. Let me re-examine...

Actually, the duplicate detection queries correctly. The issue is **timing** - it's checking BEFORE the previous insert completes.

## The Real Problem

**The vault watcher has NO MEMORY of what it's already processed.**

Every file change = full re-analysis, regardless of:
- Whether the file was already analyzed
- Whether the content actually changed
- Whether tasks were already created from this file

## Why This Affects AI Tasks More Than Manual

**Manual tasks** (via UI):
- Created once
- User sees the task immediately
- Unlikely to create same task again manually

**AI tasks** (via file watching):
- File editing triggers automatic re-analysis
- User doesn't see connection between "I saved my note" and "duplicate tasks created"
- Can happen multiple times per session

## The Solution

### Option 1: Track File Content Hashes (Recommended)
Only re-analyze if file content actually changed:

```javascript
class VaultWatcher {
  constructor(io) {
    this.io = io;
    this.watcher = null;
    this.fileHashes = new Map(); // Track content hashes
  }

  async handleFileChange(filepath) {
    const content = await fs.readFile(filepath, 'utf8');
    const contentHash = crypto.createHash('md5').update(content).digest('hex');

    // Check if content actually changed
    const lastHash = this.fileHashes.get(filepath);
    if (lastHash === contentHash) {
      console.log(`⏭️  Skipped - content unchanged: ${path.basename(filepath)}`);
      return;
    }

    // Update hash and process
    this.fileHashes.set(filepath, contentHash);
    await this.handleNewFile(filepath);
  }
}
```

**Pros**:
- Only re-analyzes when content changes
- Catches actual edits vs. file system noise
- Simple to implement

**Cons**:
- Uses memory to store hashes
- Hashes cleared on server restart

### Option 2: Check `meeting_notes.analyzed` Flag
Don't re-analyze if already analyzed recently:

```javascript
async handleFileChange(filepath) {
  // Check if file was analyzed in last hour
  const { data: existingNote } = await supabase
    .from('meeting_notes')
    .select('analyzed, created_at')
    .eq('file_path', filepath)
    .eq('analyzed', true)
    .single();

  if (existingNote) {
    const analyzedAt = new Date(existingNote.created_at);
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

    if (analyzedAt > hourAgo) {
      console.log(`⏭️  Skipped - analyzed recently: ${path.basename(filepath)}`);
      return;
    }
  }

  await this.handleNewFile(filepath);
}
```

**Pros**:
- Uses database (persistent across restarts)
- Can see analysis history

**Cons**:
- Database query on every file change
- Needs to define "recently" threshold

### Option 3: Database-Level Unique Constraint (Nuclear)
Prevent duplicates at database level:

```sql
-- Create unique constraint on active/pending tasks
CREATE UNIQUE INDEX idx_unique_task_per_file
ON tasks (obsidian_file, title, project_id, status)
WHERE status IN ('active', 'pending') AND obsidian_file IS NOT NULL;
```

**Pros**:
- Absolute guarantee - database won't allow duplicates
- Works even if code has bugs

**Cons**:
- Throws errors that need handling
- Might prevent legitimate cases
- Requires migration

### Option 4: Combination Approach (Best)
Use both content hashing AND better duplicate detection:

1. **Content hash check** - Skip if file unchanged
2. **Database transaction** - Wrap duplicate check + insert in transaction
3. **Unique constraint** - Safety net

## Recommended Implementation

**Phase 1: Quick Fix (Content Hashing)**
- Add content hash tracking to `handleFileChange()`
- Prevents most duplicates immediately
- No database changes needed

**Phase 2: Transaction Safety**
- Wrap duplicate check + insert in Supabase transaction
- Prevents race conditions

**Phase 3: Database Constraint (Optional)**
- Add unique index as safety net
- Only if duplicates still occur

## Related Files

- `backend/watchers/vault-watcher.js:176-179` - Bug location
- `backend/watchers/vault-watcher.js:254-302` - Duplicate detection (works, but timing issue)
- `backend/watchers/vault-watcher.js:330-364` - Task insertion

## Testing the Fix

After implementing, test:
1. Create a note with a task
2. Edit the note multiple times rapidly (Cmd+S, Cmd+S, Cmd+S)
3. Verify only ONE task is created
4. Edit note content → Task should update, not duplicate
5. Server restart → Edit note → Should not create duplicates

---

**Identified By**: Tom Suharto + Claude
**Severity**: High (actively creating duplicates for users)
**Priority**: Should fix before continuing with other features
