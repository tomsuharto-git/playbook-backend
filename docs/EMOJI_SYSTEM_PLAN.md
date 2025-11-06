# Task Emoji System - Implementation Plan

**Goal:** Add contextual emojis to the end of AI-created pending task titles

**Example:** "Order iPhone for Pa" → "Order iPhone for Pa 📱"

---

## 1. SCOPE & REQUIREMENTS

### What Gets Emojis
✅ **AI-created pending tasks** from:
- Email analyzer (`ai/email-analyzer.js`)
- Meeting/note analyzer (`ai/meeting-analyzer.js`)

❌ **NO emojis for:**
- Existing active tasks (already created)
- Recurring tasks (created by scheduler)
- Manually created tasks
- Team objectives
- Delegated tasks

### Where Emoji is Added
**At task title generation time** - The AI adds the emoji when it creates the task title, not as a separate post-processing step.

---

## 2. ARCHITECTURE OPTIONS

### Option A: AI Adds Emoji During Task Title Generation (RECOMMENDED)
**How it works:**
1. Modify AI prompts in `email-analyzer.js` and `meeting-analyzer.js`
2. Instruct AI to append ONE contextual emoji to each task title
3. AI outputs: `"Order iPhone for Pa 📱"`
4. Task is inserted into database with emoji already in title

**Pros:**
- ✅ Single point of change (AI prompts)
- ✅ AI understands context better than regex
- ✅ Works immediately for all AI-detected tasks
- ✅ No post-processing needed
- ✅ Emoji is part of the title from creation

**Cons:**
- ⚠️ Slightly longer AI responses (negligible)
- ⚠️ Emoji becomes permanent part of title

### Option B: Post-Processing After Task Creation
**How it works:**
1. Task created with normal title: `"Order iPhone for Pa"`
2. Before database insertion, call emoji-selection function
3. Function analyzes title and appends emoji
4. Insert: `"Order iPhone for Pa 📱"`

**Pros:**
- ✅ Centralized emoji logic
- ✅ Easy to disable/modify later

**Cons:**
- ❌ Requires new function for emoji selection
- ❌ Harder to get context (only has title, no email content)
- ❌ More code to maintain
- ❌ Separate AI call or complex regex logic needed

### Option C: Hybrid (AI Suggests, We Validate)
**How it works:**
1. AI returns task with `emoji` field: `{ title: "Order iPhone", emoji: "📱" }`
2. Our code appends emoji to title before insertion
3. Fallback to generic emoji if AI doesn't provide one

**Pros:**
- ✅ Flexibility to override AI choices
- ✅ Can skip emoji if AI returns invalid one

**Cons:**
- ❌ More complex implementation
- ❌ Requires JSON schema changes
- ❌ Still needs fallback logic

---

## 3. RECOMMENDED APPROACH: Option A (AI Adds During Generation)

### Why This is Best
1. **Simplest implementation** - Just update AI prompts
2. **Best context** - AI has full email/note content to choose emoji
3. **Consistent with current flow** - AI already generates task titles
4. **No schema changes** - Emoji is just part of the title string
5. **Works everywhere** - Both email and vault analyzers use same pattern

---

## 4. IMPLEMENTATION DETAILS

### Files to Modify

#### File 1: `ai/email-analyzer.js`
**Lines to change:** ~35-40 (task extraction instructions)

**Current prompt:**
```javascript
3. ACTION ITEMS (Tasks)
   - ONLY extract if YOU (Tom) have clear responsibility
   - Title: 2-10 words, actionable
   - Due date: if mentioned
   - Priority: urgent/high/normal/low
   - Confidence: 0.0-1.0 (use ≥0.9 threshold)
```

**New prompt:**
```javascript
3. ACTION ITEMS (Tasks)
   - ONLY extract if YOU (Tom) have clear responsibility
   - Title: 2-10 words, actionable, ending with ONE relevant emoji
   - Emoji: Choose the single most contextually relevant emoji based on:
     * Action type (📧 email, 📞 call, ✍️ write, 📊 analyze)
     * Object/subject (📱 phone, 💻 computer, 📄 document, 🏢 meeting)
     * Priority/urgency (🔥 urgent, ⚡ important, 📅 scheduled)
   - Due date: if mentioned
   - Priority: urgent/high/normal/low
   - Confidence: 0.0-1.0 (use ≥0.9 threshold)
```

**Example output:**
```json
{
  "title": "Order iPhone for Pa 📱",
  "description": "...",
  "confidence": 0.95
}
```

#### File 2: `ai/meeting-analyzer.js`
**Lines to change:** ~36-38 (task classification section)

**Current prompt:**
```javascript
1. TASK (Tom's personal responsibility)
   - Tom explicitly commits: "I'll...", "I need to...", "I'm going to..."
   - Clear personal deliverable with deadline
   - Tom is the one who must do the work
   - Confidence MUST be ≥ 0.90 or DO NOT include
```

**New prompt:**
```javascript
1. TASK (Tom's personal responsibility)
   - Tom explicitly commits: "I'll...", "I need to...", "I'm going to..."
   - Clear personal deliverable with deadline
   - Tom is the one who must do the work
   - Title must end with ONE contextually relevant emoji
   - Emoji selection: Choose based on action type, subject, or priority
   - Confidence MUST be ≥ 0.90 or DO NOT include
```

---

## 5. EMOJI SELECTION GUIDELINES FOR AI

### Categories & Examples

**Communication:**
- 📧 Email-related tasks
- 📞 Phone calls
- 💬 Messages, chat
- 🗣️ Presentations, speaking

**Creative/Content:**
- ✍️ Writing, content creation
- 🎨 Design work
- 📸 Photography, media
- 🎥 Video tasks

**Technical/Work:**
- 💻 Coding, development
- 🔧 Fixes, maintenance
- 🐛 Bug fixes
- 📊 Analysis, data work
- 🔍 Research, investigation

**Planning/Organization:**
- 📅 Scheduling, calendar
- 📋 Planning tasks
- ✅ Checklist items
- 📝 Notes, documentation

**Purchases/Orders:**
- 🛒 Shopping, ordering
- 💳 Payments, financial
- 📦 Deliveries, shipping

**People/Relationships:**
- 👤 Person-specific tasks
- 👥 Team tasks
- 🤝 Partnerships, collaboration

**Objects/Subjects:**
- 📱 Phone-related
- 🏢 Building, office, meeting rooms
- 🏠 Home tasks
- 🚗 Transportation
- ✈️ Travel

**Priority Indicators:**
- 🔥 Urgent, critical
- ⚡ High priority
- ⭐ Important, featured
- 📌 Pinned, reminder

---

## 6. TESTING STRATEGY

### Test Cases

1. **Email with phone order**
   - Input: "Order iPhone for Pa from Apple"
   - Expected: "Order iPhone for Pa 📱" or "Order iPhone for Pa 🛒"

2. **Meeting scheduling**
   - Input: "Schedule client meeting for next week"
   - Expected: "Schedule client meeting 📅" or "Schedule client meeting 🏢"

3. **Technical task**
   - Input: "Fix deployment bug in production"
   - Expected: "Fix deployment bug 🐛" or "Fix deployment bug 🔧"

4. **Communication task**
   - Input: "Email team about project update"
   - Expected: "Email team about project update 📧"

5. **Creative task**
   - Input: "Write blog post about AI features"
   - Expected: "Write blog post about AI ✍️" or "Write blog post about AI 📝"

### Validation Steps

1. **Create test email** with various task types
2. **Run email analyzer** and check generated task titles
3. **Verify emoji presence** - exactly one emoji at the end
4. **Check emoji relevance** - does it make sense for the task?
5. **Test vault analyzer** with meeting notes
6. **Check database** - ensure emoji stores correctly in `title` column

---

## 7. ROLLBACK PLAN

If emojis cause issues:

### Quick Disable (no code change)
Add to AI prompt:
```
IMPORTANT: DO NOT add emojis to task titles
```

### Remove Emojis from Existing Tasks (SQL)
```sql
UPDATE tasks
SET title = regexp_replace(title, '[\x{1F300}-\x{1F9FF}]', '', 'g')
WHERE auto_detected = true
AND created_at > '2025-10-12';
```

---

## 8. IMPLEMENTATION STEPS

### Phase 1: Email Analyzer (Primary)
1. ✅ Update `ai/email-analyzer.js` prompt (lines 35-40)
2. ✅ Add emoji selection guidelines
3. ✅ Test with sample email data
4. ✅ Verify database insertion works
5. ✅ Check frontend display

### Phase 2: Meeting Analyzer (Secondary)
1. ✅ Update `ai/meeting-analyzer.js` prompt (lines 36-38)
2. ✅ Add same emoji guidelines
3. ✅ Test with sample meeting notes
4. ✅ Verify consistency with email analyzer

### Phase 3: Validation & Monitoring
1. ✅ Monitor first 10-20 AI-created tasks
2. ✅ Check emoji appropriateness
3. ✅ Adjust prompt if needed
4. ✅ Document common patterns

---

## 9. EDGE CASES TO CONSIDER

### Multiple Emojis
**Problem:** AI might add multiple emojis
**Solution:** Prompt says "ONE emoji" - emphasize this

### No Emoji
**Problem:** AI forgets to add emoji
**Solution:** Acceptable - just means title is normal

### Wrong Emoji
**Problem:** AI chooses irrelevant emoji
**Solution:** Monitor and refine prompt with examples

### Emoji Breaks Frontend
**Problem:** Frontend can't display emoji
**Solution:** Test on actual frontend first

### Database Encoding
**Problem:** Emoji might not store correctly
**Solution:** PostgreSQL/Supabase supports UTF-8, should work fine

---

## 10. SUCCESS CRITERIA

✅ **Minimum viable:**
- 80%+ of AI-created tasks have emojis
- Emojis are contextually relevant
- No database/frontend issues

✅ **Ideal state:**
- 95%+ of AI-created tasks have emojis
- Users find emojis helpful/delightful
- Emoji selection feels intelligent

---

## 11. ALTERNATIVES CONSIDERED & REJECTED

### ❌ Separate emoji field in database
**Why rejected:** Over-engineering, emoji is just visual enhancement

### ❌ Emoji picker in frontend
**Why rejected:** Goal is AI-automatic, not manual selection

### ❌ Regex-based emoji selection
**Why rejected:** Can't understand context like AI can

### ❌ Third-party emoji API
**Why rejected:** Unnecessary external dependency

---

## RECOMMENDATION

✅ **Proceed with Option A: AI adds emoji during task title generation**

**Estimated implementation time:** 30 minutes
- 10 min: Update email-analyzer.js prompt
- 10 min: Update meeting-analyzer.js prompt
- 10 min: Test with sample data

**Risk level:** Low
- Non-breaking change
- Easy to disable if needed
- Emojis are visual-only enhancement

**User impact:** High delight, low risk
- Makes task list more scannable
- Adds personality to AI-generated tasks
- No functionality changes
