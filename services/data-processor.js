const logger = require('../utils/logger').service('data-processor');

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

  logger.debug('\n🔍 [DUPLICATE CHECK] Starting for: ""', { title: title });
  const projectIdDisplay = projectId || 'none';
  logger.info('Project ID:', { projectIdDisplay: projectIdDisplay });
  const timeWindow = sevenDaysAgo.toISOString();
  logger.info('Time window to now', { timeWindow: timeWindow });

  // Check ALL tasks from last 7 days across all projects (pending, active, dismissed, complete)
  // IMPORTANT: We check across all projects to catch cross-project duplicates
  // Example: "Send phone number to Christine" shouldn't be created in both Microsoft and 72andSunny
  const { data: existingTasks, error} = await supabase
    .from('tasks')
    .select('title, status, created_at, project_id')
    .gte('created_at', sevenDaysAgo.toISOString())
    .in('status', ['pending', 'active', 'dismissed', 'complete']);

  if (error) {
    logger.error('❌ Database error during duplicate check:');
    return false;
  }

  const taskCount = existingTasks?.length || 0;
  logger.debug('📊 Found existing tasks in time window', { taskCount: taskCount });

  if (!existingTasks || existingTasks.length === 0) {
    logger.info('✅ No duplicates (no existing tasks found)');
    const duration = Date.now() - startTime;
    logger.info('⏱️  Duration ms', { duration: duration });
    return false;
  }

  // MULTI-LAYER APPROACH: Word matching → Fuzzy matching → Project+noun matching → AI failsafe

  // Phase 1: Quick word-matching check (catches obvious duplicates)
  logger.info('🔤 Phase 1: Word-matching check...');
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
      logger.info('🎯 DUPLICATE FOUND (word-matching)!');
      const similarityPercent = (similarity * 100).toFixed(1);
      logger.info('Similarity %', { similarityPercent: similarityPercent });
      logger.info('Existing task: ""', { title: existing.title });
      logger.info('Status:', { status: existing.status });
      logger.info('Created:', { created_at: existing.created_at });
      logger.info('💨 Fast path: No AI call needed');
      const duration = Date.now() - startTime;
      logger.info('⏱️  Duration ms', { duration: duration });
      return true;
    }
  }

  // Phase 2: Fuzzy matching (catch typos like "Lovesac" vs "Lovsac")
  logger.debug('🔍 Phase 2: Fuzzy matching check...');
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
      logger.info('🎯 DUPLICATE FOUND (fuzzy matching)!');
      const fuzzyScorePercent = (fuzzyScore * 100).toFixed(1);
      logger.info('Fuzzy score %', { fuzzyScorePercent: fuzzyScorePercent });
      logger.info('Existing task: ""', { title: existing.title });
      logger.info('Status:', { status: existing.status });
      logger.info('💨 Caught typo/variant without AI');
      const duration = Date.now() - startTime;
      logger.info('⏱️  Duration ms', { duration: duration });
      return true;
    }
  }

  // Phase 3: Project-aware + key noun matching
  if (projectId && sameProjectMatches.length > 0) {
    logger.info('🗂️  Phase 3: Project-aware matching ( same-project tasks)...', { length: sameProjectMatches.length });

    for (const match of sameProjectMatches) {
      const existingNouns = extractKeyNouns(match.task.title);
      const commonNouns = [...keyNouns].filter(n => existingNouns.has(n));

      // If same project + 2+ key nouns match, likely duplicate
      if (commonNouns.length >= 2) {
        logger.info('🎯 POTENTIAL DUPLICATE (project + nouns)!');
        const commonNounsList = commonNouns.join(', ');
        logger.info('Common nouns:', { commonNounsList: commonNounsList });
        logger.info('Existing task: ""', { title: match.task.title });
        const wordSimilarityPercent = (match.similarity * 100).toFixed(1);
        logger.info('Word similarity %', { wordSimilarityPercent: wordSimilarityPercent });
        logger.info('🤖 Sending to AI for confirmation...');

        const duplicateResult = await isTaskDuplicate(title, [match.task]);
        if (duplicateResult.isDuplicate) {
          const totalDuration = Date.now() - startTime;
          logger.info('⏱️  Total duration ms', { totalDuration: totalDuration });
          return true;
        }
      }
    }
  }

  // Phase 4: AI failsafe for grey zone (LOWERED from 65% to 50% to catch semantic matches)
  // This catches cases like "Share phone number" vs "Send phone number"
  if (highestSimilarity >= 0.50) {
    const highestSimilarityPercent = (highestSimilarity * 100).toFixed(1);
    logger.info('📍 Closest word match: "" (%)', { title: mostSimilarTask.title, highestSimilarityPercent: highestSimilarityPercent });
    logger.info('🤖 Phase 4: Grey zone detected (50-95%), checking with AI...');

    const duplicateResult = await isTaskDuplicate(title, existingTasks);

    if (duplicateResult.isDuplicate) {
      const totalDuration = Date.now() - startTime;
      logger.info('⏱️  Total duration ms', { totalDuration: totalDuration });
      return true;
    }
  } else {
    const highestSimilarityPercent = (highestSimilarity * 100).toFixed(1);
    logger.info('📍 Closest match: "" (%)', { title: mostSimilarTask.title, highestSimilarityPercent: highestSimilarityPercent });
    logger.info('⏹️  Too dissimilar (<50%), skipping AI check');
  }

  logger.info('✅ No duplicates found');
  const totalDuration = Date.now() - startTime;
  logger.info('⏱️  Total duration ms', { totalDuration: totalDuration });
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
    logger.error('   ⚠️  Error checking processed emails:', { arg0: error.message });
    logger.error('   ⚠️  WARNING: Processing all emails as fail-safe (DB query failed)');
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
    logger.warn('   ⚠️  No email analyses to mark as processed');
    return;
  }

  const emailCount = emailAnalyses.length;
  logger.debug('\n   📝 [MARK PROCESSED] Attempting to mark emails as processed...', { emailCount: emailCount });

  // Filter out emails without IDs and log them
  const validAnalyses = emailAnalyses.filter(analysis => {
    if (!analysis.emailId) {
      logger.error('❌ Email missing ID: "" from', { subject: analysis.subject, from: analysis.from });
      return false;
    }
    return true;
  });

  if (validAnalyses.length === 0) {
    logger.error('   ❌ CRITICAL: No emails have IDs! Cannot mark as processed.');
    logger.error('   ❌ This will cause duplicates on next run!');
    return;
  }

  if (validAnalyses.length < emailAnalyses.length) {
    const missingIdCount = emailAnalyses.length - validAnalyses.length;
    logger.error('⚠️  WARNING: emails are missing IDs', { missingIdCount: missingIdCount });
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

  const recordCount = records.length;
  logger.info('💾 Inserting records into processed_emails...', { recordCount: recordCount });

  const { error } = await supabase
    .from('processed_emails')
    .insert(records)
    .select();

  if (error) {
    logger.error('   ❌ Error marking emails as processed:', { arg0: error.message });
    logger.error('   ❌ Error details:', { arg1: null });
    logger.error('   ❌ Sample record:', { arg1: null });
    // Don't throw - this is logging only, shouldn't block task creation
  } else {
    const processedCount = records.length;
    logger.info('✅ Successfully marked emails as processed', { processedCount: processedCount });
  }
}

async function processCalendarData(events, date) {
  logger.warn('\n⚠️  WARNING: processCalendarData() is DEPRECATED!');
  logger.info('   This function should NOT be used. Use generate-briefings.js instead.');
  logger.info('   Phase 2 architecture uses normalized events table, not JSONB storage.');
  logger.info('   Skipping to prevent JSONB pollution...\n');

  // Return early - this function is no longer needed in Phase 2
  // All calendar event processing is handled by generate-briefings.js
  // which properly stores events in the normalized events table
  return;
}

async function processEmailData(emails, date) {
  const emailList = Array.isArray(emails) ? emails : (emails.value || []);
  logger.info('\n📧 [EMAIL PROCESSOR] Starting for', { date: date });
  logger.info('Total emails in file:', { length: emailList.length });

  if (emailList.length === 0) {
    logger.info('   No emails to process\n');
    return;
  }

  // Filter out already-processed emails
  const newEmails = await filterNewEmails(emailList);
  logger.debug('\n   📊 Email Filtering:');
  logger.info('New emails:', { length: newEmails.length });
  logger.info('Already processed:', { length: emailList.length - newEmails.length });
  logger.info('API calls saved:', { length: emailList.length - newEmails.length });

  if (newEmails.length === 0) {
    logger.info('   ✅ No new emails to process\n');
    return;
  }

  // Get all active projects
  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('id, name, tags')
    .eq('status', 'active');

  if (projectsError) {
    logger.error('   Failed to fetch projects:', { arg0: projectsError });
    return;
  }

  logger.info('Active projects:', { length: projects.length });

  // Analyze ONLY NEW emails with AI
  logger.info('   🤖 Sending emails to AI for analysis...');
  const analysis = await analyzeEmails(newEmails, projects);
  const analysisCount = analysis.emailAnalyses?.length || 0;
  logger.debug('📊 AI returned email analyses', { analysisCount: analysisCount });

  let tasksCreated = 0;
  let tasksSkipped = 0;

  // Process each email analysis
  for (const emailAnalysis of analysis.emailAnalyses) {
    logger.info('\n   📨 Processing email: ""', { subject: emailAnalysis.subject });
    logger.info('From:', { from: emailAnalysis.from });
    logger.info('Project:', { projectName: emailAnalysis.projectName });

    // Find matching project
    const project = projects.find(p =>
      p.name.toLowerCase() === emailAnalysis.projectName.toLowerCase()
    );

    if (!project) {
      logger.warn('⚠️  Project not found:', { projectName: emailAnalysis.projectName });
      continue;
    }

    // Update project narrative if present
    if (emailAnalysis.narrative) {
      logger.debug('📝 Updating narrative...');
      await updateProjectNarrative(project.id, emailAnalysis.narrative, date, 'email');
    }

    // Create pending tasks
    const taskCount = emailAnalysis.tasks?.length || 0;
    logger.info('🎯 Found  potential task(s)', { taskCount: taskCount });

    for (const task of emailAnalysis.tasks || []) {
      logger.info('\n      📋 Task: ""', { title: task.title });
      logger.info('Confidence:', { confidence: task.confidence });

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
        logger.info('⏭️  Skipped (confidence too low:  < 0.9)', { confidence: task.confidence });
        tasksSkipped++;
      }
    }
  }

  // Mark all analyzed emails as processed
  await markEmailsAsProcessed(analysis.emailAnalyses);

  logger.info('\n✅ [EMAIL PROCESSOR] Complete');
  logger.info('Emails analyzed:', { length: newEmails.length });
  logger.info('Tasks created:', { tasksCreated: tasksCreated });
  logger.info('Tasks skipped: \n', { tasksSkipped: tasksSkipped });
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

  logger.debug('📝 Updated narrative for project  (source: )', { projectId: projectId, source: source });
}

async function createPendingTask(taskData) {
  logger.debug('\n📝 [CREATE TASK] Attempting to create: ""', { title: taskData.title });
  logger.info('Source:', { detected_from: taskData.detected_from });
  logger.info('Priority:', { priority: taskData.priority });
  logger.info('Confidence:', { confidence: taskData.confidence });

  // Check for duplicates first (90% similarity, last 7 days, all statuses)
  const isDuplicate = await isDuplicateTask(taskData.title, taskData.project_id);

  if (isDuplicate) {
    logger.info('⏭️  [SKIPPED] Task blocked by duplicate detection: ""\n', { title: taskData.title });
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

  logger.info('💾 Inserting into database...');
  const { error, data } = await supabase
    .from('tasks')
    .insert(taskToInsert)
    .select('id');

  if (error) {
    logger.error('❌ Failed to create task:');
    return;
  }

  logger.info('✅ [SUCCESS] Created task: ""', { title: taskData.title });
  logger.info('Task ID:', { id: data[0]?.id });
  logger.info('Status: pending\n');
}

module.exports = {
  processCalendarData,
  processEmailData
};
