# Milestone System Improvements

**Analysis Date:** October 29, 2025
**Current Status:** 12/35 projects have milestones (55 total), stored in JSONB

---

## Current State Analysis

### What's Working ✅
- **AI Generation**: Claude Haiku generates contextual milestones
- **Dual Mode**: Different strategies for Code vs Deadline-driven projects
- **Frontend Display**: Journey section shows milestones with status icons
- **Task Creation**: "+ Task" button for quick task creation from milestones

### Current Issues ❌

#### 1. **Storage Architecture**
- Milestones in `projects.ai_insights.milestones` JSONB
- Not a Phase 2 normalized entity
- No foreign key relationships
- Can't query/filter milestones independently

#### 2. **Generation & Updates**
- **Manual generation** for most projects (only Code projects auto-generate 3x daily)
- **Stale context**: Uses old `meeting_notes` table instead of Phase 2 `narratives`
- **No auto-updates**: Milestones don't refresh when project changes
- **Limited coverage**: Only 12/35 projects have milestones

#### 3. **Status Management**
- **No auto-completion**: Status updates are manual only
- **No completion detection**: Can't detect when milestone is done
- **No progress tracking**: No % completion or progress metrics

#### 4. **Task Integration**
- **Weak linking**: "+ Task" creates task but doesn't link back to milestone
- **No bidirectional sync**: Completing tasks doesn't update milestone status
- **No rollup**: Can't see milestone progress based on related tasks

#### 5. **User Interaction**
- **Read-only**: Can't edit milestone descriptions or dates
- **Can't reorder**: Fixed order, can't prioritize
- **Can't delete**: No way to remove irrelevant milestones
- **No manual creation**: Can only AI-generate

#### 6. **History & Evolution**
- **No versioning**: Can't see how milestones changed over time
- **No changelog**: Lost context when milestones are regenerated
- **No archiving**: Old milestones are overwritten

---

## Proposed Improvements

### Phase 1: Foundation (Critical - Do First)

#### 1.1 Migrate to Phase 2 Entity Table
**Why:** Enable proper querying, relationships, and history

```sql
CREATE TABLE milestones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

  -- Content
  description TEXT NOT NULL,
  target_date DATE,
  status TEXT CHECK (status IN ('upcoming', 'in_progress', 'completed', 'at_risk', 'cancelled')),

  -- AI Context
  ai_generated BOOLEAN DEFAULT true,
  ai_confidence DECIMAL DEFAULT 0.5,
  dependencies TEXT[],

  -- Progress Tracking
  progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage BETWEEN 0 AND 100),
  actual_completion_date DATE,

  -- Relationships
  parent_milestone_id UUID REFERENCES milestones(id), -- For sub-milestones
  order_index INTEGER, -- For custom ordering

  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by TEXT, -- 'ai' or user ID
  completed_at TIMESTAMP
);

CREATE INDEX idx_milestones_project ON milestones(project_id);
CREATE INDEX idx_milestones_status ON milestones(status);
CREATE INDEX idx_milestones_target_date ON milestones(target_date);
```

**Benefits:**
- Can query milestones across all projects
- Proper relationships (tasks can link to milestones)
- History tracking via timestamps
- Progress metrics

#### 1.2 Update Context Source
**Why:** Use fresh Phase 2 data instead of stale old data

Change `generate-journey.js` from:
```javascript
// OLD: Uses deprecated meeting_notes table
const { data: narratives } = await supabase
  .from('meeting_notes')
  .select('*')
  .eq('project_id', project.id)
```

To:
```javascript
// NEW: Use Phase 2 narratives table
const { data: narratives } = await supabase
  .from('narratives')
  .select('*')
  .eq('project_id', project.id)
  .order('date', { ascending: false })
  .limit(10);
```

**Benefits:**
- 636 narratives instead of old meeting notes
- Better context for milestone generation
- Automatically stays current

---

### Phase 2: Intelligence (Medium Priority)

#### 2.1 Auto-Completion Detection
**Why:** Milestones should auto-complete when related work is done

**Logic:**
```javascript
// Check if milestone can be marked completed
async function checkMilestoneCompletion(milestoneId) {
  const milestone = await getMilestone(milestoneId);

  // Rule 1: Check linked tasks
  const linkedTasks = await getTasksForMilestone(milestoneId);
  const allTasksCompleted = linkedTasks.every(t => t.status === 'completed');

  // Rule 2: Check target date
  const isPastTargetDate = milestone.target_date && new Date() > new Date(milestone.target_date);

  // Rule 3: Check if marked in-progress for > 7 days with no activity
  const stale = milestone.status === 'in_progress' && daysSinceUpdate(milestone) > 7;

  // Auto-complete or flag at-risk
  if (allTasksCompleted && linkedTasks.length > 0) {
    return { action: 'complete', reason: 'All linked tasks completed' };
  }

  if (isPastTargetDate && milestone.status !== 'completed') {
    return { action: 'at_risk', reason: 'Past target date' };
  }

  if (stale) {
    return { action: 'at_risk', reason: 'No activity for 7+ days' };
  }

  return { action: 'none' };
}
```

**Run:** Daily at midnight via cron job

#### 2.2 Task-Milestone Bidirectional Linking
**Why:** Creating tasks from milestones should maintain relationship

**Changes:**
1. Add `milestone_id` field to tasks table
2. When "+ Task" is clicked, link task to milestone
3. Update milestone progress based on linked tasks

```javascript
// When creating task from milestone
async function createTaskFromMilestone(milestoneId, taskData) {
  const task = await createTask({
    ...taskData,
    milestone_id: milestoneId // Link back to milestone
  });

  // Update milestone to in_progress if first task created
  await updateMilestoneStatus(milestoneId, 'in_progress');

  return task;
}

// Progress calculation
async function calculateMilestoneProgress(milestoneId) {
  const tasks = await getTasksForMilestone(milestoneId);
  if (tasks.length === 0) return 0;

  const completed = tasks.filter(t => t.status === 'completed').length;
  return Math.round((completed / tasks.length) * 100);
}
```

#### 2.3 Smart Regeneration Triggers
**Why:** Milestones should auto-update when project context changes significantly

**Triggers:**
- New deadline set
- 3+ new narratives added
- 5+ new tasks created
- Project status change (on_track → at_risk)
- Manual "Refresh" button

**Logic:**
```javascript
// Check if regeneration needed
async function shouldRegenerateMilestones(projectId) {
  const project = await getProject(projectId);
  const lastGenerated = project.journey_generated_at;

  if (!lastGenerated) return true; // Never generated

  // Count changes since last generation
  const newNarratives = await countNarrativesSince(projectId, lastGenerated);
  const newTasks = await countTasksSince(projectId, lastGenerated);
  const deadlineChanged = project.deadline_updated_at > lastGenerated;

  return newNarratives >= 3 || newTasks >= 5 || deadlineChanged;
}
```

---

### Phase 3: User Experience (Low Priority - Nice to Have)

#### 3.1 Manual Editing
**Why:** Users should be able to adjust AI-generated milestones

**Features:**
- Edit description inline
- Change target date via date picker
- Manually update status
- Add dependencies
- Reorder via drag & drop

**UI:**
```typescript
// Add edit mode to ProjectCard
const [editingMilestone, setEditingMilestone] = useState<string | null>(null);

<div onDoubleClick={() => setEditingMilestone(milestone.id)}>
  {editingMilestone === milestone.id ? (
    <input
      value={milestone.description}
      onChange={handleMilestoneEdit}
      onBlur={saveMilestoneEdit}
    />
  ) : (
    <span>{milestone.description}</span>
  )}
</div>
```

#### 3.2 Manual Creation
**Why:** Users should be able to add custom milestones

**UI Enhancement:**
```tsx
// Add "+ Add Milestone" button in Journey section
<button onClick={openMilestoneDialog}>
  + Add Milestone
</button>

// Dialog with fields:
// - Description (required)
// - Target Date (optional)
// - Dependencies (select from existing milestones)
```

#### 3.3 Milestone Templates
**Why:** Common milestone patterns can be reused

**Templates by Project Type:**
- **Pitch Projects**: Research → Strategy → Creative → Deck → Rehearsal → Pitch
- **Code Projects**: Planning → Architecture → Development → Testing → Deployment
- **Creative Projects**: Briefing → Concepting → Refinement → Approval → Production

```javascript
const MILESTONE_TEMPLATES = {
  pitch: [
    { description: 'Complete competitive research and insights', order: 1, typical_duration_days: 7 },
    { description: 'Develop strategic framework and positioning', order: 2, typical_duration_days: 5 },
    { description: 'Create initial creative concepts', order: 3, typical_duration_days: 7 },
    { description: 'Design pitch deck and materials', order: 4, typical_duration_days: 5 },
    { description: 'Rehearse and refine presentation', order: 5, typical_duration_days: 2 }
  ]
};
```

#### 3.4 Progress Visualization
**Why:** Visual feedback on milestone completion

**UI Components:**
```tsx
// Progress bar for milestone
<div className="progress-bar">
  <div
    className="progress-fill"
    style={{ width: `${milestone.progress_percentage}%` }}
  />
  <span>{milestone.progress_percentage}% complete</span>
</div>

// Overall project progress (based on milestones)
const projectProgress = milestones.reduce((sum, m) =>
  sum + m.progress_percentage, 0
) / milestones.length;
```

---

## Implementation Roadmap

### Week 1: Foundation
- [ ] Create milestones table (Phase 2 entity)
- [ ] Migrate existing JSONB milestones to table
- [ ] Update generate-journey.js to use narratives table
- [ ] Test milestone generation with new context

### Week 2: Intelligence
- [ ] Implement auto-completion detection cron job
- [ ] Add milestone_id to tasks table
- [ ] Update "+ Task" button to link tasks to milestones
- [ ] Implement progress calculation

### Week 3: Smart Updates
- [ ] Build regeneration trigger logic
- [ ] Add "Refresh Milestones" button to UI
- [ ] Implement smart regeneration (3 narratives, 5 tasks triggers)

### Week 4: UX Polish
- [ ] Add inline editing for milestones
- [ ] Implement drag & drop reordering
- [ ] Add manual milestone creation dialog
- [ ] Build progress visualization components

---

## Metrics to Track

**Before Improvements:**
- 12/35 projects (34%) have milestones
- 55 total milestones
- 0% auto-completion rate
- Manual generation only for non-Code projects

**Target After Improvements:**
- 30/35 projects (86%) have milestones
- Auto-completion rate: 60%+
- 80% of milestones have linked tasks
- Smart regeneration reduces staleness by 70%

---

## Risk Assessment

**Low Risk:**
- Phase 2 table migration (standard pattern)
- Context source update (simple switch)

**Medium Risk:**
- Auto-completion logic (could mark things completed prematurely)
- Smart regeneration triggers (could be too aggressive)

**Mitigation:**
- Start with conservative auto-completion rules
- Add "Undo" functionality for auto-completions
- Make regeneration opt-in initially
- Add verbose logging for first 30 days

---

## Related Files

**Backend:**
- `generate-journey.js` - Current milestone generation
- `migrations/milestone-phase2-migration.sql` - Phase 2 table
- `services/milestone-intelligence.js` - NEW: Auto-completion & progress
- `jobs/milestone-regeneration.js` - NEW: Smart triggers

**Frontend:**
- `components/ProjectCardWithDeadline.tsx` - Display milestones
- `components/MilestoneEditor.tsx` - NEW: Edit UI
- `components/MilestoneProgress.tsx` - NEW: Progress viz
