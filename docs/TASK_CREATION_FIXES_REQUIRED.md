# Task Creation Logic - Required Fixes
**Date:** October 24, 2025
**Investigation:** Reviewed all 18 pending tasks with Tom
**Result:** 9 valid (50%), 8 too old (44%), 2 Claude Code prompts (11%)

---

## Executive Summary

**The Good News:** 50% of pending tasks were valid - the system is working reasonably well!

**The Bad News:** Half of pending tasks should never have been created due to:
1. **Stale documents** (8 tasks from files 13-17 days old)
2. **Claude Code conversational prompts** (2 tasks from AI-generated questions)

**Critical Fix:** Add 24-hour recency filter - this alone would eliminate 44% of false positives.

---

## Issue #1: STALE DOCUMENT PROCESSING (Priority: CRITICAL)

### The Problem
8 of 18 tasks (44%) were created from documents modified 13-17 days before task creation.

**Examples:**
- Tasks #2-3, #16: Baileys files from Oct 6 → tasks created Oct 23 (17 days old)
- Tasks #17-18: CAVA file from Oct 10 → tasks created Oct 23 (13 days old)
- Task #6: Impersonas file from Oct 6 → task created Oct 23 (17 days old)

**Why this is critical:**
- Tasks with relative dates are meaningless ("tomorrow" from Oct 6 is not tomorrow today)
- Action items from old meetings are likely already handled or outdated
- Creates noise and erodes trust in the system

### Root Cause
Unknown trigger on Oct 23 processed multiple old files:
- Not from file modifications (files hadn't changed)
- Possibly: server restart, manual script, or system glitch
- Vault watcher should only fire on actual file changes

### The Fix

**Location:** `backend/watchers/vault-watcher.js` and `backend/services/data-processor.js`

**Implementation:**
```javascript
// In vault-watcher.js handleNewFile() and handleFileChange()
async handleFileChange(filepath) {
  try {
    // Get file stats
    const stats = await fs.stat(filepath);

    // CRITICAL: Only process files modified in last 24 hours
    const fileAge = Date.now() - stats.mtime.getTime();
    const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

    if (fileAge > MAX_AGE_MS) {
      const ageInDays = Math.floor(fileAge / (24 * 60 * 60 * 1000));
      console.log(`⏭️  Skipping task extraction: File too old (${ageInDays} days) - ${filepath}`);
      return;
    }

    // Continue with normal processing...
  } catch (error) {
    console.error('Error in handleFileChange:', error);
  }
}
```

**Apply to:**
- ✅ `handleNewFile()` - when new files are detected
- ✅ `handleFileChange()` - when files are modified
- ✅ Any manual processing scripts
- ✅ Batch operations

**Rationale:** With constant vault watching, fresh tasks are caught within minutes/hours. Anything older than 24h is either already actioned, already dismissed, or no longer relevant.

---

## Issue #2: CLAUDE CODE CONVERSATIONAL PROMPTS (Priority: HIGH)

### The Problem
2 of 18 tasks (11%) were created from Claude Code asking open-ended planning questions.

**Examples:**
- Task #4: "Plan next Impersonas test topic or use case"
  - From: `TEST_COMPLETE_Summary.md`
  - Content: "What's the next test you want to run?"

- Task #5: "Decide on Impersonas implementation path"
  - From: Same summary file
  - Content: "How do you want to work with Impersonas?" with options A, B, C

**Why this is wrong:**
- These are AI-generated prompts for discussion, not commitments from meetings/emails
- No external accountability or deadline
- User explicitly said: "I would rather have next steps for tasks pulled from project milestones - not the vault watcher"

### The Fix

**Location:** `backend/watchers/vault-watcher.js`

**Expand Claude Code exclusion patterns:**
```javascript
// In vault-watcher.js, expand skip patterns
const claudeCodeSkipPatterns = [
  // Existing patterns
  'project-overview',
  'project-summary',
  'implementation-plan',
  'technical-spec',
  // ... existing patterns ...

  // ADD THESE NEW PATTERNS:
  'summary',           // TEST_COMPLETE_Summary.md
  '_summary',
  'test_complete',
  'test-complete',
  'status',
  'overview',
  'plan',
  'next-steps',
  'next_steps',
  'recommendations',
  'options',
];

// In handleNewFile(), after checking filename patterns:
if (filepath.includes('/Claude Code/')) {
  const shouldSkip = claudeCodeSkipPatterns.some(pattern =>
    filenameLower.includes(pattern)
  );

  if (shouldSkip) {
    console.log(`⏭️  Skipping Claude Code summary/planning file: ${filename}`);
    return;
  }

  // ALSO: Content-based filtering for question prompts
  const contentLower = content.toLowerCase();
  const questionIndicators = [
    'what\'s the next',
    'what do you want to',
    'how do you want to',
    'which option do you prefer',
    'should we',
    'would you like to',
    'what are your thoughts on',
    'how would you like to proceed'
  ];

  const hasOpenEndedQuestion = questionIndicators.some(indicator =>
    contentLower.includes(indicator)
  );

  if (hasOpenEndedQuestion) {
    console.log(`⏭️  Skipping Claude Code conversational prompt: ${filename}`);
    return;
  }
}
```

**Philosophy:**
- ✅ YES: Extract tasks from meeting notes where Tom commits to others
- ✅ YES: Extract tasks from emails with clear assignments
- ❌ NO: Extract tasks from Claude Code documentation/planning files
- ❌ NO: Extract "what should we do next?" open-ended questions

---

## Issue #3: URGENCY OVER-ESTIMATION (Priority: MEDIUM)

### The Problem
Task #1: "Distribute AI POV poster to team" was marked as "Soon" but should be "Eventually"

**Why it failed:**
- Leadership request (from Bryan) → AI assumes high priority
- But: No deadline, no active project tie-in
- This is a "nice to have" suggestion, not urgent work

### The Fix

**Location:** `backend/ai/email-analyzer.js` or `backend/ai/meeting-analyzer.js`

**Improve urgency classification:**
```javascript
// In the analysis prompt, refine urgency rules:

URGENCY CLASSIFICATION:
- "Now" (immediate):
  * Explicit deadline within 3 days
  * Uses words: "urgent", "ASAP", "immediately", "today", "by EOD"
  * Blocking other work or people waiting

- "Soon" (this week/next week):
  * Deadline within 2 weeks
  * Active project dependency
  * Mentioned in context of ongoing work
  * Clear commitment made in meeting/email

- "Eventually" (someday/maybe):
  * No deadline mentioned
  * Suggestions or "would be nice" phrasing
  * Not tied to active project
  * FYI requests without time pressure
  * Leadership suggestions without urgency signals

OVERRIDE: If no deadline AND no active project, default to "Eventually"
```

**Specific indicators for "Eventually":**
- "would be nice", "if you get a chance", "when you have time"
- "suggestion", "idea", "thought"
- Leadership general asks without deadlines

---

## Issue #4: DUE DATE PARSING (Priority: HIGH)

### The Problem
0 of 18 tasks had `due_date` field populated, despite many mentioning deadlines.

**Examples missed:**
- "by 11am tomorrow" (Task #3)
- "October 30 delivery" (Task #12)
- "October 28 week" (Task #14)
- "December 4th at 1pm" (Task #8)

**Impact:** Tasks can't be properly prioritized by deadline in the UI.

### The Fix

**Location:** `backend/ai/email-analyzer.js` and `backend/services/data-processor.js`

**Step 1: Enhance AI extraction**
```javascript
// In email-analyzer.js, update prompt instructions:

3. ACTION ITEMS (Tasks)
   ...
   - Due date: Parse from text and convert to YYYY-MM-DD format
     * "tomorrow" → calculate next day from document date
     * "next week" → calculate following Monday
     * "by October 30" → "2025-10-30"
     * "December 4th at 1pm" → "2025-12-04"
     * "week of Oct 28" → "2025-10-28" (start of week)
     * If time mentioned (e.g., "1pm", "11am"), note in description
     * If ambiguous date, set confidence *= 0.9

Return in JSON with structured due_date field.
```

**Step 2: Add date parsing helper**
```javascript
// In data-processor.js, add date parsing function:

function parseDueDateFromText(text, documentDate) {
  const now = documentDate ? new Date(documentDate) : new Date();

  // Relative dates
  if (/\btomorrow\b/i.test(text)) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  if (/\bnext week\b/i.test(text)) {
    const nextMonday = new Date(now);
    nextMonday.setDate(nextMonday.getDate() + (8 - nextMonday.getDay()));
    return nextMonday.toISOString().split('T')[0];
  }

  // Specific dates: "October 30", "Dec 4th", "10/28"
  const datePatterns = [
    /(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i, // "October 30" or "Oct 30, 2025"
    /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/,                // "10/28" or "10/28/25"
    /week of\s+(\w+)\s+(\d{1,2})/i                         // "week of Oct 28"
  ];

  // Implement date parsing logic...
  // (Full implementation would be ~50 lines)

  return null; // If no date found
}

// In createPendingTask(), before insert:
if (!task.due_date && (task.description || task.title)) {
  const text = `${task.title} ${task.description || ''}`;
  const parsedDate = parseDueDateFromText(text, task.detected_from);

  if (parsedDate) {
    task.due_date = parsedDate;
    console.log(`   📅 Parsed due date: ${parsedDate}`);
  }
}
```

---

## Issue #5: DELEGATION DETECTION (Priority: MEDIUM)

### The Problem
Task #18: "Identify stakeholder interview opportunities with CAVA" was assigned to Shannon, not Tom.

**AI reasoning said:** "Shannon explicitly committed: 'Shannon to identify...' - this is a clear action item assigned to Shannon but Tom needs awareness. Tom will coordinate with Shannon on this."

**Why it failed:**
- AI detected it was Shannon's task
- But still created it as Tom's task with note "Tom needs awareness"
- Should either: not create it, or create as `task_type: 'delegated'` with `assigned_to: 'Shannon'`

### The Fix

**Location:** `backend/ai/email-analyzer.js`

**Add delegation detection to classification rules:**
```javascript
// In the prompt, add to CLASSIFICATION RULES section:

DELEGATION DETECTION:
❌ NOT YOUR TASK (Tom's) if:
- "[Name other than Tom] will..."
- "Assigned to [Name other than Tom]"
- "[Name] to handle..."
- "Let [Name] take this"
- Uses third person: "Shannon to identify...", "Alex is handling..."
- "[Name] owns this", "[Name] is responsible for"

If delegated task detected:
{
  "isDelegated": true,
  "assignedTo": "[name]",
  "createTask": false,  // Don't create as pending task for Tom
  "reasoning": "Delegated to [name]"
}

NOTE: Only create tasks where Tom has direct responsibility or explicit commitment.
```

**Alternative approach (if you want awareness of delegated tasks):**
```javascript
// Create as separate task type:
{
  "task_type": "delegated",
  "assigned_to": "Shannon",
  "status": "active",  // Not "pending" since it's not awaiting Tom's approval
  "confidence": 0.7,   // Lower confidence
  "title": "[Delegated to Shannon] Identify stakeholder interview opportunities"
}
```

**Decision needed:** Should delegated tasks be:
- **Option A:** Not created at all (recommended)
- **Option B:** Created with special `delegated` type for awareness
- **Option C:** Created but with lower confidence threshold

---

## Issue #6: DUPLICATE DETECTION - RELATED TASKS (Priority: LOW)

### The Problem
Tasks #8 and #9 are highly related but both were created:
- Task #8: "Prepare presentation deck for Mickey/Monica"
- Task #9: "Develop 'Win the Long Game' territory with manifesto"

**Analysis:**
- Same meeting, same project (TIAA Longevity)
- Task #9 is the underlying work to create Task #8's deliverable
- Created 0.49 seconds apart
- Tom was surprised these weren't flagged as duplicates

**Why duplicate detector missed it:**
- Different action verbs: "Prepare presentation" vs "Develop territory"
- Different objects: "deck" vs "manifesto and activations"
- Moderate word overlap (~40%)
- No shared key nouns beyond project name

### The Fix (Optional)

**Location:** `backend/services/data-processor.js` - `isDuplicateTask()` function

**Add hierarchical/related task detection:**
```javascript
// After existing duplicate checks, add:

// PHASE 5: Related/Hierarchical task detection
// Check if tasks are from same meeting AND same project AND created within 60 seconds
if (task.detected_from === existing.detected_from) {
  const createdWithinMinute = Math.abs(
    new Date(task.created_at) - new Date(existing.created_at)
  ) < 60000;

  if (createdWithinMinute && task.project_id === existing.project_id) {
    // Check for semantic relationship
    const combinedSimilarity = calculateSimilarity(
      `${task.title} ${task.description}`,
      `${existing.title} ${existing.description}`
    );

    if (combinedSimilarity > 0.35) {
      console.log(`⚠️  Potential related task (same meeting, same project, 35% similarity)`);
      console.log(`   Existing: "${existing.title}"`);
      console.log(`   New: "${task.title}"`);
      console.log(`   Consider: These might be hierarchical (parent/subtask)`);

      // Don't auto-reject, but flag for review
      // Could add a "related_task_id" field or special status
    }
  }
}
```

**User feedback:** Tom said both are valid tasks (prepare deck + develop content are separate). So this fix is **optional** - not urgent.

---

## Issue #7: EMOJI INCONSISTENCY (Priority: LOW)

### The Problem
Only 3 of 18 tasks (16%) have emoji in titles, despite prompt saying: "Title: 2-10 words, actionable, ending with ONE relevant emoji"

**Decision needed:** Enforce emoji rule or remove it?

### The Fix

**Option A: Enforce Emoji** (if you want them)
```javascript
// In data-processor.js, validate emoji presence:
if (task.auto_detected && !task.title.match(/[\u{1F300}-\u{1F9FF}]/u)) {
  // Append contextual emoji based on task type
  const emojiMap = {
    'meeting': '📞',
    'presentation': '📊',
    'write': '✍️',
    'review': '📋',
    'schedule': '📅',
    'default': '📝'
  };

  // Detect task type and append emoji
  task.title += ' ' + (emojiMap[detectedType] || emojiMap.default);
}
```

**Option B: Remove Emoji** (cleaner, recommended)
```javascript
// In email-analyzer.js, remove from prompt:
// DELETE: ", ending with ONE relevant emoji"
// DELETE: Entire emoji selection guide section
```

**Recommendation:** Remove emoji requirement. Most tasks don't have them anyway, and they add visual clutter. Focus on clear, concise titles.

---

## Weekly Summary Documents (Priority: NONE)

### The Situation
7 of 18 tasks (39%) came from `2025-10-21_Weekly_Summary.md`

**Tom's decision:** "Don't worry about weekly summaries - they won't happen often"

**Action:** No filter needed. Manual dismissal is acceptable for infrequent summaries.

---

## Implementation Checklist

### Priority 1: CRITICAL (Must implement immediately)
- [ ] **24-hour recency filter** in `vault-watcher.js`
  - Eliminates 44% of false positives
  - Files: `handleNewFile()`, `handleFileChange()`
  - Estimated time: 30 minutes

### Priority 2: HIGH (Implement this week)
- [ ] **Claude Code summary exclusions** in `vault-watcher.js`
  - Add filename patterns: `summary`, `test_complete`, `status`, etc.
  - Add content-based question detection
  - Eliminates 11% of false positives
  - Estimated time: 45 minutes

- [ ] **Due date parsing** in `email-analyzer.js` and `data-processor.js`
  - Enhance AI extraction prompt
  - Add `parseDueDateFromText()` helper
  - Improves task prioritization
  - Estimated time: 2 hours

### Priority 3: MEDIUM (Implement this month)
- [ ] **Urgency classification improvements** in `email-analyzer.js`
  - Add "Eventually" detection rules
  - Check for deadline + active project
  - Estimated time: 30 minutes

- [ ] **Delegation detection** in `email-analyzer.js`
  - Add name-based assignment parsing
  - Decide: skip delegated tasks or create with special type
  - Estimated time: 1 hour

### Priority 4: LOW (Nice to have)
- [ ] **Emoji policy decision** and implementation
  - Decide: enforce or remove
  - Update prompt or add validation
  - Estimated time: 15 minutes

- [ ] **Related task detection** (optional)
  - Only if Tom wants hierarchical task linking
  - Add Phase 5 to duplicate detector
  - Estimated time: 1 hour

---

## Testing Plan

After implementing fixes:

### 1. Temporal Filter Test
```bash
# Create old test file
touch -t 202510010000 /path/to/old-test-file.md
# Modify and verify it's skipped
# Should see: "⏭️  Skipping task extraction: File too old (23 days)"
```

### 2. Claude Code Filter Test
Create test files:
- `TEST_COMPLETE_Summary.md` - should skip
- `Project_Status_Report.md` - should skip
- File with "What's the next test you want to run?" - should skip

### 3. Due Date Parsing Test
Test cases:
- "by tomorrow at 3pm" → should extract date
- "October 30 delivery" → "2025-10-30"
- "week of Oct 28" → "2025-10-28"
- "in 2 weeks" → calculated date

### 4. Delegation Detection Test
Test phrases:
- "Shannon will handle the outreach"
- "Assigned to: Bryan"
- "Tom to review, Shannon to execute" (should only create Tom's part)

### 5. End-to-End Test
1. Process 10 recent meeting notes
2. Manually review resulting pending tasks
3. Check false positive rate (target: <20%)
4. Verify no valid tasks were filtered out

---

## Success Metrics

**Before fixes:**
- False positive rate: 50% (9 of 18 valid)
- Avg time to dismiss invalid task: ~10 seconds
- Total time wasted: 90 seconds per batch

**After fixes (expected):**
- False positive rate: <20% (target: 80%+ valid)
- Stale documents: 0% (blocked by 24h filter)
- Claude Code prompts: 0% (blocked by exclusions)
- Time savings: ~70 seconds per batch

**ROI:** Implementation time ~5 hours, saves ~60 seconds per day = breakeven in ~5 months. Plus improved trust in system.

---

## Files to Modify

Summary of all files needing changes:

1. **`backend/watchers/vault-watcher.js`**
   - Add 24-hour recency check
   - Expand Claude Code exclusion patterns
   - Add content-based question detection

2. **`backend/ai/email-analyzer.js`**
   - Update urgency classification rules
   - Add delegation detection
   - Enhance due date extraction
   - Remove emoji requirement (optional)

3. **`backend/services/data-processor.js`**
   - Add `parseDueDateFromText()` helper
   - Apply parsed dates before task creation
   - Optional: Add related task detection

4. **`backend/ai/meeting-analyzer.js`** (if separate from email-analyzer)
   - Apply same urgency and delegation rules

---

## Questions for Final Implementation

Before I write the code, please confirm:

1. **Delegation Detection:** Should delegated tasks be:
   - A) Not created at all ← (recommended)
   - B) Created with special `delegated` type
   - C) Created but flagged somehow

2. **Emoji Policy:**
   - A) Remove emoji requirement ← (recommended, cleaner)
   - B) Enforce emoji for all tasks

3. **Related Tasks (Tasks #8-9):**
   - A) Keep both as separate tasks ← (your feedback)
   - B) Try to detect and link hierarchically

4. **Implementation Order:**
   - Start with Priority 1 (24h filter) immediately?
   - Or review full plan first?

---

**Ready to implement fixes once you confirm preferences above!**
