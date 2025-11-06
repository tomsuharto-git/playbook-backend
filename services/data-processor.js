const { supabase } = require('../db/supabase-client');
const { analyzeEmails } = require('../ai/email-analyzer');
const { isTaskDuplicate } = require('../ai/duplicate-detector');
const { normalizeOutlookEvent, filterEventsByDate } = require('./calendar-normalizer');

// Smart duplicate detection with normalization and synonym detection
function calculateSimilarity(str1, str2) {
  // Normalize compound words and common variations
  const normalize = (str) => str
    .toLowerCase()
    // Strip emojis (common emoji unicode ranges)
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
    .replace(/set up|setup/g, 'setup')
    .replace(/sign up|signup/g, 'signup')
    .replace(/log in|login/g, 'login')
    .replace(/set-up/g, 'setup')
    .replace(/sign-up/g, 'signup')
    .replace(/log-in/g, 'login')
    .trim();

  const norm1 = normalize(str1);
  const norm2 = normalize(str2);

  // Extract words (ignore very short words)
  const words1 = new Set(norm1.split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(norm2.split(/\s+/).filter(w => w.length > 2));

  if (words1.size === 0 || words2.size === 0) return 0;

  // Action word synonyms (treat as similar)
  const actionSynonyms = {
    'setup': ['complete', 'configure', 'create', 'initialize', 'finish'],
    'complete': ['setup', 'finish', 'configure', 'create'],
    'configure': ['setup', 'complete', 'create'],
    'create': ['setup', 'configure', 'make', 'build'],
    'finish': ['complete', 'setup'],
    'review': ['check', 'verify', 'examine'],
    'check': ['review', 'verify', 'examine'],
    'send': ['submit', 'deliver'],
    'submit': ['send', 'deliver'],
  };

  // Check for synonym matches
  let matchCount = 0;
  const allWords = new Set([...words1, ...words2]);

  for (const word1 of words1) {
    if (words2.has(word1)) {
      matchCount++; // Direct match
    } else if (actionSynonyms[word1]) {
      // Check if any synonym matches
      if ([...words2].some(w => actionSynonyms[word1].includes(w))) {
        matchCount += 0.8; // Partial credit for synonym match
      }
    }
  }

  return matchCount / allWords.size;
}

/**
 * Calculate Levenshtein distance for fuzzy string matching
 * Helps catch typos like "Lovesac" vs "Lovsac"
 */
function levenshteinDistance(str1, str2) {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Check if two words are similar with fuzzy matching
 * Handles typos and close variants
 */
function areSimilarWords(word1, word2) {
  if (word1 === word2) return true;

  const maxLen = Math.max(word1.length, word2.length);
  if (maxLen === 0) return true;

  const distance = levenshteinDistance(word1, word2);
  const similarity = 1 - distance / maxLen;

  // If 80%+ similar (e.g., "Lovesac" vs "Lovsac"), consider it a match
  return similarity >= 0.8;
}

/**
 * Extract key nouns from title for project-aware matching
 */
function extractKeyNouns(title) {
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during']);
  const words = title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  return new Set(words);
}

async function isDuplicateTask(title, projectId = null) {
  const startTime = Date.now();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  console.log(`\n🔍 [DUPLICATE CHECK] Starting for: "${title}"`);
  console.log(`   Project ID: ${projectId || 'none'}`);
  console.log(`   Time window: ${sevenDaysAgo.toISOString()} to now`);

  // Check ALL tasks from last 7 days across all projects (pending, active, dismissed, complete)
  // IMPORTANT: We check across all projects to catch cross-project duplicates
  // Example: "Send phone number to Christine" shouldn't be created in both Microsoft and 72andSunny
  const { data: existingTasks, error} = await supabase
    .from('tasks')
    .select('title, status, created_at, project_id')
    .gte('created_at', sevenDaysAgo.toISOString())
    .in('status', ['pending', 'active', 'dismissed', 'complete']);

  if (error) {
    console.error(`   ❌ Database error during duplicate check:`, error);
    return false;
  }

  console.log(`   📊 Found ${existingTasks?.length || 0} existing tasks in time window`);

  if (!existingTasks || existingTasks.length === 0) {
    console.log(`   ✅ No duplicates (no existing tasks found)`);
    console.log(`   ⏱️  Duration: ${Date.now() - startTime}ms\n`);
    return false;
  }

  // MULTI-LAYER APPROACH: Word matching → Fuzzy matching → Project+noun matching → AI failsafe

  // Phase 1: Quick word-matching check (catches obvious duplicates)
  console.log(`   🔤 Phase 1: Word-matching check...`);
  const normalizedTitle = title.toLowerCase().trim();
  const keyNouns = extractKeyNouns(title);
  let highestSimilarity = 0;
  let mostSimilarTask = null;
  let sameProjectMatches = [];

  for (const existing of existingTasks) {
    const existingNormalized = existing.title.toLowerCase().trim();
    const similarity = calculateSimilarity(normalizedTitle, existingNormalized);

    if (similarity > highestSimilarity) {
      highestSimilarity = similarity;
      mostSimilarTask = existing;
    }

    // Track same-project tasks for later analysis
    if (projectId && existing.project_id === projectId) {
      sameProjectMatches.push({ task: existing, similarity });
    }

    // If 95%+ similar, it's an obvious duplicate - no need for AI
    if (similarity >= 0.95) {
      console.log(`   🎯 DUPLICATE FOUND (word-matching)!`);
      console.log(`      Similarity: ${(similarity * 100).toFixed(1)}%`);
      console.log(`      Existing task: "${existing.title}"`);
      console.log(`      Status: ${existing.status}`);
      console.log(`      Created: ${existing.created_at}`);
      console.log(`   💨 Fast path: No AI call needed`);
      console.log(`   ⏱️  Duration: ${Date.now() - startTime}ms\n`);
      return true;
    }
  }

  // Phase 2: Fuzzy matching (catch typos like "Lovesac" vs "Lovsac")
  console.log(`   🔍 Phase 2: Fuzzy matching check...`);
  for (const existing of existingTasks) {
    const newWords = title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
    const existingWords = existing.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);

    let fuzzyMatches = 0;
    for (const newWord of newWords) {
      for (const existingWord of existingWords) {
        if (areSimilarWords(newWord, existingWord)) {
          fuzzyMatches++;
          break;
        }
      }
    }

    const fuzzyScore = fuzzyMatches / Math.max(newWords.length, existingWords.length);

    if (fuzzyScore >= 0.85) {
      console.log(`   🎯 DUPLICATE FOUND (fuzzy matching)!`);
      console.log(`      Fuzzy score: ${(fuzzyScore * 100).toFixed(1)}%`);
      console.log(`      Existing task: "${existing.title}"`);
      console.log(`      Status: ${existing.status}`);
      console.log(`   💨 Caught typo/variant without AI`);
      console.log(`   ⏱️  Duration: ${Date.now() - startTime}ms\n`);
      return true;
    }
  }

  // Phase 3: Project-aware + key noun matching
  if (projectId && sameProjectMatches.length > 0) {
    console.log(`   🗂️  Phase 3: Project-aware matching (${sameProjectMatches.length} same-project tasks)...`);

    for (const match of sameProjectMatches) {
      const existingNouns = extractKeyNouns(match.task.title);
      const commonNouns = [...keyNouns].filter(n => existingNouns.has(n));

      // If same project + 2+ key nouns match, likely duplicate
      if (commonNouns.length >= 2) {
        console.log(`   🎯 POTENTIAL DUPLICATE (project + nouns)!`);
        console.log(`      Common nouns: ${commonNouns.join(', ')}`);
        console.log(`      Existing task: "${match.task.title}"`);
        console.log(`      Word similarity: ${(match.similarity * 100).toFixed(1)}%`);
        console.log(`   🤖 Sending to AI for confirmation...`);

        const duplicateResult = await isTaskDuplicate(title, [match.task]);
        if (duplicateResult.isDuplicate) {
          console.log(`   ⏱️  Total duration: ${Date.now() - startTime}ms\n`);
          return true;
        }
      }
    }
  }

  // Phase 4: AI failsafe for grey zone (LOWERED from 65% to 50% to catch semantic matches)
  // This catches cases like "Share phone number" vs "Send phone number"
  if (highestSimilarity >= 0.50) {
    console.log(`   📍 Closest word match: "${mostSimilarTask.title}" (${(highestSimilarity * 100).toFixed(1)}%)`);
    console.log(`   🤖 Phase 4: Grey zone detected (50-95%), checking with AI...`);

    const duplicateResult = await isTaskDuplicate(title, existingTasks);

    if (duplicateResult.isDuplicate) {
      console.log(`   ⏱️  Total duration: ${Date.now() - startTime}ms\n`);
      return true;
    }
  } else {
    console.log(`   📍 Closest match: "${mostSimilarTask.title}" (${(highestSimilarity * 100).toFixed(1)}%)`);
    console.log(`   ⏹️  Too dissimilar (<50%), skipping AI check`);
  }

  console.log(`   ✅ No duplicates found`);
  console.log(`   ⏱️  Total duration: ${Date.now() - startTime}ms\n`);
  return false;
}

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
 * Mark emails as processed in the database
 * @param {Array} emailAnalyses - Array of email analysis results from AI
 */
async function markEmailsAsProcessed(emailAnalyses) {
  if (!emailAnalyses || emailAnalyses.length === 0) {
    console.log('   ⚠️  No email analyses to mark as processed');
    return;
  }

  console.log(`\n   📝 [MARK PROCESSED] Attempting to mark ${emailAnalyses.length} emails as processed...`);

  // Filter out emails without IDs and log them
  const validAnalyses = emailAnalyses.filter(analysis => {
    if (!analysis.emailId) {
      console.error(`   ❌ Email missing ID: "${analysis.subject}" from ${analysis.from}`);
      return false;
    }
    return true;
  });

  if (validAnalyses.length === 0) {
    console.error('   ❌ CRITICAL: No emails have IDs! Cannot mark as processed.');
    console.error('   ❌ This will cause duplicates on next run!');
    return;
  }

  if (validAnalyses.length < emailAnalyses.length) {
    console.error(`   ⚠️  WARNING: ${emailAnalyses.length - validAnalyses.length} emails are missing IDs`);
  }

  const records = validAnalyses.map(analysis => ({
    email_id: analysis.emailId,
    source: 'outlook',
    subject: analysis.subject,
    from_email: analysis.from,
    received_date: analysis.receivedDateTime || new Date().toISOString(),
    tasks_created: analysis.tasks?.length || 0,
    narrative_updated: !!analysis.narrative,
    processed_at: new Date().toISOString()
  }));

  console.log(`   💾 Inserting ${records.length} records into processed_emails...`);

  const { error } = await supabase
    .from('processed_emails')
    .insert(records)
    .select();

  if (error) {
    console.error('   ❌ Error marking emails as processed:', error.message);
    console.error('   ❌ Error details:', JSON.stringify(error, null, 2));
    console.error('   ❌ Sample record:', JSON.stringify(records[0], null, 2));
    // Don't throw - this is logging only, shouldn't block task creation
  } else {
    console.log(`   ✅ Successfully marked ${records.length} emails as processed`);
  }
}

async function processCalendarData(events, date) {
  console.log('\n⚠️  WARNING: processCalendarData() is DEPRECATED!');
  console.log('   This function should NOT be used. Use generate-briefings.js instead.');
  console.log('   Phase 2 architecture uses normalized events table, not JSONB storage.');
  console.log('   Skipping to prevent JSONB pollution...\n');

  // Return early - this function is no longer needed in Phase 2
  // All calendar event processing is handled by generate-briefings.js
  // which properly stores events in the normalized events table
  return;
}

async function processEmailData(emails, date) {
  const emailList = Array.isArray(emails) ? emails : (emails.value || []);
  console.log(`\n📧 [EMAIL PROCESSOR] Starting for ${date}`);
  console.log(`   Total emails in file: ${emailList.length}`);

  if (emailList.length === 0) {
    console.log('   No emails to process\n');
    return;
  }

  // Filter out already-processed emails
  const newEmails = await filterNewEmails(emailList);
  console.log(`\n   📊 Email Filtering:`);
  console.log(`      New emails: ${newEmails.length}`);
  console.log(`      Already processed: ${emailList.length - newEmails.length}`);
  console.log(`      API calls saved: ${emailList.length - newEmails.length}`);

  if (newEmails.length === 0) {
    console.log('   ✅ No new emails to process\n');
    return;
  }

  // Get all active projects
  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('id, name, tags')
    .eq('status', 'active');

  if (projectsError) {
    console.error('   Failed to fetch projects:', projectsError);
    return;
  }

  console.log(`   Active projects: ${projects.length}`);

  // Analyze ONLY NEW emails with AI
  console.log('   🤖 Sending emails to AI for analysis...');
  const analysis = await analyzeEmails(newEmails, projects);
  console.log(`   📊 AI returned ${analysis.emailAnalyses?.length || 0} email analyses`);

  let tasksCreated = 0;
  let tasksSkipped = 0;

  // Process each email analysis
  for (const emailAnalysis of analysis.emailAnalyses) {
    console.log(`\n   📨 Processing email: "${emailAnalysis.subject}"`);
    console.log(`      From: ${emailAnalysis.from}`);
    console.log(`      Project: ${emailAnalysis.projectName}`);

    // Find matching project
    const project = projects.find(p =>
      p.name.toLowerCase() === emailAnalysis.projectName.toLowerCase()
    );

    if (!project) {
      console.log(`      ⚠️  Project not found: ${emailAnalysis.projectName}`);
      continue;
    }

    // Update project narrative if present
    if (emailAnalysis.narrative) {
      console.log(`      📝 Updating narrative...`);
      await updateProjectNarrative(project.id, emailAnalysis.narrative, date, 'email');
    }

    // Create pending tasks
    const taskCount = emailAnalysis.tasks?.length || 0;
    console.log(`      🎯 Found ${taskCount} potential task(s)`);

    for (const task of emailAnalysis.tasks || []) {
      console.log(`\n      📋 Task: "${task.title}"`);
      console.log(`         Confidence: ${task.confidence}`);

      if (task.confidence >= 0.9) {
        await createPendingTask({
          ...task,
          project_id: project.id,
          detected_from: `email:${emailAnalysis.emailId}`,
          auto_detected: true,
          context: project.tags.includes('Work') ? 'Work' : 'Life'
        });
        tasksCreated++;
      } else {
        console.log(`         ⏭️  Skipped (confidence too low: ${task.confidence} < 0.9)`);
        tasksSkipped++;
      }
    }
  }

  // Mark all analyzed emails as processed
  await markEmailsAsProcessed(analysis.emailAnalyses);

  console.log(`\n✅ [EMAIL PROCESSOR] Complete`);
  console.log(`   Emails analyzed: ${newEmails.length}`);
  console.log(`   Tasks created: ${tasksCreated}`);
  console.log(`   Tasks skipped: ${tasksSkipped}\n`);
}

async function updateProjectNarrative(projectId, narrativeUpdate, date, source) {
  // Get current project narrative
  const { data: project } = await supabase
    .from('projects')
    .select('narrative')
    .eq('id', projectId)
    .single();

  const narrative = project?.narrative || [];

  // Add new narrative entry with timestamp for better sorting
  narrative.push({
    date,
    headline: narrativeUpdate.headline,
    bullets: narrativeUpdate.bullets,
    source,
    created_at: new Date().toISOString()
  });

  // Sort narratives to prioritize meeting notes over emails
  // Priority: meeting (Granola) > email > note (regular notes + file summaries)
  // Within each priority: most recent first
  const sourcePriority = {
    'meeting': 3,    // Granola meetings only
    'email': 2,      // Email narratives
    'note': 1,       // Regular notes + file summaries
    'file': 1        // Treat same as notes (fallback)
  };

  narrative.sort((a, b) => {
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
  const trimmedNarrative = narrative.slice(0, 150);

  // Update project
  await supabase
    .from('projects')
    .update({
      narrative: trimmedNarrative,
      last_activity: new Date().toISOString()
    })
    .eq('id', projectId);

  console.log(`📝 Updated narrative for project ${projectId} (source: ${source})`);
}

async function createPendingTask(taskData) {
  console.log(`\n📝 [CREATE TASK] Attempting to create: "${taskData.title}"`);
  console.log(`   Source: ${taskData.detected_from}`);
  console.log(`   Priority: ${taskData.priority}`);
  console.log(`   Confidence: ${taskData.confidence}`);

  // Check for duplicates first (90% similarity, last 7 days, all statuses)
  const isDuplicate = await isDuplicateTask(taskData.title, taskData.project_id);

  if (isDuplicate) {
    console.log(`⏭️  [SKIPPED] Task blocked by duplicate detection: "${taskData.title}"\n`);
    return;
  }

  const taskToInsert = {
    title: taskData.title,
    description: taskData.description,
    project_id: taskData.project_id,
    status: 'pending',
    context: taskData.context,
    priority: taskData.priority,
    due_date: taskData.dueDate,
    confidence: taskData.confidence,
    detected_from: taskData.detected_from,
    detection_reasoning: taskData.reasoning,
    auto_detected: true,
    task_type: 'task'
  };

  console.log(`   💾 Inserting into database...`);
  const { error, data } = await supabase
    .from('tasks')
    .insert(taskToInsert)
    .select('id');

  if (error) {
    console.error(`   ❌ Failed to create task:`, error);
    return;
  }

  console.log(`✅ [SUCCESS] Created task: "${taskData.title}"`);
  console.log(`   Task ID: ${data[0]?.id}`);
  console.log(`   Status: pending\n`);
}

module.exports = {
  processCalendarData,
  processEmailData
};
