/**
 * Unified Configuration System
 *
 * Central source of truth for all application configuration.
 * All environment variables and settings are defined here to:
 * - Prevent configuration sprawl across files
 * - Enable easy environment-specific overrides
 * - Provide validation and defaults
 * - Make configuration discoverable in one place
 */

require('dotenv').config();

/**
 * Validates required environment variables
 * @param {Object} vars - Object with variable names as keys and descriptions as values
 * @throws {Error} if required variables are missing
 */
function validateRequired(vars) {
  const missing = Object.keys(vars).filter(key => !process.env[key]);
  if (missing.length > 0) {
    const details = missing.map(key => `  - ${key}: ${vars[key]}`).join('\n');
    throw new Error(`Missing required environment variables:\n${details}`);
  }
}

// Validate critical environment variables
validateRequired({
  SUPABASE_URL: 'Supabase project URL',
  SUPABASE_KEY: 'Supabase anon/service key',
  ANTHROPIC_API_KEY: 'Claude API key for AI processing'
});

const config = {
  // ============================================================
  // APPLICATION
  // ============================================================
  app: {
    env: process.env.NODE_ENV || 'production',
    port: parseInt(process.env.PORT || '3001', 10),
    isDevelopment: (process.env.NODE_ENV || 'production') === 'development',
    isProduction: (process.env.NODE_ENV || 'production') === 'production'
  },

  // ============================================================
  // DATABASE (Supabase PostgreSQL)
  // ============================================================
  database: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY
  },

  // ============================================================
  // AI / LLM
  // ============================================================
  ai: {
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-3-5-sonnet-20241022',
      maxTokens: 8000
    }
  },

  // ============================================================
  // FRONTEND / CORS
  // ============================================================
  frontend: {
    // Ensure URL has protocol prefix
    url: process.env.FRONTEND_URL
      ? (process.env.FRONTEND_URL.startsWith('http')
          ? process.env.FRONTEND_URL
          : `https://${process.env.FRONTEND_URL}`)
      : 'http://localhost:3000'
  },

  // ============================================================
  // EMAIL PROVIDERS
  // ============================================================
  email: {
    gmail: {
      clientId: process.env.GMAIL_CLIENT_ID || '',
      clientSecret: process.env.GMAIL_CLIENT_SECRET || '',
      redirectUri: process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/auth/google/callback',
      refreshToken: process.env.GMAIL_REFRESH_TOKEN || '',
      configured: !!(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_REFRESH_TOKEN)
    },
    outlook: {
      clientId: process.env.OUTLOOK_CLIENT_ID || '',
      clientSecret: process.env.OUTLOOK_CLIENT_SECRET || '',
      refreshToken: process.env.OUTLOOK_REFRESH_TOKEN || '',
      configured: !!(process.env.OUTLOOK_CLIENT_ID && process.env.OUTLOOK_REFRESH_TOKEN)
    }
  },

  // ============================================================
  // CALENDAR PROVIDERS
  // ============================================================
  calendar: {
    google: {
      clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '',
      redirectUri: process.env.GOOGLE_CALENDAR_REDIRECT_URI || 'http://localhost:3000/auth/google-calendar/callback',
      refreshToken: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN || '',
      configured: !!(process.env.GOOGLE_CALENDAR_CLIENT_ID && process.env.GOOGLE_CALENDAR_REFRESH_TOKEN)
    },
    outlook: {
      clientId: process.env.OUTLOOK_CALENDAR_CLIENT_ID || process.env.OUTLOOK_CLIENT_ID || '',
      clientSecret: process.env.OUTLOOK_CALENDAR_CLIENT_SECRET || process.env.OUTLOOK_CLIENT_SECRET || '',
      refreshToken: process.env.OUTLOOK_CALENDAR_REFRESH_TOKEN || process.env.OUTLOOK_REFRESH_TOKEN || '',
      configured: !!(
        (process.env.OUTLOOK_CALENDAR_CLIENT_ID || process.env.OUTLOOK_CLIENT_ID) &&
        (process.env.OUTLOOK_CALENDAR_REFRESH_TOKEN || process.env.OUTLOOK_REFRESH_TOKEN)
      )
    }
  },

  // ============================================================
  // CLOUD STORAGE (OneDrive, etc.)
  // ============================================================
  storage: {
    azure: {
      clientId: process.env.AZURE_CLIENT_ID || '',
      clientSecret: process.env.AZURE_CLIENT_SECRET || '',
      tenantId: process.env.AZURE_TENANT_ID || '',
      configured: !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET)
    }
  },

  // ============================================================
  // EXTERNAL APIs
  // ============================================================
  apis: {
    weather: {
      openWeather: {
        apiKey: process.env.OPENWEATHER_API_KEY || '',
        configured: !!process.env.OPENWEATHER_API_KEY
      }
    }
  },

  // ============================================================
  // RAILWAY DEPLOYMENT
  // ============================================================
  railway: {
    staticUrl: process.env.RAILWAY_STATIC_URL || '',
    environment: process.env.RAILWAY_ENVIRONMENT || '',
    deploymentId: process.env.RAILWAY_DEPLOYMENT_ID || '',
    isRailway: !!process.env.RAILWAY_STATIC_URL
  },

  // ============================================================
  // SCHEDULED JOBS
  // ============================================================
  jobs: {
    emailScanning: {
      enabled: true,
      // Runs every 30 minutes
      schedule: '*/30 * * * *',
      timezone: 'America/New_York'
    },
    qualityControl: {
      enabled: true,
      // Runs every 6 hours: midnight, 6am, noon, 6pm ET
      schedule: '0 0,6,12,18 * * *',
      timezone: 'America/New_York'
    },
    briefingGeneration: {
      enabled: true,
      // Runs 3x daily: 6am, 12pm, 6pm ET
      schedule: '0 6,12,18 * * *',
      timezone: 'America/New_York'
    }
  },

  // ============================================================
  // FEATURE FLAGS
  // ============================================================
  features: {
    phase2Architecture: true,  // Three-entity model (tasks, events, narratives)
    emailScanning: true,
    qualityControl: true,
    briefingGeneration: true
  }
};

module.exports = config;
