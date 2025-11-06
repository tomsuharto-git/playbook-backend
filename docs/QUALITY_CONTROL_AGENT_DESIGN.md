# Quality Control Agent - Design Specification

**Created:** November 2, 2025
**Status:** Planning → Implementation
**Purpose:** Autonomous AI quality control to catch and fix data issues before user sees them
**Priority:** HIGH - Solves real pain point

---

## The Problem Statement

### Current Pain Points

**1. Too Many Pending Tasks**
```
Tom logs in → Sees 20+ pending tasks
Reality: 10 are duplicates, 5 are low-quality, 3 are already done
Result: Wastes 10 minutes dismissing garbage
```

**2. "No Title" Events in Briefs**
```
Calendar shows:
- "(No title)" at 2:00 PM
- "" at 4:00 PM
- "Untitled meeting" at 5:00 PM

Reality: Google Calendar sync issues or placeholder events
Result: Confusing, unprofessional briefings
```

**3. Low-Confidence Tasks Slip Through**
```
Task: "Consider reviewing the dashboard performance metrics"
- Confidence: 0.45 (below threshold)
- Created anyway (detection bug)
- Not actionable
Result: Clogs pending queue
```

**4. Duplicate Events Not Caught**
```
Same meeting appears twice:
- "ITA Strategy Call" (Outlook)
- "ITA Strategy Call" (Google Calendar)

Deduplication missed due to:
- Slight time difference (timezone conversion)
- Different attendee formats
Result: Duplicate briefings generated
```

**5. Orphaned Data**
```
- Tasks with deleted project_id
- Events with no project (should be categorized)
- Narratives older than 6 months (bloat)
Result: Database clutter, slow queries
```

### The Core Issue

**There's no AI watching the data quality between user sessions.**

Everything waits for Tom to manually catch and fix issues.

---

## The Solution: Quality Control Agent

### Agent Overview

**Name:** `playbook-qc-agent`
**Type:** Background worker agent (not user-facing)
**Schedule:** Runs every 6 hours (midnight, 6am, noon, 6pm ET)
**Model:** Haiku (fast + cheap for bulk operations)
**Tools:** Read, Write, Edit, Bash, Grep

### Core Mission

> **"Keep Playbook's data clean, accurate, and useful by proactively detecting and fixing quality issues before the user logs in."**

---

## Quality Control Checks (The QC Checklist)

### Category 1: Pending Task Quality 🎯

#### Check 1.1: Semantic Duplicate Detection
```javascript
Problem: Multiple pending tasks that mean the same thing

Example:
- "Set up Okta account"
- "Complete Okta account setup"
- "Finish setting up Okta"

QC Action:
1. Compare all pending tasks using semantic similarity
2. If similarity > 90%, flag as likely duplicates
3. Keep highest confidence task, auto-dismiss others
4. Log decision for audit trail

Frequency: Every 6 hours
Impact: Reduces pending queue by ~30%
```

#### Check 1.2: Low-Quality Task Filtering
```javascript
Problem: Vague, non-actionable tasks slip through

Examples:
- "Think about updating the website"
- "Consider reviewing the metrics"
- "Maybe look into the API performance"

QC Detection Rules:
- Contains "consider", "maybe", "think about" (weak verbs)
- No clear deliverable
- Confidence < 0.6
- No due date and urgency = "Eventually"

QC Action:
1. Score each pending task for actionability (0-1)
2. If score < 0.4, auto-dismiss with reason logged
3. If score 0.4-0.6, lower rank significantly
4. Generate report: "{N} low-quality tasks auto-dismissed"

Frequency: Every 6 hours
Impact: Removes ~5-10 garbage tasks daily
```

#### Check 1.3: Stale Pending Task Cleanup
```javascript
Problem: Pending tasks sit for weeks, never approved/dismissed

Rule: Pending > 7 days = likely not important

QC Action:
1. Find tasks WHERE status='pending' AND created_at < 7 days ago
2. If confidence < 0.7, auto-dismiss with reason: "Stale pending task"
3. If confidence >= 0.7, send notification: "Old pending tasks need review"
4. Log all actions

Frequency: Daily (midnight)
Impact: Keeps pending queue fresh
```

#### Check 1.4: Already-Completed Task Detection
```javascript
Problem: Task in pending queue is actually already done

Example:
- Pending: "Review ITA deck"
- Recent narrative: "Reviewed ITA deck with Peter, approved"

QC Action:
1. For each pending task, search recent narratives (7 days)
2. If narrative indicates task completion, auto-complete task
3. Link task to source narrative
4. Log: "Auto-completed based on narrative evidence"

Frequency: Every 6 hours
Impact: Reduces pending queue, improves accuracy
```

---

### Category 2: Event Quality 📅

#### Check 2.1: No-Title Event Detection
```javascript
Problem: Events with missing or placeholder titles

Bad titles:
- "(No title)"
- ""
- "Untitled meeting"
- "Event"
- "Meeting"

QC Action:
1. Find events with generic/empty titles
2. Attempt to enrich from:
   - Attendee names ("Meeting with John Doe")
   - Location ("Meeting at Forsman & Bodenfors office")
   - Project association ("ITA Airways Discussion")
3. If enrichment succeeds, update title
4. If enrichment fails, mark event as "needs_review"
5. Generate daily report: "{N} events auto-enriched, {M} need manual review"

Frequency: Every 6 hours (before briefing generation)
Impact: Eliminates 90% of "no title" events
```

#### Check 2.2: Duplicate Event Cleanup
```javascript
Problem: Same meeting appears from Google + Outlook

Detection Strategy:
1. Group events by date
2. For each date, compare all events:
   - Title similarity > 85%
   - Start time within 1 hour
   - Attendee overlap > 50%
3. If match found, prefer:
   - Outlook over Google (for work events)
   - Event with more attendees
   - Event with briefing already generated

QC Action:
1. Identify duplicate pairs
2. Mark inferior copy as hidden (soft delete)
3. Merge attendee lists if needed
4. Update daily_briefs.event_ids to remove duplicate references
5. Log: "{N} duplicate events hidden"

Frequency: Every 6 hours
Impact: Cleaner calendar view, no duplicate briefings
```

#### Check 2.3: Missing Project Association
```javascript
Problem: Work events have no project linked

Example:
- Event: "ITA Strategy Call"
- project_id: NULL
- Should be linked to "ITA Airways" project

QC Action:
1. Find events WHERE category='work' AND project_id IS NULL
2. Run project detection:
   - Keyword matching (event title + description)
   - Attendee company matching
   - AI classification (fallback)
3. Update event with detected project_id
4. Log: "{N} events auto-linked to projects"

Frequency: Daily (after new calendar sync)
Impact: Better context in briefings, improved analytics
```

#### Check 2.4: Past Event Archival
```javascript
Problem: Old events clog database and queries

Rule: Events older than 90 days should be archived

QC Action:
1. Find events WHERE start_time < 90 days ago
2. Move to archived_events table (cold storage)
3. Keep metadata for historical queries
4. Update indexes for faster current event queries
5. Log: "{N} events archived"

Frequency: Weekly (Sunday midnight)
Impact: Faster queries, cleaner database
```

---

### Category 3: Task Quality 📋

#### Check 3.1: Orphaned Task Detection
```javascript
Problem: Tasks reference deleted projects

Detection:
SELECT t.* FROM tasks t
LEFT JOIN projects p ON t.project_id = p.id
WHERE t.project_id IS NOT NULL AND p.id IS NULL

QC Action:
1. Find orphaned tasks
2. Attempt to re-detect project (title/description analysis)
3. If detection succeeds, update project_id
4. If detection fails, move to "Misc" or "Inbox" project
5. Log: "{N} orphaned tasks reassigned"

Frequency: Daily
Impact: All tasks have valid project references
```

#### Check 3.2: Rank Recalculation Verification
```javascript
Problem: Task ranks get stale or miscalculated

Detection:
- Tasks with same urgency but inconsistent ranks
- Tasks with due_date changed but rank not updated
- Tasks with urgency changed but rank not recalculated

QC Action:
1. Identify tasks with suspicious ranks
2. Recalculate rank using current formula
3. Update if mismatch > 100 points
4. Log: "{N} task ranks corrected"

Frequency: Daily (midnight)
Impact: Accurate task prioritization
```

#### Check 3.3: Completed Task Cleanup
```javascript
Problem: Completed tasks bloat active queries

Rule: Completed tasks older than 30 days should be archived

QC Action:
1. Find tasks WHERE status='complete' AND completed_at < 30 days ago
2. Move to archived_tasks table
3. Keep references in narratives intact
4. Update indexes
5. Log: "{N} completed tasks archived"

Frequency: Weekly
Impact: Faster active task queries
```

---

### Category 4: Narrative Quality 📝

#### Check 4.1: Low-Significance Narrative Pruning
```javascript
Problem: Auto-generated narratives with low value

Example:
- "Email received from admin@company.com"
- "Calendar updated"
- "File uploaded to Google Drive"

Detection:
WHERE auto_generated = true
  AND significance_score < 0.4
  AND created_at < 14 days ago

QC Action:
1. Review narratives below significance threshold
2. If no related tasks/events, mark for deletion
3. If related entities exist, keep but lower visibility
4. Log: "{N} low-significance narratives removed"

Frequency: Weekly
Impact: Cleaner narrative timelines, better signal-to-noise
```

#### Check 4.2: Narrative Deduplication
```javascript
Problem: Same narrative created multiple times

Example:
- "ITA Airways creative review scheduled" (from email)
- "ITA Airways creative review scheduled" (from calendar event)

Detection:
- Same project_id
- Same date
- Headline similarity > 90%
- Created within 24 hours of each other

QC Action:
1. Identify duplicate narratives
2. Merge bullets from both
3. Keep highest significance_score version
4. Delete duplicate
5. Log: "{N} duplicate narratives merged"

Frequency: Daily
Impact: Cleaner narrative history
```

---

### Category 5: System Health 🏥

#### Check 5.1: Database Integrity
```javascript
Problem: Foreign key orphans, data inconsistencies

Checks:
1. Tasks with invalid project_id
2. Events with invalid project_id
3. Narratives with invalid project_id
4. daily_briefs.event_ids pointing to deleted events
5. Circular references (rare but possible)

QC Action:
1. Generate integrity report
2. Auto-fix safe issues (reassign orphans to "Misc")
3. Flag dangerous issues for manual review
4. Log all findings and actions

Frequency: Daily (midnight)
Impact: Database stays consistent and queryable
```

#### Check 5.2: API Cost Monitoring
```javascript
Problem: Accidental API cost spikes

Monitors:
- Claude API calls per hour
- ElevenLabs TTS usage
- Google Calendar API quota
- Outlier detection (>2x normal usage)

QC Action:
1. Track hourly API usage
2. If spike detected (>2x baseline), alert + investigate
3. Check for infinite loops or bugs
4. Pause non-critical jobs if quota near limit
5. Generate cost report weekly

Frequency: Hourly
Impact: Prevents surprise bills, catches bugs early
```

#### Check 5.3: Background Job Health
```javascript
Problem: Scheduled jobs fail silently

Monitors:
- Briefing generation (3x daily)
- Gmail scanner (3x daily)
- Podcast generation (daily 6am)
- Recurring tasks (every 3 hours)

QC Action:
1. Check last successful run for each job
2. If job missed >2 consecutive runs, alert
3. Attempt to restart failed jobs
4. Log failure reasons
5. Generate health dashboard

Frequency: Every 6 hours
Impact: System reliability improves
```

---

## Implementation Architecture

### Agent File Structure

```yaml
# .claude/agents/playbook-qc-agent.md

---
name: playbook-qc-agent
description: Quality Control agent for Playbook. Runs autonomously to detect and fix data quality issues (duplicate tasks, no-title events, orphaned data, low-quality content). MUST BE USED automatically every 6 hours via cron job.
tools: Read, Write, Edit, Bash
model: haiku  # Fast + cheap for bulk operations
---

You are the Quality Control Agent for Playbook.

Your mission: Keep data clean, accurate, and useful by proactively fixing issues.

## QC Checklist (Run in order)

### 1. Pending Task Quality
- [ ] Semantic duplicate detection
- [ ] Low-quality task filtering
- [ ] Stale pending task cleanup
- [ ] Already-completed task detection

### 2. Event Quality
- [ ] No-title event enrichment
- [ ] Duplicate event cleanup
- [ ] Missing project association
- [ ] Past event archival

### 3. Task Quality
- [ ] Orphaned task detection
- [ ] Rank recalculation verification
- [ ] Completed task cleanup

### 4. Narrative Quality
- [ ] Low-significance narrative pruning
- [ ] Narrative deduplication

### 5. System Health
- [ ] Database integrity checks
- [ ] API cost monitoring
- [ ] Background job health

## Output Format

Generate a QC Report:

```markdown
# Quality Control Report - {timestamp}

## Summary
- {N} issues detected
- {M} issues auto-fixed
- {P} issues flagged for manual review

## Actions Taken
1. **Pending Tasks**: Dismissed {X} duplicates, {Y} low-quality
2. **Events**: Enriched {A} titles, hid {B} duplicates
3. **Database**: Fixed {C} orphaned references

## Alerts
- ⚠️ {Alert 1}
- ⚠️ {Alert 2}

## Recommendations
- Consider: {Suggestion 1}
- Consider: {Suggestion 2}
```

Store report in: `qc_reports/{date}.md`
```

---

### Cron Job Integration

```javascript
// backend/jobs/quality-control.js

const cron = require('node-cron');

// Run every 6 hours (midnight, 6am, noon, 6pm ET)
cron.schedule('0 0,6,12,18 * * *', async () => {
  console.log('🔍 Quality Control Agent starting...');

  try {
    // Invoke the QC agent via Task tool
    const report = await runQCAgent();

    // Save report
    await saveQCReport(report);

    // If critical alerts, send notification
    if (report.criticalAlerts.length > 0) {
      await sendNotification(report.criticalAlerts);
    }

    console.log(`✅ QC complete: ${report.issuesFixed} issues fixed`);
  } catch (error) {
    console.error('❌ QC Agent failed:', error);
    await logError(error);
  }
}, {
  timezone: 'America/New_York'
});
```

---

### Database Schema for QC Tracking

```sql
-- Track QC agent runs
CREATE TABLE qc_runs (
  id UUID PRIMARY KEY,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  status TEXT, -- 'running', 'completed', 'failed'
  issues_detected INTEGER,
  issues_fixed INTEGER,
  alerts_raised INTEGER,
  execution_time_ms INTEGER,
  report_path TEXT
);

-- Track individual QC actions
CREATE TABLE qc_actions (
  id UUID PRIMARY KEY,
  qc_run_id UUID REFERENCES qc_runs(id),
  action_type TEXT, -- 'dismiss_duplicate', 'enrich_title', 'fix_orphan'
  entity_type TEXT, -- 'task', 'event', 'narrative'
  entity_id UUID,
  before_state JSONB,
  after_state JSONB,
  reasoning TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_qc_actions_entity ON qc_actions(entity_type, entity_id);
CREATE INDEX idx_qc_runs_date ON qc_runs(started_at DESC);
```

---

## User Interface Integration

### QC Dashboard (Optional)

```
/dashboard/quality-control

Shows:
- Last QC run timestamp
- Issues fixed in last 24 hours
- Pending manual review items
- Historical trends (issues over time)
- QC agent health status
```

### QC Badges in UI

```typescript
// Show QC status on pages

// Tasks page
<Badge>
  {pendingTasks.length} pending
  {qcDismissedToday > 0 && (
    <Tooltip>QC auto-dismissed {qcDismissedToday} today</Tooltip>
  )}
</Badge>

// Brief page
{event.qc_enriched && (
  <Tooltip>Title enriched by QC agent</Tooltip>
)}
```

---

## Configuration File

```javascript
// backend/config/qc-config.js

module.exports = {
  // Schedule
  schedule: '0 0,6,12,18 * * *', // Every 6 hours

  // Thresholds
  thresholds: {
    duplicateSimilarity: 0.90,      // 90% match = duplicate
    lowQualityScore: 0.40,          // Below 40% = dismiss
    stalePendingDays: 7,            // 7 days = stale
    lowSignificance: 0.40,          // Below 40% = prune
    archiveCompletedDays: 30,       // 30 days = archive
    archiveEventsDays: 90,          // 90 days = archive
  },

  // Safety limits (prevent mass deletion bugs)
  safetyLimits: {
    maxDismissPerRun: 50,           // Don't dismiss >50 tasks at once
    maxHidePerRun: 20,              // Don't hide >20 events at once
    maxDeletePerRun: 100,           // Don't delete >100 narratives at once
  },

  // Notifications
  notifications: {
    criticalAlerts: true,           // Send alerts for critical issues
    dailyDigest: true,              // Send daily QC summary
    weeklyReport: true,             // Send weekly trends
  },

  // Auto-fix vs. flag for review
  autoFix: {
    duplicateTasks: true,           // Auto-dismiss duplicates
    lowQualityTasks: true,          // Auto-dismiss low quality
    noTitleEvents: true,            // Auto-enrich titles
    duplicateEvents: true,          // Auto-hide duplicates
    orphanedData: true,             // Auto-reassign orphans
    stalePending: false,            // Flag for review (don't auto-dismiss)
  }
};
```

---

## Rollout Plan

### Phase 1: Build Core QC Agent (Week 1)
**Time:** 8 hours

1. Create `playbook-qc-agent.md` (2 hours)
2. Implement QC checks 1-3 (pending tasks, events, tasks) (4 hours)
3. Create QC database tables (1 hour)
4. Test on production data (read-only) (1 hour)

**Deliverable:** QC agent that detects issues, generates report

---

### Phase 2: Enable Auto-Fix (Week 2)
**Time:** 6 hours

1. Add write permissions to QC agent (1 hour)
2. Implement auto-fix logic with safety limits (3 hours)
3. Test auto-fix on development database (1 hour)
4. Deploy to production with conservative thresholds (1 hour)

**Deliverable:** QC agent automatically fixes safe issues

---

### Phase 3: Cron Integration (Week 2)
**Time:** 4 hours

1. Create `jobs/quality-control.js` (2 hours)
2. Configure cron schedule (every 6 hours) (1 hour)
3. Add error handling and logging (1 hour)

**Deliverable:** QC agent runs automatically

---

### Phase 4: Monitoring & Refinement (Week 3)
**Time:** 4 hours

1. Monitor QC runs for 1 week (ongoing)
2. Tune thresholds based on false positives (2 hours)
3. Add QC dashboard to frontend (optional) (2 hours)

**Deliverable:** Stable, tuned QC agent

---

## Success Metrics

### Week 1 (Detection Only)
- [ ] QC agent detects 20+ issues per run
- [ ] Report generation works
- [ ] No false positives in detection

### Week 2 (Auto-Fix Enabled)
- [ ] 80%+ of detected issues auto-fixed
- [ ] 0 false positive fixes (verified manually)
- [ ] Pending queue size reduces by 30%
- [ ] "No title" events reduce by 90%

### Week 3 (Fully Automated)
- [ ] QC agent runs reliably every 6 hours
- [ ] User notices cleaner data before logging in
- [ ] Manual cleanup time reduces from 10 min/day to 2 min/day

### Long-term (Month 2+)
- [ ] 95%+ data quality (no garbage in UI)
- [ ] User rarely needs to dismiss/fix things manually
- [ ] System "just works" from user perspective

---

## Risk Mitigation

### Risk 1: QC Agent Over-Corrects
**Mitigation:**
- Safety limits on actions per run
- Log all actions for audit trail
- Manual review queue for uncertain fixes
- Rollback capability (restore from qc_actions table)

### Risk 2: False Positive Dismissals
**Mitigation:**
- Conservative thresholds (90% similarity for duplicates)
- Multi-factor checks (not just title matching)
- User can restore dismissed items
- Weekly report for user to review actions

### Risk 3: Performance Impact
**Mitigation:**
- Use Haiku model (fast + cheap)
- Batch operations efficiently
- Run during low-usage hours (midnight, 6am)
- Set execution timeout (5 minutes max)

### Risk 4: Agent Breaks Something
**Mitigation:**
- Test extensively on development database first
- Roll out auto-fix gradually (read-only → safe fixes → all fixes)
- Database backups before each QC run
- Kill switch (disable auto-fix via config flag)

---

## Comparison to Multi-Agent

| Aspect | Multi-Agent System | QC Agent |
|--------|-------------------|----------|
| **Complexity** | High (5 agents + orchestrator) | Low (1 agent) |
| **Latency Impact** | 2.5x slower | None (runs in background) |
| **Cost** | 3x increase | <10% increase |
| **Value Add** | Theoretical organization | **Solves real pain points** ✅ |
| **Risk** | High (distributed system) | Low (isolated background job) |
| **Time to Implement** | 6 weeks | **2 weeks** ✅ |
| **User Impact** | Minimal | **Immediately noticeable** ✅ |

**QC Agent is a MUCH better investment.**

---

## Future Enhancements

### Smart Suggestions
```javascript
// QC agent notices patterns and suggests improvements

"I noticed you always dismiss tasks from 'claude-code-examples' folder.
Would you like me to automatically filter these in the future?"

"I see 5 events this week with no project association.
Should I create a new project for 'Client Onboarding'?"
```

### Learning from User Actions
```javascript
// Track what user approves vs dismisses

const userPreferences = {
  dismissedTaskPatterns: [
    'Think about...',
    'Consider...',
    'from claude-code-examples/'
  ],
  approvedTaskPatterns: [
    'Finalize...',
    'Ship...',
    'from /Clients/'
  ]
};

// QC agent learns and adapts thresholds
```

### Predictive Cleanup
```javascript
// QC agent predicts what user will want to dismiss

"I predict you'll dismiss 8 of these 15 pending tasks.
Would you like me to auto-dismiss them now?"
```

---

## Documentation for User

### What is the QC Agent?

The Quality Control Agent is your data janitor. It runs every 6 hours to:
- Remove duplicate pending tasks
- Enrich "no title" calendar events
- Clean up stale data
- Fix database inconsistencies

**You don't need to do anything.** Just log in to clean, organized data.

### What if QC makes a mistake?

All QC actions are logged and reversible:
1. Check `/dashboard/quality-control` to see recent actions
2. Click "Undo" on any action
3. Flag false positives to improve future runs

### Can I configure QC behavior?

Yes! Edit `backend/config/qc-config.js`:
- Adjust thresholds (how aggressive QC should be)
- Enable/disable specific checks
- Set safety limits

---

## Conclusion

The Quality Control Agent is **exactly the right solution** for Playbook:

✅ **Solves real pain** - You mentioned this problem specifically
✅ **Low complexity** - Single agent, clear responsibility
✅ **No latency impact** - Runs in background, invisible to user
✅ **High value** - Dramatically improves data quality
✅ **Quick to implement** - 2 weeks vs. 6 weeks for multi-agent
✅ **Low risk** - Isolated system, easy to disable/rollback

**This is what AI should do: Handle tedious cleanup so you can focus on what matters.**

---

**Next Steps:**
1. Review and approve this design
2. Implement Phase 1 (detection only) - 8 hours
3. Test on production data (read-only)
4. Enable auto-fix with conservative settings
5. Monitor and tune for 1 week
6. Enjoy cleaner data ✨

---

**Ready to build this?** This is a genuine improvement to the system.
