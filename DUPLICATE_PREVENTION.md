# Duplicate Task Prevention Strategy

**Date**: October 11, 2025
**Status**: Needs Implementation

## Problem

User experienced duplicate tasks:
- 8 copies of "Send old iPhone to Pa"
- 5 copies of "Add credits to Claude API billing"
- 3 copies of "Add credits to Claude API account"

All duplicates were **manual tasks** created within minutes of each other, suggesting either:
1. Double-clicking the create button
2. No duplicate detection in manual task creation flow
3. No UI feedback during task creation

## Current State

### AI-Detected Tasks: ✅ Protected
**Location**: `backend/watchers/vault-watcher.js:254-295`

The AI detection system has robust duplicate prevention:
```javascript
async isDuplicateTask(title, projectId) {
  // Checks:
  // 1. All pending tasks with same project
  // 2. All active tasks with same project
  // 3. Recently completed tasks (last 7 days) with same project
  // 4. Case-insensitive title matching

  // Returns true if duplicate found, preventing creation
}
```

**Result**: AI never creates duplicate tasks

### Manual Tasks: ❌ Not Protected
**Location**: `frontend/app/api/tasks/route.ts:4-52`

The manual task creation API:
- ❌ No duplicate checking
- ❌ No validation of existing tasks
- ❌ Direct insert into database

**Frontend**: `frontend/components/CreateTaskModal.tsx`
- ❌ No button disabling during submission
- ❌ No loading state
- ❌ User can double-click "Create" button

**Result**: User can accidentally create duplicates

## Recommended Solutions

### Level 1: Frontend Protection (Quick Win)
**What**: Disable the create button during submission
**Impact**: Prevents accidental double-clicks

**Implementation**:
```tsx
// In CreateTaskModal.tsx
const [isSubmitting, setIsSubmitting] = useState(false)

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  if (isSubmitting) return // Prevent duplicate submissions

  setIsSubmitting(true)
  try {
    await onCreate(taskData)
    onClose()
  } finally {
    setIsSubmitting(false)
  }
}

// Disable button while submitting
<button disabled={isSubmitting}>
  {isSubmitting ? 'Creating...' : 'Create Task'}
</button>
```

**Pros**: Easy to implement, prevents most accidental duplicates
**Cons**: Doesn't prevent deliberate duplicates or API-level duplication

### Level 2: Backend Duplicate Detection (Recommended)
**What**: Add duplicate checking to manual task creation API
**Impact**: Prevents all duplicate manual tasks

**Implementation**:
```javascript
// In frontend/app/api/tasks/route.ts
async function isDuplicate(title, projectId, status = 'active') {
  const normalizedTitle = title.toLowerCase().trim()

  // Check pending and active tasks
  const { data: existing } = await supabase
    .from('tasks')
    .select('id, title, status')
    .in('status', ['pending', 'active'])
    .eq('project_id', projectId)

  return existing?.some(task =>
    task.title.toLowerCase().trim() === normalizedTitle
  )
}

// In POST handler, before insert:
const isDupe = await isDuplicate(taskData.title, taskData.project_id)
if (isDupe) {
  return NextResponse.json(
    { error: 'A task with this title already exists in this project' },
    { status: 409 } // Conflict
  )
}
```

**Pros**: Server-side protection, consistent with AI behavior
**Cons**: Requires backend change, user sees error if duplicate attempted

### Level 3: Database Constraint (Nuclear Option)
**What**: Add unique constraint on (title, project_id, status)
**Impact**: Database-level guarantee of no duplicates

**Implementation**:
```sql
-- Create a partial unique index
CREATE UNIQUE INDEX idx_unique_active_tasks
ON tasks (lower(trim(title)), project_id)
WHERE status IN ('active', 'pending');
```

**Pros**: Absolute guarantee, works even if code changes
**Cons**:
- Prevents legitimate cases (e.g., recurring tasks with same name)
- Would need to handle constraint violations in code
- May interfere with recurring tasks feature

## Recommended Approach

**Implement Levels 1 + 2**:

1. ✅ **Frontend button disabling** - Quick win, prevents accidents
2. ✅ **Backend duplicate check** - Consistent behavior with AI detection
3. ❌ **Skip database constraint** - Too restrictive for edge cases

## Implementation Checklist

### Frontend Changes
- [ ] Add `isSubmitting` state to `CreateTaskModal`
- [ ] Disable submit button during submission
- [ ] Show loading text: "Creating..." → "Create Task"
- [ ] Handle duplicate error response from API

### Backend Changes
- [ ] Create `isDuplicate()` function in `/api/tasks/route.ts`
- [ ] Add duplicate check before insert
- [ ] Return 409 Conflict if duplicate found
- [ ] Include helpful error message

### Testing
- [ ] Test creating duplicate task (should be blocked)
- [ ] Test double-clicking create button (should only create once)
- [ ] Test creating similar but non-identical tasks (should succeed)
- [ ] Test case sensitivity (should treat "Task" and "task" as duplicates)
- [ ] Test whitespace handling (should treat " Task " and "Task" as duplicates)

## Edge Cases to Consider

### Legitimate Duplicates
Some cases where identical titles might be valid:
- Recurring tasks (already handled via `recurring_task_id`)
- Tasks in different projects (separate project_id, so OK)
- Tasks in different contexts (Work vs Life, same project - should this be allowed?)

### Decision: Duplicate Scope
**Check duplicates within**:
- ✅ Same project
- ✅ Same OR null project (if both are unassigned to project)
- ✅ Active OR pending status only (ignore completed/dismissed)
- ❌ Don't check across different projects (allow same task name for different clients)

## Future Enhancements

### Fuzzy Matching (Optional)
Could detect similar but not identical tasks:
- "Send iPhone to Pa" vs "Send old iPhone to Pa"
- "Add credits to Claude" vs "Add credits to Claude API billing"

**Library**: Use string similarity (Levenshtein distance)
**Threshold**: 85% similarity = warn user but allow creation

**Not recommended yet**: Wait to see if users want this

## Related Files

- `backend/watchers/vault-watcher.js:254-295` - AI duplicate detection (reference implementation)
- `frontend/app/api/tasks/route.ts` - Manual task creation API (needs duplicate check)
- `frontend/components/CreateTaskModal.tsx` - Task creation UI (needs button disabling)
- `frontend/app/page.tsx:142-172` - handleCreateTask (needs error handling)

---

**Decision Made By**: Tom Suharto + Claude
**Implementation Priority**: High (user actively experiencing this issue)
**Can Be Revisited**: Yes, especially fuzzy matching feature
