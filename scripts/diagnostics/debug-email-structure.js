const logger = require('../../utils/logger');

const { supabase } = require('./db/supabase-client');

async function debugEmailStructure() {
  logger.debug('\n🔍 Debugging email structure and processing flow...\n');

  // Get a few pending tasks to see their email IDs
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('status', 'pending')
    .eq('auto_detected', true)
    .like('detected_from', 'email:%')
    .limit(3);

  logger.info('Found  pending email-based tasks\n', { length: tasks.length });

  for (const task of tasks) {
    const emailId = task.detected_from.replace('email:', '');
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('Task:', { title: task.title });
    logger.info('Email ID:', { emailId: emailId });
    logger.info('Created:', { toLocaleString(): new Date(task.created_at).toLocaleString() });

    // Check if this email was marked as processed
    const { data: processed, error } = await supabase
      .from('processed_emails')
      .select('*')
      .eq('email_id', emailId)
      .single();

    if (processed) {
      logger.info('✅ Found in processed_emails:');
      logger.info('Processed at:', { toLocaleString(): new Date(processed.processed_at).toLocaleString() });
      logger.info('Tasks created:', { tasks_created: processed.tasks_created });
      logger.info('Subject:', { subject: processed.subject });
    } else {
      logger.error('❌ NOT in processed_emails!');
      logger.info('This is why the task keeps getting created!');
    }
    logger.info();
  }

  // Now check if there are ANY new processed emails recently
  logger.info('\n═══════════════════════════════════════════════════════');
  logger.debug('\n📊 Recent processed_emails activity:\n');

  const { data: recentProcessed } = await supabase
    .from('processed_emails')
    .select('*')
    .order('processed_at', { ascending: false })
    .limit(5);

  if (recentProcessed && recentProcessed.length > 0) {
    logger.info('Last  processed emails:', { length: recentProcessed.length });
    recentProcessed.forEach((email, idx) => {
      logger.info('\n.', { idx + 1: idx + 1, subject || 'No subject': email.subject || 'No subject' });
      logger.info('ID:', { email_id: email.email_id });
      logger.info('Processed:', { toLocaleString(): new Date(email.processed_at).toLocaleString() });
      logger.info('Source:', { source: email.source });
      logger.info('Tasks:', { tasks_created: email.tasks_created });
    });
  } else {
    logger.warn('⚠️  No recent processed emails found!');
  }

  // Check when was the last time data-processor ran
  logger.info('\n\n═══════════════════════════════════════════════════════');
  logger.debug('\n🔍 Diagnosis:\n');

  const lastOutlookEmail = recentProcessed?.find(e => e.source === 'outlook');
  const lastGmailEmail = recentProcessed?.find(e => e.source === 'gmail');

  if (lastOutlookEmail) {
    const daysSince = Math.floor((Date.now() - new Date(lastOutlookEmail.processed_at)) / (1000 * 60 * 60 * 24));
    logger.info('📧 Last Outlook email processed:  days ago ()', { daysSince: daysSince, toLocaleDateString(): new Date(lastOutlookEmail.processed_at).toLocaleDateString() });
    if (daysSince > 3) {
      logger.warn('⚠️  WARNING: Outlook email processing may have stopped!');
    }
  } else {
    logger.error('❌ No Outlook emails found in processed_emails!');
  }

  if (lastGmailEmail) {
    const daysSince = Math.floor((Date.now() - new Date(lastGmailEmail.processed_at)) / (1000 * 60 * 60 * 24));
    logger.info('📧 Last Gmail email processed:  days ago ()', { daysSince: daysSince, toLocaleDateString(): new Date(lastGmailEmail.processed_at).toLocaleDateString() });
  }

  // Check for duplicate tasks from same email
  logger.info('\n\n═══════════════════════════════════════════════════════');
  logger.debug('\n🔍 Checking for duplicate tasks from same email source:\n');

  const { data: allPendingEmailTasks } = await supabase
    .from('tasks')
    .select('detected_from, title, created_at')
    .eq('status', 'pending')
    .like('detected_from', 'email:%')
    .order('detected_from');

  // Group by detected_from
  const emailGroups = {};
  allPendingEmailTasks.forEach(task => {
    if (!emailGroups[task.detected_from]) {
      emailGroups[task.detected_from] = [];
    }
    emailGroups[task.detected_from].push(task);
  });

  // Find duplicates
  const duplicates = Object.entries(emailGroups).filter(([_, tasks]) => tasks.length > 1);

  if (duplicates.length > 0) {
    logger.error('❌ Found  email sources with duplicate tasks:\n', { length: duplicates.length });
    duplicates.forEach(([emailSource, tasks]) => {
      const emailId = emailSource.replace('email:', '');
      logger.info('\nEmail: ...', { substring(0, 50): emailId.substring(0, 50) });
      logger.info('duplicate tasks:', { length: tasks.length });
      tasks.forEach(t => {
        logger.info('-  (created )', { title: t.title, toLocaleDateString(): new Date(t.created_at).toLocaleDateString() });
      });
    });
  } else {
    logger.info('✅ No duplicate tasks from same email source');
  }

  logger.info('\n\n═══════════════════════════════════════════════════════');
  logger.info('\n💡 CONCLUSION:\n');

  if (lastOutlookEmail && Math.floor((Date.now() - new Date(lastOutlookEmail.processed_at)) / (1000 * 60 * 60 * 24)) > 3) {
    logger.info('The email processing job hasn't run in  days.', { processed_at)) / (1000 * 60 * 60 * 24)): Math.floor((Date.now() - new Date(lastOutlookEmail.processed_at)) / (1000 * 60 * 60 * 24)) });
    logger.info('This means:');
    logger.info('1. Emails are being created through a DIFFERENT path (not data-processor.js)');
    logger.info('2. That path is NOT calling markEmailsAsProcessed()');
    logger.info('3. The most likely culprit: vault-watcher.js processing email files\n');
    logger.info('RECOMMENDATION: Check vault-watcher.js to see if it's creating tasks');
    logger.info('from email files without marking them as processed.');
  } else {
    logger.info('Email processing appears to be working normally.');
    logger.info('The issue may be with specific emails not being marked correctly.');
  }
}

debugEmailStructure().catch(error => {
  logger.error('\n❌ Error:', { arg0: error });
  process.exit(1);
});
