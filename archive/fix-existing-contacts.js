const logger = require('../utils/logger');

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function fixExistingContacts() {
  logger.info('🔧 Fixing existing contact records...\n');

  // Get all enriched contacts
  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('enrichment_status', 'enriched');

  if (error) {
    logger.error('Error fetching contacts:', { arg0: error });
    return;
  }

  logger.info('Found  enriched contacts to fix\n', { length: contacts.length });

  for (const contact of contacts) {
    if (!contact.pdl_data || !contact.pdl_data.data) {
      logger.warn('⚠️  Skipping  - no PDL data', { email: contact.email });
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
      logger.error('❌ Failed to update', { email: contact.email });
    } else {
      logger.info('✅ Updated', { email: contact.email });
      if (company || job_title) {
        logger.info('', { name: name });
        logger.info(',', { company || 'No company': company || 'No company', job_title || 'No title': job_title || 'No title' });
        logger.info('Seniority:', { seniority: seniority });
      }
    }
  }

  logger.info('\n✅ Fixed  contacts', { length: contacts.length });
}

fixExistingContacts()
  .then(() => process.exit(0))
  .catch(err => {
    logger.error('Fatal error:', { arg0: err });
    process.exit(1);
  });
