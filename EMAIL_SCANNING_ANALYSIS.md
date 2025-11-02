# Email Scanning Analysis & Optimization Plan

**Date:** 2025-10-13
**Issue:** Emails are scanned multiple times, leading to duplicate tasks and excessive API costs

---

## Current Email Workflow

### How It Works:
1. **Power Automate** exports emails to Google Drive as JSON files every 6 hours (6am, 12pm, 6pm ET)
   - File format: `emails-2025-10-13-1530.json`
   - Contains ~50 most recent emails from Outlook inbox

2. **Backend polls Google Drive** 3x daily at 6:10am, 12:10pm, 6:10pm ET (10 min after export)
   - Downloads the MOST RECENT email file
   - Location: `jobs/poll-gdrive.js` line 64-71

3. **Email Processor** analyzes ALL 50 emails in the file
   - Location: `services/data-processor.js` line 171-280
   - Sends all 50 emails to Claude AI for analysis
   - Creates tasks for any action items found
   - No tracking of which emails have been processed before

4. **Duplicate Detection** tries to prevent duplicate tasks
   - Word-matching similarity check (95%+ blocks)
   - AI semantic check for 75-95% similarity
   - BUT: Same email processed multiple times still hits AI multiple times

---

## The Problem

### 1. **Over-Scanning**
Every scan processes ALL 50 emails, even if they were already processed in previous scans.

**Example Timeline:**
- **6:00 AM**: Power Automate exports 50 emails (Oct 10-13)
- **6:10 AM**: Backend scans all 50 emails → Creates tasks
- **12:00 PM**: Power Automate exports 50 emails (Oct 10-13, same emails + maybe 2 new ones)
- **12:10 PM**: Backend scans all 50 emails AGAIN → Duplicate detection blocks most, but still costs API calls
- **6:00 PM**: Power Automate exports 50 emails (Oct 10-13, same emails + maybe 5 new ones)
- **6:10 PM**: Backend scans all 50 emails AGAIN → More duplicate detection

**Result**: The same "Set up Hechostudios Okta account" email was analyzed 10+ times across multiple days!

### 2. **Excessive API Costs**
- Each scan sends 50 emails to Claude AI
- Cost per scan: ~$0.10-0.20
- 3 scans/day × 7 days/week = 21 scans/week
- **Total weekly cost: ~$2-4 just for re-scanning old emails**

### 3. **Duplicate Task Creation**
Even with duplicate detection:
- Emoji differences bypass fast path (now fixed)
- AI failsafe can fail silently
- Race conditions when same email appears twice in same scan
- More scans = more opportunities for bugs

---

## Original Gmail Workflow (Better Design)

The original Gmail workflow had email tracking:

1. **Gmail API** fetches new emails with unique message IDs
2. **Email notes created in Obsidian** for each email (in `Notion/Inbox/` folder)
3. **Database tracks** which emails have been processed
4. **Subsequent scans** only process NEW emails, not already-processed ones

**Advantages:**
- Each email scanned exactly once
- Audit trail in Obsidian
- No duplicate tasks from re-scanning
- Much lower API costs

---

## Recommended Solution

### Option A: Track Processed Emails (Best for Outlook)

**Create a `processed_emails` table:**
```sql
CREATE TABLE processed_emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_id TEXT UNIQUE NOT NULL,  -- Outlook message ID
  subject TEXT,
  from_email TEXT,
  processed_at TIMESTAMP DEFAULT NOW(),
  tasks_created INTEGER DEFAULT 0,
  narrative_updated BOOLEAN DEFAULT false
);
```

**Update email processor:**
1. Before processing each email, check if `email_id` exists in `processed_emails`
2. If exists, skip (already processed)
3. If new, process and insert into `processed_emails`
4. Track how many tasks were created per email

**Benefits:**
- Reduces API calls by ~90% (only new emails scanned)
- Prevents duplicate tasks from re-scanning
- Provides audit trail of what was processed
- Can see which emails generated tasks

**Estimated Savings:**
- From ~150 emails/day (50 × 3 scans) → ~15 emails/day (only new ones)
- API cost reduction: ~90%
- Fewer duplicate detection checks = faster processing

---

### Option B: Email Notes in Obsidian (Original Design)

**Workflow:**
1. When email is processed, create markdown file: `Notion/Inbox/emails/[date]-[subject].md`
2. File contains:
   - Email metadata (from, subject, date)
   - Extracted tasks
   - AI analysis
3. Vault watcher monitors these files
4. Database tracks file path to prevent re-processing

**Benefits:**
- Visual audit trail in Obsidian
- Can manually review AI decisions
- Searchable email archive
- Aligns with original Gmail design

**Drawbacks:**
- More file system operations
- Obsidian vault gets larger
- Requires vault watcher to be robust

---

### Option C: Hybrid Approach (Recommended)

**Combine both solutions:**

1. **Database tracking** (`processed_emails` table) for fast lookups
2. **Optional email notes** in Obsidian for important emails only (e.g., emails that created tasks)
3. **Power Automate filtering**: Modify to only export emails from last 24 hours, not last 7 days

**Implementation Steps:**
1. Create `processed_emails` table
2. Update `services/data-processor.js` to check/insert email IDs
3. Optionally: Create email notes for emails that generate tasks
4. Update Power Automate to filter by `receivedDateTime >= @{addDays(utcNow(), -1)}`

---

## Comparison with Current System

| Metric | Current (No Tracking) | With Email Tracking |
|--------|----------------------|-------------------|
| Emails scanned/day | ~150 (50 × 3) | ~15 (only new) |
| API calls/day | ~150 | ~15 |
| Duplicate risk | High (same email multiple times) | Low (each email once) |
| API cost/month | ~$12-24 | ~$1.20-2.40 |
| Processing time | Slow (lots of duplicate checks) | Fast (skip processed) |

---

## Action Items

### Immediate (Stop the Bleeding):
- [x] Fix emoji bug (deployed)
- [ ] Create `processed_emails` table
- [ ] Update email processor to check/insert email IDs
- [ ] Deploy and monitor for duplicates

### Short-term (Optimize):
- [ ] Add logging to show "X emails skipped (already processed)"
- [ ] Create email notes in Obsidian for task-generating emails
- [ ] Add cleanup job to remove old `processed_emails` entries (>30 days)

### Long-term (Polish):
- [ ] Dashboard showing: emails processed, tasks created, duplicates blocked
- [ ] Update Power Automate to only export last 24 hours
- [ ] Consider moving to Gmail API for direct access (no intermediate files)

---

## Questions to Answer

1. **Do you want email notes in Obsidian?**
   - Pros: Visual audit trail, searchable archive
   - Cons: More files, larger vault

2. **How long should we track processed emails?**
   - 7 days (match current email file span)?
   - 30 days (safety buffer)?
   - Forever (complete audit trail)?

3. **Should we modify Power Automate to export fewer emails?**
   - Current: Last 7 days (~50 emails)
   - Proposed: Last 24 hours (~10-15 emails)

---

## Conclusion

**The root cause of duplicate tasks is over-scanning**: The same emails are analyzed multiple times across different scans because there's no tracking of which emails have been processed.

**The fix**: Add a `processed_emails` table to track which Outlook message IDs have been analyzed, and skip them in subsequent scans.

**Expected impact**: 90% reduction in API calls, near-zero duplicate tasks from re-scanning, faster processing.
