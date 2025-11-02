# Event Card Action Buttons - Complete Implementation Plan

**Status:** Ready to implement (waiting for token limit refresh)
**Estimated Time:** 2-3 hours
**Last Updated:** 2025-10-13

---

## 📋 Overview

Add three action buttons to event cards on the Brief page:
1. **Complete** - Mark meeting as occurred (stays visible with checkmark)
2. **Dismiss** - Hide meeting from view
3. **Edit** - Edit event name, project, and context

**Key Features:**
- Auto-complete meetings 15 minutes after they end
- Undo functionality via toast notifications
- Real-time state synchronization
- No changes to event creation flow (read-only overlay)

---

## 🔍 Risk Analysis

### ✅ Risk 1: Breaking Event Creation/Fetching
**Status:** LOW RISK

- Events are READ-ONLY from `daily_briefs.calendar_events` (JSONB)
- Actions stored SEPARATELY in new `event_actions` table
- No changes to `jobs/generate-briefings.js`
- We're adding metadata layer, not modifying source data

### ✅ Risk 2: State Synchronization
**Status:** LOW RISK

- Use same pattern as tasks: Supabase queries + real-time subscriptions
- `useBrief()` already has subscription (lib/hooks.ts:411-421)
- Add new `useEventActions()` hook following `usePendingTasks()` pattern
- Optimistic UI updates with rollback

### ✅ Risk 3: Auto-Complete Timing
**Status:** MEDIUM RISK (mitigated with undo)

- Grace period: Auto-complete 15 min AFTER meeting ends
- Check on load + every 5 minutes
- User can undo if too early
- Badge shows "Auto-completed" vs manual

### ✅ Risk 4: Performance
**Status:** LOW RISK

- Load all actions once at mount
- Store as Map: `{ [eventId]: { action, timestamp } }`
- O(1) lookup per event
- Real-time subscription updates Map

### ✅ Risk 5: Undo Complexity
**Status:** LOW RISK

- Simple: Only undo last action
- Toast shows for 10 seconds
- After timeout, manual undo still available from card
- No persistent undo history

---

## 🗄️ Database Schema

### Migration: `db/migration_007_event_actions.sql`

```sql
-- Track event actions (completed/dismissed)
CREATE TABLE event_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('completed', 'dismissed')),
  auto_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),

  -- Prevent duplicate actions per event
  UNIQUE(event_id)
);

-- Store event edit overrides (title, project, context)
CREATE TABLE event_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id TEXT NOT NULL UNIQUE,
  title TEXT,
  project_id UUID REFERENCES projects(id),
  context TEXT CHECK (context IN ('Work', 'Life')),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_event_actions_id ON event_actions(event_id);
CREATE INDEX idx_event_overrides_id ON event_overrides(event_id);
```

---

## 🔌 Backend API Routes

### Create: `backend/routes/events.js`

```javascript
const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase-client');

// POST /api/events/:id/complete
// Mark event as completed (manual or auto)
router.post('/:id/complete', async (req, res) => {
  const { id } = req.params;
  const { auto = false } = req.body;

  const { data, error } = await supabase
    .from('event_actions')
    .upsert({
      event_id: id,
      action_type: 'completed',
      auto_completed: auto
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, data });
});

// POST /api/events/:id/dismiss
// Dismiss event (hide from view)
router.post('/:id/dismiss', async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('event_actions')
    .upsert({
      event_id: id,
      action_type: 'dismissed'
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, data });
});

// DELETE /api/events/:id/action
// Undo action (remove from event_actions)
router.delete('/:id/action', async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('event_actions')
    .delete()
    .eq('event_id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// PATCH /api/events/:id
// Update event overrides (title, project, context)
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { title, project_id, context } = req.body;

  const { data, error } = await supabase
    .from('event_overrides')
    .upsert({
      event_id: id,
      title,
      project_id,
      context,
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, data });
});

// GET /api/events/actions
// Get all actions for given event IDs
router.get('/actions', async (req, res) => {
  const { ids } = req.query; // comma-separated event IDs

  if (!ids) return res.json({ success: true, data: [] });

  const eventIds = ids.split(',');

  const { data, error } = await supabase
    .from('event_actions')
    .select('*')
    .in('event_id', eventIds);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, data });
});

module.exports = router;
```

### Update: `backend/server.js`

Add after line 72:
```javascript
app.use('/api/events', require('./routes/events'));
```

---

## 🪝 Frontend Hook

### Add to: `frontend/lib/hooks.ts`

```typescript
interface EventAction {
  event_id: string
  action_type: 'completed' | 'dismissed'
  auto_completed: boolean
  created_at: string
}

export function useEventActions(eventIds: string[]) {
  const [actions, setActions] = useState<Record<string, EventAction>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

  const fetchActions = async () => {
    if (eventIds.length === 0) {
      setActions({})
      setLoading(false)
      return
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/events/actions?ids=${eventIds.join(',')}`
      )
      const result = await response.json()

      if (!result.success) throw new Error(result.error)

      // Convert to map for O(1) lookup
      const actionMap = result.data.reduce((acc: any, action: EventAction) => {
        acc[action.event_id] = action
        return acc
      }, {} as Record<string, EventAction>)

      setActions(actionMap)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchActions()
  }, [eventIds.join(',')])

  const completeEvent = async (eventId: string, auto = false) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto })
      })
      const result = await response.json()
      if (!result.success) throw new Error(result.error)

      await fetchActions()
      return result.data
    } catch (err: any) {
      setError(err.message)
      throw err
    }
  }

  const dismissEvent = async (eventId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const result = await response.json()
      if (!result.success) throw new Error(result.error)

      await fetchActions()
      return result.data
    } catch (err: any) {
      setError(err.message)
      throw err
    }
  }

  const undoAction = async (eventId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/action`, {
        method: 'DELETE'
      })
      const result = await response.json()
      if (!result.success) throw new Error(result.error)

      await fetchActions()
    } catch (err: any) {
      setError(err.message)
      throw err
    }
  }

  return {
    actions,
    loading,
    error,
    completeEvent,
    dismissEvent,
    undoAction,
    refresh: fetchActions
  }
}
```

---

## 🎨 UI Components

### 1. Update: `frontend/app/brief/page.tsx`

#### Add state and hook (after line 291):

```tsx
// Get all event IDs for actions lookup
const allEventIds = Object.values(eventsByDate || {})
  .flat()
  .map((e: any) => e.id)

const {
  actions: eventActions,
  completeEvent,
  dismissEvent,
  undoAction
} = useEventActions(allEventIds)

// Hover state for each event
const [hoveredEvent, setHoveredEvent] = useState<string | null>(null)

// Toast notifications
const [toastMessage, setToastMessage] = useState<string | null>(null)
const [toastUndo, setToastUndo] = useState<(() => void) | null>(null)

// Edit modal state
const [editingEvent, setEditingEvent] = useState<any | null>(null)
```

#### Add auto-complete logic (after state declarations):

```tsx
// Auto-complete meetings 15 min after they end
useEffect(() => {
  const checkAndAutoComplete = () => {
    const now = new Date()

    Object.values(eventsByDate || {}).flat().forEach((event: any) => {
      // Skip if already has action
      if (eventActions[event.id]) return

      // Check if 15 min past end time
      const eventEnd = new Date(event.end)
      const fifteenMinutesAfter = new Date(eventEnd.getTime() + 15 * 60 * 1000)

      if (now >= fifteenMinutesAfter) {
        console.log('Auto-completing event:', event.title)
        completeEvent(event.id, true) // auto = true
      }
    })
  }

  checkAndAutoComplete()
  const interval = setInterval(checkAndAutoComplete, 5 * 60 * 1000) // Every 5 min

  return () => clearInterval(interval)
}, [eventsByDate, eventActions])
```

#### Add handler functions:

```tsx
const handleCompleteEvent = async (eventId: string, eventTitle: string) => {
  try {
    await completeEvent(eventId, false) // manual
    showToast(`"${eventTitle}" marked as complete`, () => handleUndoAction(eventId))
  } catch (err) {
    console.error('Failed to complete event:', err)
  }
}

const handleDismissEvent = async (eventId: string, eventTitle: string) => {
  try {
    await dismissEvent(eventId)
    showToast(`"${eventTitle}" dismissed`, () => handleUndoAction(eventId))
  } catch (err) {
    console.error('Failed to dismiss event:', err)
  }
}

const handleUndoAction = async (eventId: string) => {
  try {
    await undoAction(eventId)
    setToastMessage(null)
    setToastUndo(null)
  } catch (err) {
    console.error('Failed to undo action:', err)
  }
}

const showToast = (message: string, undoFn: () => void) => {
  setToastMessage(message)
  setToastUndo(() => undoFn)

  setTimeout(() => {
    setToastMessage(null)
    setToastUndo(null)
  }, 10000) // 10 second timeout
}
```

#### Update event card rendering (around line 120-280):

Replace the entire event card `<div>` with this structure:

```tsx
<div
  key={event.id}
  className={`bg-card-light dark:bg-card-dark rounded-xl p-5 border
    border-gray-200 dark:border-gray-700 shadow-sm relative
    ${eventActions[event.id]?.action_type === 'completed' ? 'opacity-70' : ''}
  `}
  onMouseEnter={() => setHoveredEvent(event.id)}
  onMouseLeave={() => setHoveredEvent(null)}
>
  {/* Completed badge */}
  {eventActions[event.id]?.action_type === 'completed' && (
    <div className="absolute top-2 right-2 bg-green-500/20 text-green-700
      dark:text-green-300 px-2 py-1 rounded text-xs font-semibold">
      ✓ {eventActions[event.id]?.auto_completed ? 'Auto-completed' : 'Completed'}
    </div>
  )}

  {/* Existing event card content... */}
  {/* (Keep all existing content: project header, title, time, attendees, etc.) */}

  {/* Action buttons (add at end before closing </div>) */}
  <div className={`mt-4 gap-2 transition-all duration-300 hidden md:flex
    ${hoveredEvent === event.id ? 'opacity-100 max-h-20' : 'opacity-0 max-h-0 overflow-hidden'}`}
  >
    {eventActions[event.id]?.action_type === 'completed' ? (
      <button
        onClick={() => handleUndoAction(event.id)}
        className="flex-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300
          dark:hover:bg-gray-600 text-text-primary-light dark:text-text-primary-dark
          text-sm font-semibold py-2 rounded transition"
      >
        ↩ Mark Incomplete
      </button>
    ) : (
      <button
        onClick={() => handleCompleteEvent(event.id, event.title)}
        className="flex-1 bg-button-approve hover:bg-button-approve/90
          text-white text-sm font-semibold py-2 rounded transition"
      >
        ✓ Complete
      </button>
    )}

    <button
      onClick={() => setEditingEvent(event)}
      className="bg-card-light dark:bg-card-dark hover:bg-gray-50
        dark:hover:bg-gray-700 text-text-secondary-light dark:text-text-secondary-dark
        text-sm font-semibold px-4 py-2 rounded border border-gray-200
        dark:border-gray-700 transition"
    >
      ✏️ Edit
    </button>

    <button
      onClick={() => handleDismissEvent(event.id, event.title)}
      className="bg-button-reject hover:bg-button-reject/90
        text-white text-sm font-semibold px-4 py-2 rounded transition"
    >
      ✕ Dismiss
    </button>
  </div>
</div>
```

#### Filter out dismissed events (around line 466-468):

```tsx
// Filter out dismissed events
const visibleEvents = events.filter((e: any) =>
  eventActions[e.id]?.action_type !== 'dismissed'
)
```

#### Add toast component (before closing `</div>` of main container):

```tsx
{/* Toast notification with undo */}
{toastMessage && (
  <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-card-light
    dark:bg-card-dark border border-gray-200 dark:border-gray-700
    px-6 py-3 rounded-lg shadow-lg flex items-center gap-4 z-50
    animate-slide-up">
    <span className="text-text-primary-light dark:text-text-primary-dark">
      {toastMessage}
    </span>
    {toastUndo && (
      <button
        onClick={toastUndo}
        className="text-blue-600 dark:text-blue-400 font-semibold
          hover:underline whitespace-nowrap"
      >
        Undo
      </button>
    )}
  </div>
)}

{/* Edit Event Modal */}
{editingEvent && (
  <EditEventModal
    event={editingEvent}
    isOpen={!!editingEvent}
    onClose={() => setEditingEvent(null)}
    onSave={async (eventId, updates) => {
      // Implementation in EditEventModal section below
    }}
  />
)}
```

---

### 2. Create: `frontend/components/EditEventModal.tsx`

```tsx
import { useState, useEffect } from 'react'

interface EditEventModalProps {
  event: any
  isOpen: boolean
  onClose: () => void
  onSave: (eventId: string, updates: any) => void
}

interface Project {
  id: string
  name: string
  color: string
}

export default function EditEventModal({ event, isOpen, onClose, onSave }: EditEventModalProps) {
  const [title, setTitle] = useState(event.title)
  const [projectId, setProjectId] = useState(event.project_id || '')
  const [context, setContext] = useState(event.context || 'Work')
  const [projects, setProjects] = useState<Project[]>([])

  // Fetch projects
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
        const response = await fetch(`${API_BASE_URL}/api/projects`)
        if (response.ok) {
          const data = await response.json()
          setProjects(data)
        }
      } catch (error) {
        console.error('Failed to fetch projects:', error)
      }
    }
    if (isOpen) fetchProjects()
  }, [isOpen])

  // Reset form when event changes
  useEffect(() => {
    setTitle(event.title)
    setProjectId(event.project_id || '')
    setContext(event.context || 'Work')
  }, [event])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const updates = {
      title,
      project_id: projectId || null,
      context
    }

    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const response = await fetch(`${API_BASE_URL}/api/events/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })

      if (!response.ok) throw new Error('Failed to update event')

      onSave(event.id, updates)
      onClose()
    } catch (error) {
      console.error('Error updating event:', error)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4
        max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
          Edit Event
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
              Event Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600
                rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              required
            />
          </div>

          {/* Project */}
          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
              Project
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600
                rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">No Project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          {/* Context */}
          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
              Context
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="Work"
                  checked={context === 'Work'}
                  onChange={(e) => setContext(e.target.value)}
                  className="mr-2"
                />
                <span className="text-gray-900 dark:text-white">Work</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="Life"
                  checked={context === 'Life'}
                  onChange={(e) => setContext(e.target.value)}
                  className="mr-2"
                />
                <span className="text-gray-900 dark:text-white">Life</span>
              </label>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white
                font-semibold py-2 px-4 rounded-md transition"
            >
              Save Changes
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 dark:border-gray-600
                rounded-md hover:bg-gray-50 dark:hover:bg-gray-700
                text-gray-700 dark:text-gray-300 font-semibold transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

---

## 📝 Implementation Checklist

### Phase 1: Database & Backend (30 min)
- [ ] Run migration: `migration_007_event_actions.sql`
- [ ] Create `backend/routes/events.js` with 5 endpoints
- [ ] Update `backend/server.js` to include event routes (line 72)
- [ ] Test endpoints with curl/Postman

### Phase 2: Frontend Hook (30 min)
- [ ] Add `useEventActions()` to `frontend/lib/hooks.ts`
- [ ] Add TypeScript interface for `EventAction`
- [ ] Test hook in isolation

### Phase 3: Brief Page Updates (60 min)
- [ ] Add state: eventActions, hoveredEvent, toast, editingEvent
- [ ] Add auto-complete logic with 15-min grace period
- [ ] Add handler functions: handleCompleteEvent, handleDismissEvent, handleUndoAction
- [ ] Update event card rendering with action buttons
- [ ] Add completed badge styling
- [ ] Filter dismissed events from display
- [ ] Add toast notification component

### Phase 4: Edit Modal (30 min)
- [ ] Create `frontend/components/EditEventModal.tsx`
- [ ] Wire up to page.tsx
- [ ] Test editing title, project, context

### Phase 5: Testing (30 min)
- [ ] Test manual complete → shows badge, stays visible
- [ ] Test dismiss → event disappears immediately
- [ ] Test undo via toast (within 10 sec)
- [ ] Test undo via "Mark Incomplete" button (after toast)
- [ ] Test auto-complete 15 min after meeting ends
- [ ] Test edit modal saves correctly
- [ ] Test real-time updates across browser tabs
- [ ] Test hover states on mobile vs desktop

---

## 🎯 Key Implementation Notes

1. **Don't touch event creation**: All event fetching stays the same. We're only adding metadata.

2. **Filter dismissed on render**: Use `eventActions[e.id]?.action_type !== 'dismissed'` when rendering events.

3. **Auto-complete timing**:
   - Check `event.end` time + 15 minutes
   - Run on mount and every 5 minutes
   - Skip if event already has action

4. **Completed styling**:
   - Add `opacity-70` to card
   - Show badge in top-right
   - Change Complete button to "Mark Incomplete"

5. **Toast timing**:
   - Show immediately after action
   - 10 second timeout
   - Can still undo manually after toast disappears

6. **Edit overrides**:
   - Stored separately in `event_overrides` table
   - Original Google Calendar data unchanged
   - Apply overrides when rendering event cards

---

## 🚀 Ready to Implement

All planning complete. No risks to event creation flow. Following proven patterns from task management system.

**Next Steps:**
1. Wait for token limit refresh
2. Run database migration
3. Implement backend routes
4. Add frontend hook
5. Update UI components
6. Test thoroughly

---

**Questions or clarifications?** All addressed in risk analysis above.
