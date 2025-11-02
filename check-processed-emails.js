const { supabase } = require('./db/supabase-client');

async function checkProcessedEmails() {
  console.log('\n📋 Checking processed_emails table...\n');

  // Check if table exists and has data
  const { data, error, count } = await supabase
    .from('processed_emails')
    .select('*', { count: 'exact' })
    .order('processed_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('❌ Error querying processed_emails:', error);
    return;
  }

  console.log(`✅ Found ${count} total processed emails in database\n`);

  if (data && data.length > 0) {
    console.log('📄 Most recent 10 processed emails:\n');
    console.log('═'.repeat(100));

    data.forEach((email, idx) => {
      console.log(`\n[${idx + 1}] ${email.subject || 'No subject'}`);
      console.log(`   Email ID: ${email.email_id}`);
      console.log(`   From: ${email.from_email || 'Unknown'}`);
      console.log(`   Processed: ${new Date(email.processed_at).toLocaleString()}`);
      console.log(`   Tasks created: ${email.tasks_created}`);
      console.log(`   Source: ${email.source}`);
    });
  } else {
    console.log('⚠️  No processed emails found in database!');
    console.log('   This means emails are NOT being marked as processed.');
  }

  // Check specific email IDs from pending tasks
  console.log('\n\n═'.repeat(100));
  console.log('\n🔍 Checking specific email IDs from duplicate pending tasks:\n');

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
      console.error(`❌ Error checking ${emailId}:`, error);
    } else if (found) {
      console.log(`✅ FOUND: ${emailId}`);
      console.log(`   Subject: ${found.subject}`);
      console.log(`   Processed at: ${new Date(found.processed_at).toLocaleString()}`);
      console.log(`   Tasks created: ${found.tasks_created}`);
    } else {
      console.log(`❌ NOT FOUND: ${emailId}`);
      console.log(`   This email has NOT been marked as processed!`);
    }
    console.log();
  }
}

checkProcessedEmails().catch(error => {
  console.error('\n❌ Error:', error);
  process.exit(1);
});
