const { supabase } = require('./db/supabase-client');

async function debugEmailStructure() {
  console.log('\n🔍 Debugging email structure and processing flow...\n');

  // Get a few pending tasks to see their email IDs
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('status', 'pending')
    .eq('auto_detected', true)
    .like('detected_from', 'email:%')
    .limit(3);

  console.log(`Found ${tasks.length} pending email-based tasks\n`);

  for (const task of tasks) {
    const emailId = task.detected_from.replace('email:', '');
    console.log(`═══════════════════════════════════════════════════════`);
    console.log(`Task: ${task.title}`);
    console.log(`Email ID: ${emailId}`);
    console.log(`Created: ${new Date(task.created_at).toLocaleString()}`);

    // Check if this email was marked as processed
    const { data: processed, error } = await supabase
      .from('processed_emails')
      .select('*')
      .eq('email_id', emailId)
      .single();

    if (processed) {
      console.log(`✅ Found in processed_emails:`);
      console.log(`   Processed at: ${new Date(processed.processed_at).toLocaleString()}`);
      console.log(`   Tasks created: ${processed.tasks_created}`);
      console.log(`   Subject: ${processed.subject}`);
    } else {
      console.log(`❌ NOT in processed_emails!`);
      console.log(`   This is why the task keeps getting created!`);
    }
    console.log();
  }

  // Now check if there are ANY new processed emails recently
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('\n📊 Recent processed_emails activity:\n');

  const { data: recentProcessed } = await supabase
    .from('processed_emails')
    .select('*')
    .order('processed_at', { ascending: false })
    .limit(5);

  if (recentProcessed && recentProcessed.length > 0) {
    console.log(`Last ${recentProcessed.length} processed emails:`);
    recentProcessed.forEach((email, idx) => {
      console.log(`\n${idx + 1}. ${email.subject || 'No subject'}`);
      console.log(`   ID: ${email.email_id}`);
      console.log(`   Processed: ${new Date(email.processed_at).toLocaleString()}`);
      console.log(`   Source: ${email.source}`);
      console.log(`   Tasks: ${email.tasks_created}`);
    });
  } else {
    console.log('⚠️  No recent processed emails found!');
  }

  // Check when was the last time data-processor ran
  console.log('\n\n═══════════════════════════════════════════════════════');
  console.log('\n🔍 Diagnosis:\n');

  const lastOutlookEmail = recentProcessed?.find(e => e.source === 'outlook');
  const lastGmailEmail = recentProcessed?.find(e => e.source === 'gmail');

  if (lastOutlookEmail) {
    const daysSince = Math.floor((Date.now() - new Date(lastOutlookEmail.processed_at)) / (1000 * 60 * 60 * 24));
    console.log(`📧 Last Outlook email processed: ${daysSince} days ago (${new Date(lastOutlookEmail.processed_at).toLocaleDateString()})`);
    if (daysSince > 3) {
      console.log(`   ⚠️  WARNING: Outlook email processing may have stopped!`);
    }
  } else {
    console.log(`❌ No Outlook emails found in processed_emails!`);
  }

  if (lastGmailEmail) {
    const daysSince = Math.floor((Date.now() - new Date(lastGmailEmail.processed_at)) / (1000 * 60 * 60 * 24));
    console.log(`📧 Last Gmail email processed: ${daysSince} days ago (${new Date(lastGmailEmail.processed_at).toLocaleDateString()})`);
  }

  // Check for duplicate tasks from same email
  console.log('\n\n═══════════════════════════════════════════════════════');
  console.log('\n🔍 Checking for duplicate tasks from same email source:\n');

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
    console.log(`❌ Found ${duplicates.length} email sources with duplicate tasks:\n`);
    duplicates.forEach(([emailSource, tasks]) => {
      const emailId = emailSource.replace('email:', '');
      console.log(`\nEmail: ${emailId.substring(0, 50)}...`);
      console.log(`   ${tasks.length} duplicate tasks:`);
      tasks.forEach(t => {
        console.log(`   - ${t.title} (created ${new Date(t.created_at).toLocaleDateString()})`);
      });
    });
  } else {
    console.log(`✅ No duplicate tasks from same email source`);
  }

  console.log('\n\n═══════════════════════════════════════════════════════');
  console.log('\n💡 CONCLUSION:\n');

  if (lastOutlookEmail && Math.floor((Date.now() - new Date(lastOutlookEmail.processed_at)) / (1000 * 60 * 60 * 24)) > 3) {
    console.log(`The email processing job hasn't run in ${Math.floor((Date.now() - new Date(lastOutlookEmail.processed_at)) / (1000 * 60 * 60 * 24))} days.`);
    console.log(`This means:`);
    console.log(`  1. Emails are being created through a DIFFERENT path (not data-processor.js)`);
    console.log(`  2. That path is NOT calling markEmailsAsProcessed()`);
    console.log(`  3. The most likely culprit: vault-watcher.js processing email files\n`);
    console.log(`RECOMMENDATION: Check vault-watcher.js to see if it's creating tasks`);
    console.log(`from email files without marking them as processed.`);
  } else {
    console.log(`Email processing appears to be working normally.`);
    console.log(`The issue may be with specific emails not being marked correctly.`);
  }
}

debugEmailStructure().catch(error => {
  console.error('\n❌ Error:', error);
  process.exit(1);
});
