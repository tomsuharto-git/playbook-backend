/**
 * Gmail to Obsidian - Email Summary Scanner with Project Detection
 * Creates concise email summaries 3x daily (6am, 12pm, 6pm)
 * Uses Gmail API (not MCP)
 */

const fs = require('fs').promises;
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../db/supabase-client');
const gmailClient = require('../services/gmail-client');
const cron = require('node-cron');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VAULT_PATH = process.env.VAULT_PATH || path.join(process.env.HOME, 'Documents/Obsidian Vault');
const EMAIL_NOTES_PATH = path.join(VAULT_PATH, 'Notion/LIFE/Email Notes');

const IMPORTANT_DOMAINS = [
  '@montclair.k12.nj.us',
  '@school.k12.nj.us',
  '@72andsunny.com',
  '@forsmanbodenfors.com',
];

/**
 * Filter out emails that have already been processed
 * @param {Array} emails - Array of Gmail email objects
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
    console.error('   ⚠️  WARNING: Processing all emails as fail-safe (DB query failed)');
    return emails; // Fail-safe: process all if query fails
  }

  // Create a Set of processed email IDs for fast lookup
  const processedIds = new Set(processedEmails.map(e => e.email_id));

  // Filter to only emails NOT in the processed set
  const newEmails = emails.filter(email => !processedIds.has(email.id));

  return newEmails;
}

/**
 * Mark email as processed in the database
 * @param {Object} email - Gmail email object
 * @param {Object} analysis - AI analysis result
 */
async function markEmailAsProcessed(email, analysis) {
  const record = {
    email_id: email.id,
    source: 'gmail',
    subject: email.subject,
    from_email: email.from,
    received_date: email.date || new Date().toISOString(),
    tasks_created: analysis.tasks?.length || 0,
    narrative_updated: !!analysis.narrative,
    processed_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('processed_emails')
    .insert(record)
    .select();

  if (error) {
    console.error('   ⚠️  Error marking email as processed:', error.message);
    // Don't throw - this is logging only, shouldn't block task creation
  }
}

async function scanGmailAndSummarize() {
  console.log('📧 Gmail scan starting...');
  
  try {
    // Ensure directory exists
    await fs.mkdir(EMAIL_NOTES_PATH, { recursive: true });
    
    // Build search query for last 6 hours
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const timestamp = Math.floor(sixHoursAgo.getTime() / 1000);
    
    const domainQuery = IMPORTANT_DOMAINS.map(d => `from:${d}`).join(' OR ');
    const query = `after:${timestamp} -category:promotions (is:important (${domainQuery}) OR subject:(urgent OR "action required" OR meeting OR deadline OR rsvp))`;
    
    console.log(`   Query: ${query}`);
    
    // Search Gmail via API
    const emails = await gmailClient.search(query, 50);
    console.log(`   Found: ${emails.length} emails`);

    if (emails.length === 0) {
      console.log('✅ No emails found in this scan window');
      return 0;
    }

    // Filter out already-processed emails
    const newEmails = await filterNewEmails(emails);
    console.log(`\n   📊 Email Filtering:`);
    console.log(`      New emails: ${newEmails.length}`);
    console.log(`      Already processed: ${emails.length - newEmails.length}`);
    console.log(`      API calls saved: ${emails.length - newEmails.length}`);

    if (newEmails.length === 0) {
      console.log('✅ No new emails to process (all already processed)');
      return 0;
    }

    // Process ONLY NEW emails
    const notesCreated = await processGmailResults(newEmails);
    
    return notesCreated;
    
  } catch (error) {
    console.error('❌ Gmail scan error:', error.message);
    return 0;
  }
}

async function processGmailResults(emails) {
  console.log(`📧 Processing ${emails.length} emails...`);
  
  let notesCreated = 0;
  
  for (const email of emails) {
    try {
      // Analyze with AI
      const analysis = await analyzeEmail(email);

      // Create note
      const notePath = await createEmailNote(email, analysis);

      if (notePath) {
        // Update project narrative
        if (analysis.project) {
          await updateProjectNarrative(analysis.project, analysis.narrative);
        }

        // Mark email as processed in database
        await markEmailAsProcessed(email, analysis);

        notesCreated++;
        console.log(`   ✓ ${path.basename(notePath)} → ${analysis.project?.name || 'No project'}`);
      }
      
    } catch (error) {
      console.error(`   ❌ Error processing ${email.subject}:`, error.message);
    }
  }
  
  console.log(`✅ Created ${notesCreated} email summaries`);
  return notesCreated;
}

async function analyzeEmail(email) {
  const prompt = `Analyze this email and extract:

1. **Project/Context**: What ongoing context does this belong to?
   Available projects: School, 72andSunny, Baileys, Nuveen, Therabody, etc.

2. **Narrative**: Structure as headline(s) + bullets
   - Use multiple headlines if email covers multiple significant topics
   - Format: "**Headline:** Brief description" then bullet points
   - Keep bullets concise (one line each)

3. **Action Items**: Extract tasks with 2-10 word titles
   - Good: "Vote in school budget election"
   - Bad: "Vote" (too vague)
   - Include due dates if mentioned

   EXCLUDE these (not real tasks):
   - ❌ "Join [meeting name]" - calendar invite exists
   - ❌ "Attend [call/meeting]" - just showing up
   - ❌ "Participate in [discussion]" - no deliverable
   - ❌ "Submit timesheet" / "Log hours" - routine admin tracked elsewhere
   - ❌ Maconomy/timesheet reminders - already have recurring reminders
   - ❌ "Complete security/compliance training" - LMS reminders handled elsewhere
   - ❌ Overdue training assignments - already aware
   - ❌ "Download [file] from WeTransfer" / WeTransfer notifications - just file transfer links
   - ❌ WeTransfer expiration notices - not actionable tasks

   INCLUDE real work tasks:
   - ✅ Prep work: "Review deck before call"
   - ✅ Follow-ups: "Send notes from meeting"
   - ✅ Deliverables: "Finish proposal by Friday"

   URGENCY (use EXACT values):
   - "Now" = Due today/overdue, blocking, immediate
   - "Soon" = Due this week, can be scheduled
   - "Eventually" = No deadline or due next week+

4. **Summary**: 2-3 sentence overview
5. **Priority**: low, medium, or high

Email:
From: ${email.from}
Subject: ${email.subject}
Date: ${email.date}
Body: ${email.body?.substring(0, 2000) || email.snippet}

Return JSON:
{
  "project": {
    "name": "School",
    "type": "Life"
  },
  "narrative": {
    "items": [
      {
        "headline": "School picture day scheduled",
        "bullets": [
          "Friday, October 17, 2025",
          "Pre-order online at myliftouch.com",
          "Picture Day ID: EVTS3BPP7"
        ]
      }
    ]
  },
  "tasks": [
    {
      "title": "Order school pictures or send payment",
      "due_date": "2025-10-17",
      "urgency": "Soon"
    }
  ],
  "summary": "School picture day on Oct 17. Can pre-order online or send payment to school.",
  "priority": "medium"
}`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }]
  });

  const jsonText = response.content[0].text
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  return JSON.parse(jsonText);
}

async function createEmailNote(email, analysis) {
  const date = new Date(email.date || Date.now());
  const dateStr = date.toISOString().split('T')[0];
  
  // Clean subject for filename
  const cleanSubject = (email.subject || 'No-Subject')
    .replace(/^(Re:|Fwd?:)\s*/gi, '')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
  
  const filename = `${dateStr}-${cleanSubject}.md`;
  const notePath = path.join(EMAIL_NOTES_PATH, filename);
  
  // Check if file already exists
  try {
    await fs.access(notePath);
    return null; // Already exists
  } catch {}
  
  // Format narrative
  const narrativeFormatted = analysis.narrative?.items?.map(item => 
    `**${item.headline}**\n${item.bullets.map(b => `- ${b}`).join('\n')}`
  ).join('\n\n') || analysis.narrative;
  
  // Build markdown
  const markdown = `# ${email.subject || 'No Subject'}

**From:** ${email.from}
**Date:** ${date.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}
**To:** ${email.to || 'me'}
**Project:** ${analysis.project?.name || 'None'}

## AI Summary
${analysis.summary}

## Project Context
${narrativeFormatted}

${analysis.tasks?.length > 0 ? `## Action Items
${analysis.tasks.map(t => `- [ ] ${t.title}${t.due_date ? ` (Due: ${t.due_date})` : ''}`).join('\n')}` : ''}

## Email Content
${email.body?.substring(0, 5000) || email.snippet || 'No content'}

---
*Email ID: ${email.id}*
*Priority: ${analysis.priority?.toUpperCase() || 'MEDIUM'}*
${email.hasAttachments ? '*Has Attachments*\n' : ''}`;
  
  // Write file
  await fs.writeFile(notePath, markdown, 'utf8');
  
  // Store in database for tracking
  await supabase
    .from('meeting_notes')
    .insert({
      file_path: notePath,
      title: email.subject || 'No Subject',
      date: dateStr,
      content: analysis.summary,
      analyzed: false
    });
  
  return notePath;
}

/**
 * Update project narrative log
 * @param {string|object} projectOrId - Project ID (string) or project object with name/type
 * @param {object} narrative - Narrative data (format: { headline, bullets } or { items: [{headline, bullets}] })
 * @param {string} date - Date string (YYYY-MM-DD format)
 * @param {string} source - Source of narrative ('email' or 'meeting')
 */
async function updateProjectNarrative(projectOrId, narrative, date = null, source = 'email') {
  let projectId;

  // If projectOrId is a string, it's already a project ID
  if (typeof projectOrId === 'string') {
    projectId = projectOrId;
  } else {
    // It's a project object, find or create it
    const project = projectOrId;
    const { data: existingProject } = await supabase
      .from('projects')
      .select('*')
      .ilike('name', `%${project.name}%`)
      .single();

    if (existingProject) {
      projectId = existingProject.id;
    } else {
      const { data: newProject } = await supabase
        .from('projects')
        .insert({
          name: project.name,
          tags: [project.type.toLowerCase()],
          status: 'active'
        })
        .select()
        .single();

      projectId = newProject?.id;
      console.log(`   ✓ Created project: ${project.name}`);
    }
  }

  if (!projectId) return;

  // Get current narrative log
  const { data: currentProject } = await supabase
    .from('projects')
    .select('narrative')
    .eq('id', projectId)
    .single();

  const narrativeLog = currentProject?.narrative || [];

  const narrativeDate = date || new Date().toISOString().split('T')[0];

  // Handle both formats: { items: [...] } (email) or { headline, bullets } (meeting)
  if (narrative?.items) {
    // Email format
    narrative.items.forEach(item => {
      narrativeLog.push({
        date: narrativeDate,
        headline: item.headline,
        bullets: item.bullets,
        source: source,
        created_at: new Date().toISOString()
      });
    });
  } else if (narrative?.headline) {
    // Meeting format
    narrativeLog.push({
      date: narrativeDate,
      headline: narrative.headline,
      bullets: narrative.bullets || [],
      source: source,
      created_at: new Date().toISOString()
    });
  }

  // Sort narratives to prioritize meeting notes over emails
  // Priority: meeting > note > email
  // Within each priority: most recent first
  const sourcePriority = {
    'meeting': 3,
    'note': 2,
    'email': 1
  };

  narrativeLog.sort((a, b) => {
    // First sort by source priority
    const priorityA = sourcePriority[a.source] || 0;
    const priorityB = sourcePriority[b.source] || 0;

    if (priorityA !== priorityB) {
      return priorityB - priorityA; // Higher priority first
    }

    // Within same priority, sort by date (most recent first)
    const dateA = new Date(a.created_at || a.date);
    const dateB = new Date(b.created_at || b.date);
    return dateB - dateA;
  });

  // Keep last 150 entries (increased from 50 to retain more meeting notes)
  const trimmedNarrative = narrativeLog.slice(0, 150);

  // Update project with narrative log
  await supabase
    .from('projects')
    .update({
      narrative: trimmedNarrative,
      last_activity: new Date().toISOString()
    })
    .eq('id', projectId);

  const itemCount = narrative?.items?.length || (narrative?.headline ? 1 : 0);
  console.log(`   ✓ Updated narrative log: ${itemCount} new entries (source: ${source})`);
}

async function checkNoteExists(emailId) {
  const { data } = await supabase
    .from('meeting_notes')
    .select('id')
    .ilike('file_path', `%${emailId}%`)
    .maybeSingle();
  
  return !!data;
}

// ⏰ Schedule: 3x daily (6am, 12pm, 6pm ET)
function startGmailScanSchedule(io) {
  console.log('⏰ Gmail scan schedule started (6am, 12pm, 6pm ET)');

  // 6:00 AM ET
  cron.schedule('0 6 * * *', async () => {
    console.log('\n⏰ [6am ET] Gmail scan triggered');
    const count = await scanGmailAndSummarize();
    if (io && count > 0) {
      io.emit('gmail-scan-complete', { count, time: '6am' });
    }
  }, {
    timezone: 'America/New_York'
  });

  // 12:00 PM ET
  cron.schedule('0 12 * * *', async () => {
    console.log('\n⏰ [12pm ET] Gmail scan triggered');
    const count = await scanGmailAndSummarize();
    if (io && count > 0) {
      io.emit('gmail-scan-complete', { count, time: '12pm' });
    }
  }, {
    timezone: 'America/New_York'
  });

  // 6:00 PM ET
  cron.schedule('0 18 * * *', async () => {
    console.log('\n⏰ [6pm ET] Gmail scan triggered');
    const count = await scanGmailAndSummarize();
    if (io && count > 0) {
      io.emit('gmail-scan-complete', { count, time: '6pm' });
    }
  }, {
    timezone: 'America/New_York'
  });
}

module.exports = {
  scanGmailAndSummarize,
  processGmailResults,
  startGmailScanSchedule,
  updateProjectNarrative
};
