# Processed Emails Tracking - Implementation Plan

**Date:** 2025-10-13
**Goal:** Track which emails have been processed to avoid re-scanning and creating duplicate tasks

---

## Overview

Add a `processed_emails` table to track Outlook message IDs, and update the email processor to skip already-processed emails before sending them to AI.

---

## Step 1: Database Schema

### Create `processed_emails` Table

**File:** `db/migration_005_processed_emails.sql`

```sql
-- Track which emails have been processed to avoid re-scanning
CREATE TABLE IF NOT EXISTS processed_emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_id TEXT UNIQUE NOT NULL,  -- Outlook message ID (e.g., "AAMkAGY0M...")
  subject TEXT,
  from_email TEXT,
  received_date TIMESTAMP,
  processed_at TIMESTAMP DEFAULT NOW(),
  tasks_created INTEGER DEFAULT 0,
  narrative_updated BOOLEAN DEFAULT false,

  -- Indexes for fast lookups
  CONSTRAINT unique_email_id UNIQUE (email_id)
);

CREATE INDEX idx_processed_emails_email_id ON processed_emails(email_id);
CREATE INDEX idx_processed_emails_processed_at ON processed_emails(processed_at);

-- Optional: Add cleanup policy for old emails (>30 days)
COMMENT ON TABLE processed_emails IS 'Tracks which Outlook emails have been analyzed to prevent duplicate processing';
```

**Why these fields:**
- `email_id`: Outlook message ID (unique identifier from API)
- `subject` & `from_email`: For debugging/audit trail
- `received_date`: When email was received
- `processed_at`: When we analyzed it
- `tasks_created`: How many tasks were generated (useful for analytics)
- `narrative_updated`: Did it update a project narrative

---

## Step 2: Update Email Processor

### Current Flow (data-processor.js):
```
1. Download email file from Google Drive
2. Parse JSON → get 50 emails
3. Send ALL 50 emails to Claude AI
4. Process AI response → create tasks
5. Check for duplicates (per task)
```

### New Flow:
```
1. Download email file from Google Drive
2. Parse JSON → get 50 emails
3. **CHECK: Query processed_emails table**
   - Filter out emails that already exist
   - Keep only NEW emails
4. Send ONLY NEW emails to Claude AI
5. Process AI response → create tasks
6. **INSERT: Add processed email IDs to processed_emails**
7. Check for duplicates (per task)
```

### Code Changes in `services/data-processor.js`

**Location:** Line 171, `processEmailData()` function

**Before:**
```javascript
async function processEmailData(emails, date) {
  const emailList = Array.isArray(emails) ? emails : (emails.value || []);
  console.log(`\n📧 [EMAIL PROCESSOR] Starting for ${date}`);
  console.log(`   Total emails: ${emailList.length}`);

  // Get all active projects
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, tags')
    .eq('status', 'active');

  // Analyze emails with AI (ALL 50 EMAILS)
  const analysis = await analyzeEmails(emailList, projects);

  // Process results...
}
```

**After:**
```javascript
async function processEmailData(emails, date) {
  const emailList = Array.isArray(emails) ? emails : (emails.value || []);
  console.log(`\n📧 [EMAIL PROCESSOR] Starting for ${date}`);
  console.log(`   Total emails: ${emailList.length}`);

  // NEW: Filter out already-processed emails
  const newEmails = await filterNewEmails(emailList);
  console.log(`   New emails: ${newEmails.length}`);
  console.log(`   Skipped (already processed): ${emailList.length - newEmails.length}`);

  if (newEmails.length === 0) {
    console.log('   ✅ No new emails to process\n');
    return;
  }

  // Get all active projects
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, tags')
    .eq('status', 'active');

  // Analyze ONLY NEW emails with AI
  const analysis = await analyzeEmails(newEmails, projects);

  // Process results...

  // NEW: Mark emails as processed
  await markEmailsAsProcessed(analysis.emailAnalyses);
}
```

---

## Step 3: Helper Functions

### Function 1: `filterNewEmails()`

**Purpose:** Check which emails haven't been processed yet

```javascript
/**
 * Filter out emails that have already been processed
 * @param {Array} emails - Array of email objects from Outlook
 * @returns {Array} - Only emails that haven't been processed
 */
async function filterNewEmails(emails) {
  // Extract email IDs from the emails
  const emailIds = emails.map(email => email.id).filter(Boolean);

  if (emailIds.length === 0) return emails;

  // Query database for emails that have been processed
  const { data: processedEmails, error } = await supabase
    .from('processed_emails')
    .select('email_id')
    .in('email_id', emailIds);

  if (error) {
    console.error('   ⚠️  Error checking processed emails:', error.message);
    return emails; // Fail-safe: process all if query fails
  }

  // Create a Set of processed email IDs for fast lookup
  const processedIds = new Set(processedEmails.map(e => e.email_id));

  // Filter to only emails NOT in the processed set
  const newEmails = emails.filter(email => !processedIds.has(email.id));

  return newEmails;
}
```

**Where to add:** `services/data-processor.js` after `isDuplicateTask()` function

---

### Function 2: `markEmailsAsProcessed()`

**Purpose:** Insert processed email records after AI analysis

```javascript
/**
 * Mark emails as processed in the database
 * @param {Array} emailAnalyses - Array of email analysis results from AI
 */
async function markEmailsAsProcessed(emailAnalyses) {
  if (!emailAnalyses || emailAnalyses.length === 0) return;

  const records = emailAnalyses.map(analysis => ({
    email_id: analysis.emailId,
    subject: analysis.subject,
    from_email: analysis.from,
    received_date: analysis.receivedDateTime || new Date().toISOString(),
    tasks_created: analysis.tasks?.length || 0,
    narrative_updated: !!analysis.narrative,
    processed_at: new Date().toISOString()
  }));

  const { error } = await supabase
    .from('processed_emails')
    .insert(records)
    .select();

  if (error) {
    console.error('   ⚠️  Error marking emails as processed:', error.message);
    // Don't throw - this is logging only, shouldn't block task creation
  } else {
    console.log(`   ✅ Marked ${records.length} emails as processed`);
  }
}
```

**Where to add:** `services/data-processor.js` after `filterNewEmails()` function

---

## Step 4: Update Email Analysis Call

**Current location:** `services/data-processor.js` line 203-280

**Changes needed:**

1. **After processing all email analyses**, call `markEmailsAsProcessed()`:

```javascript
// Process each email analysis
for (const emailAnalysis of analysis.emailAnalyses) {
  // ... existing task creation code ...
}

// NEW: Mark all analyzed emails as processed
await markEmailsAsProcessed(analysis.emailAnalyses);

console.log(`\n✅ [EMAIL PROCESSOR] Complete`);
```

---

## Step 5: Logging & Monitoring

### Enhanced Logging

Add detailed logs to track filtering:

```javascript
console.log(`\n📧 [EMAIL PROCESSOR] Starting for ${date}`);
console.log(`   Total emails in file: ${emailList.length}`);

const newEmails = await filterNewEmails(emailList);

console.log(`   📊 Email Filtering:`);
console.log(`      New emails: ${newEmails.length}`);
console.log(`      Already processed: ${emailList.length - newEmails.length}`);
console.log(`      API calls saved: ${emailList.length - newEmails.length}`);
```

---

## Step 6: Optional Cleanup Job

**Purpose:** Remove old processed_emails records (>30 days) to keep table size manageable

**File:** `jobs/cleanup-processed-emails.js` (new file)

```javascript
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function cleanupOldProcessedEmails() {
  console.log('🧹 Cleaning up old processed emails...');

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data, error } = await supabase
    .from('processed_emails')
    .delete()
    .lt('processed_at', thirtyDaysAgo.toISOString())
    .select();

  if (error) {
    console.error('❌ Error cleaning up:', error.message);
  } else {
    console.log(`✅ Deleted ${data?.length || 0} old email records`);
  }
}

function startCleanupJob() {
  // Run daily at 3 AM ET
  cron.schedule('0 3 * * *', cleanupOldProcessedEmails, {
    timezone: 'America/New_York'
  });
  console.log('🧹 Processed emails cleanup scheduled (daily at 3 AM ET)');
}

module.exports = { startCleanupJob, cleanupOldProcessedEmails };
```

**Register in `server.js`:**
```javascript
const { startCleanupJob } = require('./jobs/cleanup-processed-emails');
startCleanupJob();
```

---

## Step 7: Testing Plan

### Test 1: First Scan (All New)
**Setup:** Empty `processed_emails` table
**Action:** Run email processor
**Expected:**
- All 50 emails sent to AI
- 50 records inserted into `processed_emails`
- Tasks created as normal

### Test 2: Second Scan (All Duplicate)
**Setup:** `processed_emails` has 50 records from Test 1
**Action:** Run email processor with same email file
**Expected:**
- 0 emails sent to AI (all filtered out)
- Log: "Skipped (already processed): 50"
- 0 new tasks created
- No new records in `processed_emails`

### Test 3: Mixed Scan (Some New, Some Old)
**Setup:** `processed_emails` has 48 records
**Action:** Run email processor with 50 emails (48 old + 2 new)
**Expected:**
- 2 emails sent to AI
- Log: "New emails: 2, Skipped: 48"
- Tasks created only for 2 new emails
- 2 new records inserted

### Test 4: Error Handling
**Setup:** Temporarily break database connection
**Action:** Run email processor
**Expected:**
- Error logged but processing continues
- Fail-safe: All emails processed (better duplicate than missing)

---

## Step 8: Rollback Plan

If issues arise, rollback is simple:

1. **Remove helper function calls:**
   - Comment out `filterNewEmails()` call
   - Comment out `markEmailsAsProcessed()` call

2. **System reverts to old behavior:**
   - All emails scanned
   - Duplicate detection still works
   - No data loss

3. **Keep table for future:**
   - Don't drop `processed_emails` table
   - Data is already there for next attempt

---

## Expected Impact

### Before Implementation:
- **Emails scanned per day:** ~150 (50 × 3 scans)
- **AI API calls per day:** ~150
- **Monthly API cost:** ~$20
- **Duplicate task risk:** High

### After Implementation:
- **Emails scanned per day:** ~15 (only new ones)
- **AI API calls per day:** ~15
- **Monthly API cost:** ~$2
- **Duplicate task risk:** Very low

### Savings:
- **90% reduction in API calls**
- **90% cost savings**
- **Faster processing** (skip 48/50 emails instantly)

---

## Files to Create/Modify

### New Files:
1. ✅ `db/migration_005_processed_emails.sql` - Database schema
2. ✅ `jobs/cleanup-processed-emails.js` - Optional cleanup job (can skip initially)

### Modified Files:
1. ✅ `services/data-processor.js` - Add filtering logic
   - Add `filterNewEmails()` function (after line 137)
   - Add `markEmailsAsProcessed()` function (after filterNewEmails)
   - Update `processEmailData()` function (line 171)

2. ✅ `server.js` - Register cleanup job (optional, line ~60)

---

## Implementation Order

1. **Create database migration** → Run SQL
2. **Add helper functions** → Test in isolation
3. **Update email processor** → Add filtering
4. **Deploy and test** → Monitor first scan
5. **Observe second scan** → Verify emails skipped
6. **(Optional) Add cleanup job** → If table grows large

---

## Questions for Approval

1. **Cleanup policy:** Keep processed emails for 30 days? Or longer/shorter?
2. **Logging level:** Current plan is verbose. Want more/less?
3. **Fail-safe behavior:** If database query fails, should we process all emails (safer) or skip all (cheaper)?
4. **Cleanup job:** Include now or add later if needed?

---

## Summary

This implementation:
- ✅ Stops re-scanning the same emails
- ✅ Reduces API costs by ~90%
- ✅ Prevents duplicate tasks from over-scanning
- ✅ Has clear rollback path if issues arise
- ✅ Includes fail-safes for database errors
- ✅ Provides audit trail of what was processed

**Ready to implement once approved!**
