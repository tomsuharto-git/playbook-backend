# AI Task Manager System Refactoring Implementation Plan
**Version:** 1.0
**Created:** October 28, 2025
**Author:** Claude (Opus 4.1)
**Status:** READY FOR IMPLEMENTATION

---

## Executive Summary

This document provides a detailed, step-by-step implementation plan to address the critical issues identified in the forensic analysis of the AI Task Manager (Playbook) system. The plan focuses on reducing the 50% false positive rate, fixing inconsistencies between Gmail and Outlook scanners, and systematizing ad-hoc patches.

**Total Time Estimate:** 30 hours over 8-12 weeks
**Expected False Positive Reduction:** 50% → <20%
**Expected API Cost Savings:** $10-15/month

---

## Phase 1: Critical Fixes (Week 1)
**Goal:** Stop the bleeding - eliminate major false positives and waste
**Time:** 4 hours total
**Impact:** 44% reduction in false positives, 90% reduction in Outlook API calls

### 1.1 Add 24-Hour Recency Filter (30 minutes)

**Problem:** Processing files 13-17 days old creates outdated tasks with meaningless relative dates
**Impact:** 44% of false positives (8 of 18 tasks in Oct 24 analysis)

**Implementation Steps:**

1. **File:** `backend/watchers/vault-watcher.js`
2. **Location:** After line 98 (right after markdown check)
3. **Code to add:**

```javascript
// Add after the markdown check (around line 98)
const stats = await fs.stat(filepath);
const fileAge = Date.now() - stats.mtime.getTime();
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

if (fileAge > MAX_AGE_MS) {
  const ageInDays = Math.floor(fileAge / (24 * 60 * 60 * 1000));
  console.log(`⏭️  Skipping task extraction from ${path.basename(filepath)}: File too old (${ageInDays} days)`);
  return;
}

console.log(`   📅 File age: ${Math.floor(fileAge / (60 * 60 * 1000))} hours - within 24h threshold`);
```

4. **Also add to `handleFileChange()` function** (around line 150):
   - Same logic to prevent old file modifications from creating tasks

5. **Testing:**
   - Touch an old file: `touch "../Notion/WORK/Clients/old-meeting.md"`
   - Verify it's skipped in logs
   - Create a new file and verify it's processed

### 1.2 Add Narrative Logging from Vault (1 hour)

**Problem:** Meeting notes don't appear in briefing context
**Impact:** Missing strategic context in daily briefings

**Implementation Steps:**

1. **File:** `backend/jobs/gmail-scanner.js`
2. **Export the function** (add after line 402):

```javascript
// Export for use by vault-watcher
module.exports = {
  scanGmailForTasks,
  updateProjectNarrative  // Add this export
};
```

3. **File:** `backend/watchers/vault-watcher.js`
4. **Import at top** (around line 10):

```javascript
const { updateProjectNarrative } = require('../jobs/gmail-scanner');
```

5. **Add after task creation** (after line 344):

```javascript
// Create narrative log if project was identified
if (analysis.project_updates && projectId) {
  try {
    // Extract key points from the analysis
    const narrativeBullets = [];

    // Add project updates if present
    if (analysis.project_updates.progress_notes) {
      narrativeBullets.push(analysis.project_updates.progress_notes);
    }
    if (analysis.project_updates.next_milestone) {
      narrativeBullets.push(`Next: ${analysis.project_updates.next_milestone}`);
    }
    if (analysis.project_updates.status_change) {
      narrativeBullets.push(`Status: ${analysis.project_updates.status_change}`);
    }

    // Add created tasks to narrative
    if (tasksCreated > 0) {
      const taskTitles = analysis.tasks
        .slice(0, 3)  // Limit to first 3 tasks
        .map(t => t.title)
        .join(', ');
      narrativeBullets.push(`Tasks identified: ${taskTitles}`);
    }

    // Construct narrative object
    const narrative = {
      headline: analysis.summary ||
                analysis.project_updates.next_milestone ||
                `${path.basename(filepath, '.md')} meeting notes processed`,
      bullets: narrativeBullets.filter(Boolean).slice(0, 5) // Max 5 bullets
    };

    // Get file date (prefer content date over file date)
    const stats = await fs.stat(filepath);
    const fileDate = new Date(stats.mtime).toISOString().split('T')[0];

    // Check if narrative has meaningful content
    if (narrative.bullets.length > 0) {
      await updateProjectNarrative(projectId, narrative, fileDate, 'meeting');
      console.log(`   📝 Created narrative log for project: ${projectId}`);
      console.log(`      Headline: ${narrative.headline}`);
      console.log(`      Bullets: ${narrative.bullets.length} items`);
    }
  } catch (error) {
    console.error(`   ❌ Failed to create narrative log:`, error.message);
    // Don't fail task creation if narrative fails
  }
}
```

6. **Testing:**
   - Create a meeting note for an existing project
   - Check Supabase projects table, narrative field
   - Verify narrative appears in next briefing generation

### 1.3 Fix Outlook Email Deduplication (1 hour)

**Problem:** Re-scanning same 50 emails multiple times daily
**Impact:** 90% wasted API calls, $2-4/week

**Implementation Steps:**

1. **File:** `backend/services/data-processor.js`
2. **Add new function** (after line 500):

```javascript
/**
 * Filter out already processed Outlook emails
 */
async function filterProcessedOutlookEmails(emails) {
  if (!emails || emails.length === 0) return [];

  try {
    // Extract all email IDs
    const emailIds = emails
      .map(e => e.id || e.internetMessageId)
      .filter(Boolean);

    if (emailIds.length === 0) {
      console.log('   ⚠️  No email IDs found in Outlook emails');
      return emails; // Can't deduplicate without IDs
    }

    // Check which have been processed
    const { data: processedEmails, error } = await supabase
      .from('processed_emails')
      .select('email_id')
      .in('email_id', emailIds)
      .eq('source', 'outlook');

    if (error) {
      console.error('   ❌ Error checking processed emails:', error);
      return emails; // On error, process all to be safe
    }

    const processedIds = new Set(processedEmails?.map(e => e.email_id) || []);

    // Filter to only new emails
    const newEmails = emails.filter(e => {
      const emailId = e.id || e.internetMessageId;
      return emailId && !processedIds.has(emailId);
    });

    console.log(`   📊 Outlook email filtering:`);
    console.log(`      Total emails: ${emails.length}`);
    console.log(`      Already processed: ${processedIds.size}`);
    console.log(`      New emails to process: ${newEmails.length}`);
    console.log(`      API calls saved: ${emails.length - newEmails.length}`);

    return newEmails;
  } catch (error) {
    console.error('   ❌ Error in filterProcessedOutlookEmails:', error);
    return emails; // On error, process all
  }
}
```

3. **Modify `processOutlookData()` function** (around line 300):

```javascript
async function processOutlookData(outlookData) {
  const filePath = path.join(__dirname, '..', 'data', 'outlook_data.json');

  console.log('\n🔍 Processing Outlook emails...');
  console.log(`   📁 Data contains ${outlookData.length} total emails`);

  // NEW: Filter out already processed emails
  const newEmails = await filterProcessedOutlookEmails(outlookData);

  if (newEmails.length === 0) {
    console.log('   ✅ All emails already processed - skipping');
    return { created: 0, skipped: 0, errors: [] };
  }

  // Save filtered data for processing
  await fs.writeFile(filePath, JSON.stringify(newEmails, null, 2));
  console.log(`   💾 Saved ${newEmails.length} new emails for processing`);

  // Continue with existing processing...
  const results = await processWithAI(filePath, 'outlook');

  // NEW: Mark emails as processed after successful task creation
  for (const email of newEmails) {
    const emailId = email.id || email.internetMessageId;
    if (emailId) {
      try {
        await supabase.from('processed_emails').insert({
          email_id: emailId,
          source: 'outlook',
          subject: email.subject || 'No subject',
          from_email: email.from?.emailAddress?.address || 'unknown',
          received_date: email.receivedDateTime || new Date().toISOString(),
          tasks_created: 0, // Will be updated if tasks are created
          narrative_updated: false
        });
      } catch (error) {
        // Ignore duplicate key errors
        if (!error.message?.includes('duplicate')) {
          console.error(`   ⚠️  Failed to mark email as processed:`, error.message);
        }
      }
    }
  }

  return results;
}
```

4. **Testing:**
   - Run Outlook scanner once
   - Check `processed_emails` table for new entries
   - Run again immediately - should skip all emails
   - Monitor logs for "API calls saved" metric

### 1.4 Verification & Monitoring

After implementing all Phase 1 fixes:

1. **Monitor for 3 days:**
   - Daily false positive count
   - API call reduction metrics
   - Narrative creation from meetings

2. **Success metrics:**
   - False positives should drop by ~40%
   - Outlook API calls reduced by 90%
   - Meeting narratives appearing in briefings

3. **Rollback plan:**
   - Each change is isolated
   - Can comment out specific fixes if issues arise
   - Git commits for each fix separately

---

## Phase 2: Quality Improvements (Week 2)
**Goal:** Improve task creation quality
**Time:** 6 hours
**Impact:** Further reduce false positives to <20%

### 2.1 Implement Due Date Parsing (2 hours)

**Problem:** Due dates mentioned but not extracted
**Examples:** "by tomorrow", "October 30 delivery", "December 4th at 1pm"

**Implementation Steps:**

1. **Create new file:** `backend/utils/date-parser.js`

```javascript
const chrono = require('chrono-node'); // npm install chrono-node

/**
 * Parse due dates from text using multiple strategies
 */
function parseDueDate(text, baseDate = new Date()) {
  if (!text) return null;

  // Strategy 1: Use chrono-node for natural language parsing
  const parsed = chrono.parseDate(text, baseDate);
  if (parsed) {
    return parsed.toISOString().split('T')[0]; // Return date only
  }

  // Strategy 2: Look for specific patterns
  const patterns = [
    {
      regex: /by\s+(\w+\s+\d{1,2}(?:st|nd|rd|th)?(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?)/i,
      handler: (match) => chrono.parseDate(match[1], baseDate)
    },
    {
      regex: /(?:due|deliver|deadline|submit)\s+(?:by\s+)?(\w+\s+\d{1,2})/i,
      handler: (match) => chrono.parseDate(match[1], baseDate)
    },
    {
      regex: /(?:tomorrow|today|tonight|this\s+\w+|next\s+\w+)/i,
      handler: (match) => chrono.parseDate(match[0], baseDate)
    }
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (match) {
      const date = pattern.handler(match);
      if (date) {
        return date.toISOString().split('T')[0];
      }
    }
  }

  return null;
}

/**
 * Extract urgency based on due date
 */
function getUrgencyFromDueDate(dueDate) {
  if (!dueDate) return 'Eventually';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);

  const daysUntilDue = Math.floor((due - today) / (1000 * 60 * 60 * 24));

  if (daysUntilDue < 0) return 'Now'; // Overdue
  if (daysUntilDue <= 1) return 'Now'; // Today or tomorrow
  if (daysUntilDue <= 7) return 'Soon'; // This week
  return 'Eventually'; // More than a week
}

module.exports = {
  parseDueDate,
  getUrgencyFromDueDate
};
```

2. **Install dependency:**
```bash
npm install chrono-node
```

3. **Update `backend/services/data-processor.js`** (in createTask function, around line 400):

```javascript
const { parseDueDate, getUrgencyFromDueDate } = require('../utils/date-parser');

async function createTask(taskData, source = 'auto') {
  // Parse due date from title or description
  const textToParse = `${taskData.title || ''} ${taskData.description || ''}`;
  const dueDate = parseDueDate(textToParse);

  // Adjust urgency if we found a due date
  let urgency = taskData.urgency || 'Eventually';
  if (dueDate) {
    const dateBasedUrgency = getUrgencyFromDueDate(dueDate);
    // Use the more urgent of the two
    if (dateBasedUrgency === 'Now' || (dateBasedUrgency === 'Soon' && urgency === 'Eventually')) {
      urgency = dateBasedUrgency;
    }
  }

  const task = {
    ...taskData,
    due_date: dueDate || taskData.due_date,
    urgency: urgency,
    // Add to detection reasoning
    detection_reasoning: taskData.detection_reasoning +
      (dueDate ? `\nDue date detected: ${dueDate}` : '')
  };

  // Continue with existing creation logic...
}
```

4. **Update AI prompts** in `backend/ai/email-analyzer.js` and `backend/ai/meeting-analyzer.js`:

Add to the task extraction prompt:
```javascript
`If you identify any deadlines or due dates in the text, include them in the description using natural language like "by October 30" or "due next Tuesday".`
```

### 2.2 Enhance Claude Code Filtering (1 hour)

**Problem:** Summary files creating conversational tasks
**Impact:** 11% of false positives

**Implementation Steps:**

1. **File:** `backend/watchers/vault-watcher.js`
2. **Expand skip patterns** (around line 100):

```javascript
// Expanded Claude Code skip patterns
const claudeCodeSkipPatterns = [
  // Existing patterns...
  'project-overview',
  'implementation-plan',
  'technical-spec',

  // NEW patterns to add:
  'summary',
  'test_complete',
  'test-complete',
  'status',
  'status-update',
  'status_update',
  'next-steps',
  'next_steps',
  'recommendations',
  'options',
  'analysis',
  'research',
  'findings',
  'conclusion',
  'results',
  'output',
  'response',
  'feedback',
  'review',
  'assessment',
  'evaluation',
  'brainstorm',
  'ideas',
  'thoughts',
  'notes'
];
```

3. **Add content-based filtering** (after line 120):

```javascript
// Check for conversational prompts in content
function containsConversationalPrompt(content) {
  const conversationalPatterns = [
    /what(?:'s| is) (?:the )?next/i,
    /what (?:would you|do you want|should we)/i,
    /(?:would you like|do you want) (?:me )?to/i,
    /(?:let me know|tell me) (?:if|when|what)/i,
    /(?:any|do you have) (?:other |more )?(?:questions|thoughts|ideas)/i,
    /(?:is there|are there) (?:any|anything)/i,
    /what (?:else|other)/i,
    /how (?:would you|should we)/i,
    /shall (?:I|we)/i,
    /(?:ready|prepared) (?:to|for)/i,
    /would you prefer/i,
    /(?:feel free to|don't hesitate)/i,
    /(?:need|want) (?:me|us) to/i
  ];

  // Check each line for patterns
  const lines = content.split('\n');
  for (const line of lines) {
    // Skip if line is too long (probably not a question)
    if (line.length > 200) continue;

    for (const pattern of conversationalPatterns) {
      if (pattern.test(line)) {
        console.log(`   🤖 Detected conversational prompt: "${line.substring(0, 100)}..."`);
        return true;
      }
    }
  }

  return false;
}

// Add to handleNewFile() before AI analysis:
if (containsConversationalPrompt(content)) {
  console.log(`   ⏭️  Skipping: Contains conversational prompts`);
  return;
}
```

### 2.3 Fix Delegation Detection (1 hour)

**Problem:** "Shannon will..." tasks assigned to Tom
**Impact:** 6% incorrect task assignment

**Implementation Steps:**

1. **File:** `backend/ai/email-analyzer.js`
2. **Update the prompt** (around line 50):

```javascript
const enhancedPrompt = `
${existingPrompt}

DELEGATION DETECTION RULES:
- If a task explicitly mentions someone else will do it (e.g., "Shannon will...", "Peter to..."), either:
  1. Don't create a task at all (if Tom doesn't need to track it)
  2. Create it with task_type: "delegated" and assigned_to: "PersonName"

- Look for patterns like:
  - "[Name] will/to/should..." → assigned_to: Name
  - "assigned to [Name]" → assigned_to: Name
  - "[Name] is handling..." → assigned_to: Name
  - "I'll ask [Name] to..." → Create as Tom's task to delegate

- Common names in the system: Shannon, Peter, Sam, Kelly
- If uncertain, create as Tom's task with note in description
`;
```

3. **Add post-processing validation** (after AI response, around line 150):

```javascript
function validateDelegation(task, originalText) {
  // Patterns indicating delegation
  const delegationPatterns = [
    { pattern: /(\w+)\s+(?:will|to|should)\s+(\w+)/i, nameIndex: 1 },
    { pattern: /assigned\s+to\s+(\w+)/i, nameIndex: 1 },
    { pattern: /(\w+)\s+is\s+(?:handling|responsible|taking)/i, nameIndex: 1 },
    { pattern: /ask\s+(\w+)\s+to/i, nameIndex: 1, isTomTask: true }
  ];

  const knownPeople = ['shannon', 'peter', 'sam', 'kelly', 'tom'];

  for (const { pattern, nameIndex, isTomTask } of delegationPatterns) {
    const match = originalText.match(pattern);
    if (match) {
      const name = match[nameIndex].toLowerCase();

      if (knownPeople.includes(name) && name !== 'tom') {
        if (isTomTask) {
          // Tom needs to delegate this
          task.title = `Delegate to ${name}: ${task.title}`;
          task.task_type = 'task';
          task.assigned_to = 'Tom';
        } else {
          // Someone else is doing this
          task.task_type = 'delegated';
          task.assigned_to = name.charAt(0).toUpperCase() + name.slice(1);
          console.log(`   👥 Detected delegation to ${task.assigned_to}`);
        }
        return task;
      }
    }
  }

  return task;
}

// Apply validation after AI extraction
const validatedTasks = tasks.map(task => validateDelegation(task, emailContent));
```

### 2.4 Testing Phase 2

1. **Due date parsing tests:**
   - Create tasks with: "Complete by October 30", "Due tomorrow", "Submit next Tuesday"
   - Verify due_date field populated correctly
   - Check urgency auto-adjustment

2. **Claude Code filtering tests:**
   - Create a file with "What's the next test you want to run?"
   - Verify it's skipped
   - Create legitimate task file, verify it's processed

3. **Delegation tests:**
   - Process email with "Shannon will coordinate the meeting"
   - Verify task is marked as delegated or skipped
   - Process "Ask Peter to review" - verify it stays as Tom's task

---

## Phase 3: Technical Debt Reduction (Week 3-4)
**Goal:** Systematize ad-hoc fixes
**Time:** 9 hours

### 3.1 Centralize Duplicate Detection (2 hours)

1. **Create:** `backend/services/duplicate-detector.js`
2. **Move all duplicate detection logic to single module**
3. **Add comprehensive unit tests**
4. **Update all callers to use centralized version**

### 3.2 Create Date Parsing Utility (3 hours)

1. **Expand:** `backend/utils/date-parser.js`
2. **Add timezone handling**
3. **Add relative date parsing**
4. **Create test suite with edge cases**

### 3.3 Standardize Field Population (2 hours)

1. **Create:** `backend/utils/task-normalizer.js`
2. **Ensure consistent field population across sources**
3. **Add validation for required fields**
4. **Log warnings for missing expected fields**

### 3.4 Add Schema Validation (2 hours)

1. **Install:** `npm install ajv`
2. **Create:** `backend/schemas/` directory
3. **Define JSON schemas for tasks, events, narratives**
4. **Add validation before database insertion**

---

## Phase 4: Architectural Unification (Month 2)
**Goal:** Align all email sources to consistent architecture
**Time:** 10 hours

### 4.1 Refactor Outlook Scanner (4 hours)

1. **Align with Gmail scanner pattern**
2. **Add Obsidian note creation (optional)**
3. **Implement narrative logging**
4. **Full processed_emails integration**

### 4.2 Unified Email Pipeline (3 hours)

1. **Create:** `backend/services/email-processor.js`
2. **Abstract common email processing logic**
3. **Support multiple email sources**
4. **Consistent error handling**

### 4.3 Documentation Update (3 hours)

1. **Update all .md documentation files**
2. **Create architecture diagrams**
3. **Document new utilities and patterns**
4. **Create troubleshooting guide**

---

## Phase 5: Observability & Polish (Month 3)
**Goal:** Monitor, optimize, and perfect
**Time:** 11 hours

### 5.1 Monitoring Dashboard (4 hours)

1. **Create:** `backend/api/analytics.js`
2. **Track metrics:**
   - Emails processed/skipped by source
   - Tasks created by source
   - Duplicates blocked
   - API costs
   - False positive rate
3. **Create frontend dashboard page**

### 5.2 Performance Optimization (3 hours)

1. **Add caching layer for frequent AI calls**
2. **Batch database operations**
3. **Optimize duplicate detection algorithm**
4. **Add database indexes**

### 5.3 Error Alerting (2 hours)

1. **Structured error logging**
2. **Critical error notifications**
3. **Retry logic for transient failures**
4. **Health check endpoint**

### 5.4 User Feedback Loop (2 hours)

1. **Add feedback mechanism in UI**
2. **Track false positive reports**
3. **Auto-tune thresholds based on feedback**
4. **Weekly metrics email**

---

## Risk Mitigation

### Rollback Strategy

Each phase is independently revertible:

1. **Git branch per phase:** `refactor-phase-1`, `refactor-phase-2`, etc.
2. **Feature flags:** Can disable specific fixes via environment variables
3. **Database migrations:** Forward-only, non-destructive
4. **Incremental deployment:** Test in development first

### Testing Protocol

1. **Unit tests:** For all new utility functions
2. **Integration tests:** For end-to-end workflows
3. **3-day production monitoring** after each phase
4. **Rollback criteria:** >10% increase in false negatives

### Success Metrics

**Phase 1 Success:** (Week 1)
- False positive rate: 50% → 30% ✓
- Outlook API calls: -90% ✓
- Meeting narratives: Appearing in briefings ✓

**Phase 2 Success:** (Week 2)
- False positive rate: 30% → <20% ✓
- Due dates: 80% correctly parsed ✓
- Delegation: 90% correctly identified ✓

**Phase 3 Success:** (Week 3-4)
- Code duplication: Eliminated ✓
- Test coverage: >80% ✓
- Standardized patterns: Documented ✓

**Phase 4 Success:** (Month 2)
- Architecture: Unified email processing ✓
- Documentation: Complete and current ✓
- Maintenance time: -50% ✓

**Phase 5 Success:** (Month 3)
- Observability: Full metrics dashboard ✓
- Performance: <2s task creation ✓
- User satisfaction: >90% ✓

---

## Implementation Schedule

### Week 1 (Immediate)
- [ ] Day 1: Implement Phase 1.1 (Recency filter)
- [ ] Day 2: Implement Phase 1.2 (Narrative logging)
- [ ] Day 3: Implement Phase 1.3 (Outlook dedup)
- [ ] Day 4-5: Monitor and adjust

### Week 2
- [ ] Day 1-2: Implement Phase 2.1 (Due date parsing)
- [ ] Day 3: Implement Phase 2.2 (Claude filtering)
- [ ] Day 4: Implement Phase 2.3 (Delegation)
- [ ] Day 5: Testing and refinement

### Week 3-4
- [ ] Implement Phase 3 items
- [ ] Create test suites
- [ ] Documentation updates

### Month 2
- [ ] Architectural refactoring
- [ ] Unified pipelines
- [ ] Comprehensive testing

### Month 3
- [ ] Observability implementation
- [ ] Performance tuning
- [ ] Final polish

---

## Appendix A: File Modification Checklist

### Phase 1 Files to Modify:
- [ ] `backend/watchers/vault-watcher.js` - Add recency filter, narrative logging
- [ ] `backend/jobs/gmail-scanner.js` - Export updateProjectNarrative
- [ ] `backend/services/data-processor.js` - Add Outlook deduplication

### Phase 2 Files to Create/Modify:
- [ ] `backend/utils/date-parser.js` - NEW: Date parsing utility
- [ ] `backend/watchers/vault-watcher.js` - Enhanced Claude filtering
- [ ] `backend/ai/email-analyzer.js` - Delegation detection
- [ ] `backend/services/data-processor.js` - Due date integration

### Phase 3 Files to Create:
- [ ] `backend/services/duplicate-detector.js` - NEW: Centralized dedup
- [ ] `backend/utils/task-normalizer.js` - NEW: Field standardization
- [ ] `backend/schemas/` - NEW: JSON schemas

---

## Appendix B: Testing Commands

```bash
# Phase 1 Testing
npm run test:recency
npm run test:narratives
npm run test:outlook-dedup

# Phase 2 Testing
npm run test:due-dates
npm run test:claude-filter
npm run test:delegation

# Full Test Suite
npm test

# Production Monitoring
npm run monitor:false-positives
npm run monitor:api-usage
npm run monitor:narratives
```

---

## Appendix C: Environment Variables to Add

```bash
# Feature Flags (add to .env)
ENABLE_RECENCY_FILTER=true
ENABLE_NARRATIVE_LOGGING=true
ENABLE_OUTLOOK_DEDUP=true
ENABLE_DUE_DATE_PARSING=false  # Enable after testing
ENABLE_ENHANCED_FILTERING=false # Enable after testing
ENABLE_DELEGATION_DETECTION=false # Enable after testing

# Monitoring
TRACK_FALSE_POSITIVES=true
ALERT_EMAIL=tom@example.com
METRICS_RETENTION_DAYS=30

# Thresholds
MAX_FILE_AGE_HOURS=24
DUPLICATE_SIMILARITY_THRESHOLD=0.90
MIN_CONFIDENCE_SCORE=0.75
```

---

## Document Version History

- v1.0 (Oct 28, 2025): Initial comprehensive implementation plan
- Ready for Phase 1 implementation

---

**END OF IMPLEMENTATION PLAN**

Ready to begin Phase 1 when approved.