# Tags Implementation - Decision Log

**Date**: October 11, 2025
**Status**: Not Implemented (Deferred)

## Context

During development, we noticed that AI-detected tasks were not being created with tags, even though the infrastructure exists:
- ✅ Database has `extra_tags` column (text array)
- ✅ UI displays tags in all task cards
- ✅ Manual task creation supports tag input
- ❌ AI does not generate tags automatically

## Investigation Findings

**Current State:**
- Out of hundreds of AI-detected tasks, only 1 had tags
- AI prompt in `ai/meeting-analyzer.js` does not ask for tags
- Task insertion in `watchers/vault-watcher.js` does not include `extra_tags` field

**Why Tags Weren't Working:**
1. AI prompt doesn't request tag generation
2. Task creation code doesn't insert tags
3. No tag strategy defined for AI to follow

## Proposed Implementation

### Tag Categories Considered:
- **Work Type**: Meeting, Email, Creative, Research, Planning, Review, Writing, Design
- **People**: Jenna, Kids, Team, Client, specific names
- **Urgency Modifiers**: Urgent, Quick, Waiting On, Blocked
- **Domain**: F&B, Tech, Admin, Finance, School, Travel
- **Action Type**: Call, Follow-up, Presentation, Driving, Errands

### Technical Changes Required:
1. Update `ai/meeting-analyzer.js` prompt to request tags in JSON response
2. Add tag generation instructions with examples
3. Modify `watchers/vault-watcher.js` to insert `extra_tags` field
4. Consider tag normalization/deduplication logic

## Decision: Skip Tags (For Now)

**Rationale:**

### Existing Organization is Strong
The system already has robust categorization:
- **Project** → what it's for (Baileys, 72andSunny, Misc)
- **Context** → Work vs Life
- **Urgency** → Now/Soon/Eventually
- **Status** → Pending/Active/Done

### Tags Would Be Redundant
Most potential tags duplicate existing information:
- "Client" tag → visible from project name
- "Meeting" tag → usually clear from task title
- "Urgent" tag → already have urgency levels
- "Email" tag → task title typically indicates this

### No Clear Use Case Yet
User hasn't expressed need for:
- Batch filtering by task type
- Cross-project tag searches
- Tag-based workflows
- Grouping similar activities

### Design Principles Applied
- **YAGNI** (You Aren't Gonna Need It) → don't build features without proven need
- **Simplicity** → less visual noise, faster cognitive processing
- **Organic Growth** → let usage patterns emerge before adding complexity

## Future Considerations

Tags COULD be valuable if:
- User wants to batch similar tasks ("all emails" or "all calls")
- Need to track waiting states ("Waiting On" for blocked dependencies)
- Want quick-win filters (all tasks under 15 minutes)
- Matching tasks to energy levels ("Deep Work" vs "Admin")

## How to Implement Later

If tags become useful, implementation is straightforward:

### 1. Update AI Prompt (`ai/meeting-analyzer.js`)
```javascript
{
  "tasks": [
    {
      "title": "Task title",
      "context": "Why needed",
      "confidence": 0.95,
      "urgency": "Now",
      "estimate_minutes": 120,
      "tags": ["Client", "Meeting", "Urgent"]  // ADD THIS
    }
  ]
}
```

### 2. Update Task Insertion (`watchers/vault-watcher.js`)
```javascript
.insert({
  // ... existing fields
  extra_tags: task.tags || [],  // ADD THIS
})
```

### 3. Define Tag Strategy
Add prompt instructions:
```
Generate 2-5 relevant tags for each task:
- Work type (Meeting, Email, Creative, etc.)
- People mentioned (names, roles)
- Context (Client name, project type)
- Action modifiers (Urgent, Quick, etc.)

Examples:
- "Review Baileys deck" → ["Client", "Baileys", "Review", "Creative"]
- "Call Sarah about contract" → ["Call", "Team", "Sarah", "Legal"]
```

## Alternative Approach: Manual-Only Tags

Current compromise:
- ✅ Keep tag UI for manual task creation
- ✅ Users can add tags when helpful
- ❌ AI doesn't auto-generate tags
- ✅ Let organic usage patterns emerge

This preserves flexibility while avoiding premature optimization.

## Related Files

- `ai/meeting-analyzer.js` - AI prompt that would need tag generation
- `watchers/vault-watcher.js` - Task insertion code (lines 344-362)
- `frontend/components/CreateTaskModal.tsx` - Manual tag input UI
- `frontend/components/EditTaskModal.tsx` - Tag editing UI
- `frontend/components/*TaskCard.tsx` - Tag display UI

## Revisit Criteria

Reconsider tags if:
1. User requests tag filtering functionality
2. Task list becomes unwieldy without better organization
3. Clear workflow patterns emerge that tags would support
4. User manually adds tags to >20% of tasks (signals organic need)

---

**Decision Made By**: Tom Suharto + Claude
**Can Be Revisited**: Yes, anytime based on actual usage patterns
