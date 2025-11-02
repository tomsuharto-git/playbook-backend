/**
 * People Data Labs API Client
 *
 * Wrapper for PDL Person Enrichment API
 * Docs: https://docs.peopledatalabs.com/docs/person-enrichment-api
 *
 * Free tier: 100 requests/month
 */

const axios = require('axios');

const PDL_API_KEY = process.env.PDL_API_KEY;
const PDL_API_URL = 'https://api.peopledatalabs.com/v5/person/enrich';

/**
 * Enrich a person's data from their email address
 *
 * @param {string} email - Email address to enrich
 * @returns {Promise<Object>} Enriched person data or null if not found
 */
async function enrichPerson(email) {
  if (!PDL_API_KEY) {
    throw new Error('PDL_API_KEY not configured in .env');
  }

  if (!email || !email.includes('@')) {
    throw new Error('Invalid email address');
  }

  try {
    console.log(`  🔍 PDL API: Enriching ${email}...`);

    const response = await axios.post(
      PDL_API_URL,
      { email },
      {
        headers: {
          'X-Api-Key': PDL_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      }
    );

    if (response.status === 200 && response.data) {
      console.log(`  ✅ PDL API: Found data for ${email}`);
      return parseEnrichmentData(response.data);
    }

    return null;

  } catch (error) {
    // Handle different error types
    if (error.response) {
      const status = error.response.status;

      if (status === 404) {
        console.log(`  ⚠️  PDL API: Person not found (${email})`);
        return {
          found: false,
          status: 404,
          error: 'Person not found in PDL database'
        };
      }

      if (status === 429) {
        console.error(`  🚨 PDL API: Rate limit exceeded`);
        return {
          found: false,
          status: 429,
          error: 'Rate limit exceeded (100/month)'
        };
      }

      if (status === 401 || status === 403) {
        console.error(`  🚨 PDL API: Authentication error (${status})`);
        return {
          found: false,
          status,
          error: 'Invalid API key or unauthorized'
        };
      }

      console.error(`  ❌ PDL API: HTTP ${status} - ${error.response.statusText}`);
      return {
        found: false,
        status,
        error: error.response.statusText || 'API error'
      };
    }

    // Network or timeout error
    console.error(`  ❌ PDL API: Network error - ${error.message}`);
    return {
      found: false,
      status: 0,
      error: error.message || 'Network error'
    };
  }
}

/**
 * Parse PDL enrichment response into our simplified format
 *
 * @param {Object} pdlData - Full PDL API response
 * @returns {Object} Simplified enrichment data
 */
function parseEnrichmentData(pdlData) {
  // PDL response structure (data is nested):
  // {
  //   data: {
  //     full_name: "John Doe",
  //     job_company_name: "Diageo",
  //     job_title: "VP Marketing",
  //     job_title_levels: ["director", "vp"],
  //     linkedin_url: "https://linkedin.com/in/johndoe",
  //     ... many more fields
  //   },
  //   status: 200
  // }

  // Extract data object (PDL nests everything in 'data')
  const data = pdlData.data || pdlData;

  // Determine seniority from job_title_levels
  let seniority = 'unknown';
  if (data.job_title_levels && data.job_title_levels.length > 0) {
    const levels = data.job_title_levels;

    // Prioritize highest level
    if (levels.includes('owner') || levels.includes('partner')) {
      seniority = 'owner';
    } else if (levels.includes('cxo')) {
      seniority = 'c_suite';
    } else if (levels.includes('vp')) {
      seniority = 'vp';
    } else if (levels.includes('director')) {
      seniority = 'director';
    } else if (levels.includes('manager')) {
      seniority = 'manager';
    } else if (levels.includes('senior')) {
      seniority = 'senior';
    } else if (levels.includes('entry')) {
      seniority = 'entry';
    }
  }

  return {
    found: true,
    status: 200,
    name: data.full_name || null,
    company: data.job_company_name || null,
    job_title: data.job_title || null,
    seniority,
    linkedin_url: data.linkedin_url || null,
    full_data: pdlData // Store full response for future use
  };
}

/**
 * Test the PDL API connection
 *
 * @returns {Promise<boolean>} True if API is working
 */
async function testConnection() {
  if (!PDL_API_KEY) {
    console.error('❌ PDL_API_KEY not configured');
    return false;
  }

  console.log('🧪 Testing PDL API connection...');

  try {
    // Test with a known email (PDL founder's email from their docs)
    const result = await enrichPerson('sean@peopledatalabs.com');

    if (result && result.found) {
      console.log('✅ PDL API connection successful');
      console.log(`   Found: ${result.name} at ${result.company}`);
      return true;
    }

    if (result && result.status === 429) {
      console.log('⚠️  PDL API rate limit reached (still connected)');
      return true;
    }

    console.log('⚠️  PDL API responded but no data found (connection ok)');
    return true;

  } catch (error) {
    console.error('❌ PDL API connection failed:', error.message);
    return false;
  }
}

module.exports = {
  enrichPerson,
  testConnection
};
