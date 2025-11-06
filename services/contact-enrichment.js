/**
 * Contact Enrichment Service
 *
 * Manages enrichment of external meeting attendees using PDL API
 * with intelligent caching to minimize API usage (100 calls/month limit)
 */

const { createClient } = require('@supabase/supabase-js');
const pdlClient = require('./pdl-client');
const logger = require('../utils/logger').service('contact-enrichment');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Internal emails to skip enrichment
const INTERNAL_DOMAINS = ['forsman.com'];

// Tom's emails to always filter out
const TOM_EMAILS = [
  'tom.suharto@forsman.com',
  'tom.suharto@hechostudios.com',
  'tom.suharto@72andsunny.com',
  'tomsuharto@gmail.com'
];

/**
 * Check if email is internal (skip enrichment)
 */
function isInternalEmail(email) {
  if (!email) return true;

  // Check Tom's emails
  if (TOM_EMAILS.includes(email.toLowerCase())) {
    return true;
  }

  // Check internal domains
  const domain = email.split('@')[1]?.toLowerCase();
  return INTERNAL_DOMAINS.some(d => domain === d);
}

/**
 * Get contact from database cache
 */
async function getContactFromCache(email) {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('email', email.toLowerCase())
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned - contact not in cache
      return null;
    }
    throw error;
  }

  return data;
}

/**
 * Update last_seen_at for an existing contact
 */
async function updateLastSeen(contactId) {
  const { error } = await supabase
    .from('contacts')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', contactId);

  if (error) {
    logger.error('⚠️  Failed to update last_seen for contact :', { contactId: contactId });
  }
}

/**
 * Save new contact to database
 */
async function saveContact(email, name, enrichmentData) {
  const contactRecord = {
    email: email.toLowerCase(),
    name,
    company: enrichmentData?.company || null,
    job_title: enrichmentData?.job_title || null,
    seniority: enrichmentData?.seniority || null,
    linkedin_url: enrichmentData?.linkedin_url || null,
    pdl_enriched_at: enrichmentData?.found ? new Date().toISOString() : null,
    pdl_data: enrichmentData?.full_data || null,
    enrichment_status: enrichmentData?.found ? 'enriched' :
                       enrichmentData?.status === 404 ? 'not_found' : 'error'
  };

  const { data, error } = await supabase
    .from('contacts')
    .insert([contactRecord])
    .select()
    .single();

  if (error) {
    logger.error('❌ Failed to save contact :', { email: email });
    throw error;
  }

  return data;
}

/**
 * Log PDL API usage
 */
async function logApiUsage(email, contactId, status, success, errorMessage = null) {
  const { error } = await supabase
    .from('pdl_api_usage')
    .insert([{
      email: email.toLowerCase(),
      contact_id: contactId,
      status_code: status,
      success,
      error_message: errorMessage
    }]);

  if (error) {
    logger.error('⚠️  Failed to log API usage:');
  }
}

/**
 * Get monthly API usage count
 */
async function getMonthlyUsage() {
  const { data, error } = await supabase.rpc('get_monthly_pdl_usage');

  if (error) {
    logger.error('  ⚠️  Failed to get monthly usage:', { arg0: error.message });
    return 0;
  }

  return data || 0;
}

/**
 * Check if we can make more API calls this month
 */
async function canMakeApiCall() {
  const usage = await getMonthlyUsage();
  return usage < 100;
}

/**
 * Enrich a single attendee with PDL data
 *
 * @param {Object} attendee - { email, name, responseStatus }
 * @returns {Promise<Object>} Enriched attendee with company, job_title, seniority
 */
async function enrichAttendee(attendee) {
  const { email, name } = attendee;

  // Skip internal emails
  if (isInternalEmail(email)) {
    return attendee; // Return as-is, no enrichment
  }

  try {
    // Check cache first
    const cachedContact = await getContactFromCache(email);

    if (cachedContact) {
      // Cache hit! Use cached data
      logger.info('💾 Cache hit:', { email: email });

      // Update last_seen_at
      await updateLastSeen(cachedContact.id);

      // Return enriched attendee
      return {
        ...attendee,
        company: cachedContact.company,
        job_title: cachedContact.job_title,
        seniority: cachedContact.seniority,
        linkedin_url: cachedContact.linkedin_url
      };
    }

    // Cache miss - need to enrich
    logger.info('🆕 New contact:', { email: email });

    // Check if we have API calls remaining
    const canCall = await canMakeApiCall();
    if (!canCall) {
      logger.warn('⚠️  Monthly API limit reached (100/100). Skipping enrichment for', { email: email });

      // Save to contacts table without enrichment
      await saveContact(email, name, { found: false, status: 429, error: 'Rate limit' });

      return attendee; // Return without enrichment
    }

    // Call PDL API
    const enrichmentData = await pdlClient.enrichPerson(email);

    // Log API usage
    await logApiUsage(
      email,
      null, // We don't have contact_id yet
      enrichmentData.status,
      enrichmentData.found,
      enrichmentData.error
    );

    // Save to database (even if not found, to avoid retrying)
    const contact = await saveContact(email, name, enrichmentData);

    // Return enriched attendee
    if (enrichmentData.found) {
      return {
        ...attendee,
        company: contact.company,
        job_title: contact.job_title,
        seniority: contact.seniority,
        linkedin_url: contact.linkedin_url
      };
    }

    // Not found or error - return as-is
    return attendee;

  } catch (error) {
    logger.error('❌ Enrichment error for :', { email: email });
    return attendee; // Return as-is on error
  }
}

/**
 * Enrich all attendees in an event
 *
 * @param {Array} attendees - Array of attendee objects
 * @returns {Promise<Array>} Enriched attendees
 */
async function enrichAttendees(attendees) {
  if (!attendees || attendees.length === 0) {
    return [];
  }

  // Get current usage for logging
  const currentUsage = await getMonthlyUsage();
  logger.debug('📊 PDL API Usage: /100 this month', { currentUsage: currentUsage });

  // Process attendees sequentially (to avoid race conditions with DB)
  const enrichedAttendees = [];

  for (const attendee of attendees) {
    const enriched = await enrichAttendee(attendee);
    enrichedAttendees.push(enriched);
  }

  return enrichedAttendees;
}

/**
 * Enrich all events in a calendar array
 *
 * @param {Array} events - Array of calendar events
 * @returns {Promise<Array>} Events with enriched attendees
 */
async function enrichCalendarEvents(events) {
  if (!events || events.length === 0) {
    return [];
  }

  logger.info('\n🌟 Enriching attendees for  events...', { length: events.length });

  const enrichedEvents = [];

  for (const event of events) {
    if (event.attendees && event.attendees.length > 0) {
      logger.info('\n📅 Event:  ( attendees)', { summary || 'No title': event.summary || 'No title', length: event.attendees.length });
      const enrichedAttendees = await enrichAttendees(event.attendees);

      enrichedEvents.push({
        ...event,
        attendees: enrichedAttendees
      });
    } else {
      // No attendees - keep as-is
      enrichedEvents.push(event);
    }
  }

  const finalUsage = await getMonthlyUsage();
  logger.info('\n✅ Enrichment complete. API usage: /100 this month\n', { finalUsage: finalUsage });

  return enrichedEvents;
}

/**
 * Get enrichment statistics
 */
async function getEnrichmentStats() {
  // Total contacts
  const { count: totalContacts } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true });

  // Enriched contacts
  const { count: enrichedContacts } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('enrichment_status', 'enriched');

  // Monthly usage
  const monthlyUsage = await getMonthlyUsage();

  return {
    total_contacts: totalContacts || 0,
    enriched_contacts: enrichedContacts || 0,
    not_found_contacts: (totalContacts || 0) - (enrichedContacts || 0),
    monthly_api_calls: monthlyUsage,
    api_calls_remaining: Math.max(0, 100 - monthlyUsage)
  };
}

module.exports = {
  enrichAttendee,
  enrichAttendees,
  enrichCalendarEvents,
  getEnrichmentStats,
  isInternalEmail
};
