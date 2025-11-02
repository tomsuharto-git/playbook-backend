require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function fixExistingContacts() {
  console.log('🔧 Fixing existing contact records...\n');

  // Get all enriched contacts
  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('enrichment_status', 'enriched');

  if (error) {
    console.error('Error fetching contacts:', error);
    return;
  }

  console.log(`Found ${contacts.length} enriched contacts to fix\n`);

  for (const contact of contacts) {
    if (!contact.pdl_data || !contact.pdl_data.data) {
      console.log(`⚠️  Skipping ${contact.email} - no PDL data`);
      continue;
    }

    const data = contact.pdl_data.data;

    // Extract correct values
    const name = data.full_name || contact.name;
    const company = data.job_company_name || null;
    const job_title = data.job_title || null;
    const linkedin_url = data.linkedin_url || null;

    // Determine seniority
    let seniority = 'unknown';
    if (data.job_title_levels && data.job_title_levels.length > 0) {
      const levels = data.job_title_levels;
      if (levels.includes('owner') || levels.includes('partner')) seniority = 'owner';
      else if (levels.includes('cxo')) seniority = 'c_suite';
      else if (levels.includes('vp')) seniority = 'vp';
      else if (levels.includes('director')) seniority = 'director';
      else if (levels.includes('manager')) seniority = 'manager';
      else if (levels.includes('senior')) seniority = 'senior';
      else if (levels.includes('entry')) seniority = 'entry';
    }

    // Update contact
    const { error: updateError } = await supabase
      .from('contacts')
      .update({
        name,
        company,
        job_title,
        seniority,
        linkedin_url
      })
      .eq('id', contact.id);

    if (updateError) {
      console.log(`❌ Failed to update ${contact.email}`);
    } else {
      console.log(`✅ Updated ${contact.email}`);
      if (company || job_title) {
        console.log(`   ${name}`);
        console.log(`   ${company || 'No company'}, ${job_title || 'No title'}`);
        console.log(`   Seniority: ${seniority}`);
      }
    }
  }

  console.log(`\n✅ Fixed ${contacts.length} contacts`);
}

fixExistingContacts()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
