const logger = require('../../utils/logger');

const { supabase } = require('./db/supabase-client');

async function checkProcessedEmails() {
  logger.info('\n📋 Checking processed_emails table...\n');

  // Check if table exists and has data
  const { data, error, count } = await supabase
    .from('processed_emails')
    .select('*', { count: 'exact' })
    .order('processed_at', { ascending: false })
    .limit(10);

  if (error) {
    logger.error('❌ Error querying processed_emails:', { arg0: error });
    return;
  }

  logger.info('✅ Found  total processed emails in database\n', { count: count });

  if (data && data.length > 0) {
    logger.info('📄 Most recent 10 processed emails:\n');
    logger.info('═'.repeat(100));

    data.forEach((email, idx) => {
      logger.info('\n[]', { idx + 1: idx + 1, subject || 'No subject': email.subject || 'No subject' });
      logger.info('Email ID:', { email_id: email.email_id });
      logger.info('From:', { from_email || 'Unknown': email.from_email || 'Unknown' });
      logger.info('Processed:', { toLocaleString(): new Date(email.processed_at).toLocaleString() });
      logger.info('Tasks created:', { tasks_created: email.tasks_created });
      logger.info('Source:', { source: email.source });
    });
  } else {
    logger.warn('⚠️  No processed emails found in database!');
    logger.info('   This means emails are NOT being marked as processed.');
  }

  // Check specific email IDs from pending tasks
  logger.info('\n\n═'.repeat(100));
  logger.debug('\n🔍 Checking specific email IDs from duplicate pending tasks:\n');

  const duplicateEmailIds = [
    'AAMkAGY0MDI5OGIyLTExMmItNDJlZi05YmU5LThkNzY4MTFiOGM1MgBGAAAAAADyB8nMMMY-SKU6kMyWhHZuBwCrVKJz-pAXT7g8QVH_5CtgAAQ5DD3nAAA=', // Oatley task
    'AAMkAGY0MDI5OGIyLTExMmItNDJlZi05YmU5LThkNzY4MTFiOGM1MgBGAAAAAADyB8nMMMY-SKU6kMyWhHZuBwCrVKJz-pAXT7g8QVH_5CtgAAQ5DD32AAA='  // Q4 story questions
  ];

  for (const emailId of duplicateEmailIds) {
    const { data: found, error } = await supabase
      .from('processed_emails')
      .select('*')
      .eq('email_id', emailId)
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error('❌ Error checking :', { emailId: emailId });
    } else if (found) {
      logger.info('✅ FOUND:', { emailId: emailId });
      logger.info('Subject:', { subject: found.subject });
      logger.info('Processed at:', { toLocaleString(): new Date(found.processed_at).toLocaleString() });
      logger.info('Tasks created:', { tasks_created: found.tasks_created });
    } else {
      logger.error('❌ NOT FOUND:', { emailId: emailId });
      logger.info('This email has NOT been marked as processed!');
    }
    logger.info();
  }
}

checkProcessedEmails().catch(error => {
  logger.error('\n❌ Error:', { arg0: error });
  process.exit(1);
});
