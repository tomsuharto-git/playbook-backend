# Playbook Backend Stabilization & Consolidation Plan

**Created**: November 6, 2025
**Status**: Planning
**Duration**: 2 weeks (14 days)
**Disruption Level**: High - production features paused for deep refactor

---

## Executive Summary

The playbook-backend system is experiencing "choppy and buggy" behavior due to:
1. **Three competing architectures** running simultaneously (Phase 1 JSONB, Phase 2 normalized, Hybrid)
2. **Duplicate implementations** of core functionality (3+ duplicate detection systems)
3. **73 root-level utility scripts** cluttering the codebase
4. **Silent failures** - errors caught but not surfaced
5. **Configuration sprawl** - hardcoded values throughout services

This plan addresses all four pain points identified:
- ✅ Data inconsistency (calendar/tasks show different data)
- ✅ Development confusion (unclear which code to edit)
- ✅ Silent failures (things break without visibility)
- ✅ Railway deployment issues (unclear what's running)

---

## Problem Analysis Summary

### Root Causes of "Choppy and Buggy" Feeling

1. **Architectural Transition Pain**: System is mid-refactor between Phase 1 and Phase 2, creating dual code paths
2. **Multiple Sources of Truth**: Calendar data exists in 5 places (JSONB, event_ids array, events table, event_overrides, event_actions)
3. **Defensive Programming Overload**: Excessive try/catch blocks create unpredictable behavior
4. **Silent Error Handling**: Many errors caught but not logged or surfaced to user
5. **Configuration Inconsistency**: Hardcoded values like `excludedTitles = ['Peloton 🚴', 'Kasper ➡️ Bus']` scattered throughout

### Critical Files Requiring Attention

**Immediate Priority:**
- `/server-railway.js` - Production server
- `/routes/calendar.js` - Complex dual-storage logic (lines 119-189)
- `/jobs/generate-briefings.js` - Recently fixed but still complex
- `/services/central-processor.js` - Core processing logic

**High Priority:**
- `/services/unified-email-handler.js` - Email entry point
- `/services/data-processor.js` - Has own duplicate detection
- `/services/quality-control-service.js` - 1,115 lines, needs splitting
- `package.json` - Scripts point to deprecated server

---

## Phase 1: Foundation & Clarity (Days 1-3)

**Goal**: Establish clear understanding of what code does what and when to use it.

### 1.1 Root Directory Cleanup

**Problem**: 73 JavaScript files at root level making navigation difficult.

**Action**:
```bash
# Create organized structure
mkdir -p scripts/{diagnostics,debugging,migrations,maintenance}

# Move files
mv check-*.js scripts/diagnostics/
mv debug-*.js scripts/debugging/
mv backfill-*.js scripts/migrations/
mv cleanup-*.js scripts/maintenance/
mv analyze-*.js scripts/diagnostics/
mv fix-*.js scripts/maintenance/
mv generate-*.js scripts/maintenance/
```

**Files to Keep at Root**:
- `server-railway.js` (production)
- `server-phase2.js` (local development)
- `package.json`
- Configuration files (`.env`, `railway.toml`)
- Documentation files (`README.md`, `CLAUDE.md`)

**Files to Deprecate**:
```bash
# Rename to indicate deprecated status
mv server.js server-phase1-DEPRECATED.js
mv server-local.js server-local-DEPRECATED.js
```

### 1.2 Server Architecture Documentation

**Problem**: Three server files with unclear usage (`server.js`, `server-railway.js`, `server-phase2.js`).

**Create `SERVER_ARCHITECTURE.md`**:
```markdown
# Server Architecture Guide

## Production Server: `server-railway.js`
- **When to use**: ALWAYS for Railway deployment
- **Architecture**: Phase 2 (Three-Entity Model)
- **Database**: Supabase (events, tasks, narratives tables)
- **Scheduled Jobs**: Email scanning (30min), Briefing generation (3x daily), QC (6hr)
- **No Vault**: Railway is cloud environment

## Local Development Server: `server-phase2.js`
- **When to use**: Local development with vault watcher
- **Architecture**: Phase 2 (Three-Entity Model)
- **Database**: Same as production (Supabase)
- **Vault Watcher**: Monitors Obsidian vault for changes
- **Scheduled Jobs**: Same as production

## Deprecated Servers
- `server-phase1-DEPRECATED.js` - Old Phase 1 architecture (DO NOT USE)
- `server-local-DEPRECATED.js` - Outdated local setup (DO NOT USE)
```

**Update `package.json`**:
```json
{
  "scripts": {
    "dev": "nodemon server-phase2.js",  // CHANGED from server.js
    "start": "node server-railway.js",
    "railway": "node server-railway.js",
    "test": "jest"
  }
}
```

### 1.3 Environment Variables Documentation

**Problem**: Unclear which environment variables are required, optional, or deprecated.

**Create `ENV_VARIABLES.md`**:
```markdown
# Environment Variables Documentation

## Required (All Environments)
- `ANTHROPIC_API_KEY` - Claude API for AI processing
- `SUPABASE_URL` - Database connection
- `SUPABASE_KEY` - Database authentication
- `DATABASE_URL` - PostgreSQL connection string (Supabase provides this)

## Required (Production Only)
- `FRONTEND_URL` - CORS configuration for frontend (Railway URL)

## Required (Local Development Only)
- `VAULT_PATH` - Path to Obsidian vault for file watching

## Optional (Email Integration)
- `GMAIL_CLIENT_ID` - Gmail OAuth (required for email scanning)
- `GMAIL_CLIENT_SECRET` - Gmail OAuth
- `GMAIL_REFRESH_TOKEN` - Gmail OAuth
- `OUTLOOK_CLIENT_ID` - Outlook OAuth (calendar only)
- `OUTLOOK_CLIENT_SECRET` - Outlook OAuth

## Optional (External Services)
- `ELEVENLABS_API_KEY` - Podcast text-to-speech
- `PDL_API_KEY` - Contact enrichment
- `GOOGLE_API_KEY` - Google Calendar API
- `OPENWEATHER_API_KEY` - Weather data

## Optional (Configuration)
- `PORT` - Server port (default: 3001)
- `NODE_ENV` - Environment (development/production)

## Deprecated (No Longer Used)
- `GOOGLE_SERVICE_ACCOUNT` - Old authentication method
```

**Update `.env.example`**:
```env
# ============================================================
# REQUIRED - All Environments
# ============================================================
ANTHROPIC_API_KEY=your_anthropic_key_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_anon_key
DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres

# ============================================================
# REQUIRED - Production (Railway)
# ============================================================
FRONTEND_URL=https://your-frontend.vercel.app

# ============================================================
# REQUIRED - Local Development
# ============================================================
VAULT_PATH=/Users/yourname/Documents/Obsidian Vault

# ============================================================
# OPTIONAL - Email Integration
# ============================================================
GMAIL_CLIENT_ID=your_gmail_client_id
GMAIL_CLIENT_SECRET=your_gmail_client_secret
GMAIL_REFRESH_TOKEN=your_gmail_refresh_token

OUTLOOK_CLIENT_ID=your_outlook_client_id
OUTLOOK_CLIENT_SECRET=your_outlook_client_secret

# ============================================================
# OPTIONAL - External Services
# ============================================================
ELEVENLABS_API_KEY=your_elevenlabs_key
PDL_API_KEY=your_pdl_key
GOOGLE_API_KEY=your_google_api_key
OPENWEATHER_API_KEY=your_weather_key

# ============================================================
# OPTIONAL - Configuration
# ============================================================
PORT=3001
NODE_ENV=development
```

### 1.4 Configuration Consolidation

**Problem**: Hardcoded values throughout services (e.g., excluded event titles).

**Create `/config/event-filters.js`**:
```javascript
/**
 * Event Filtering Configuration
 * Centralized configuration for event exclusion and validation rules
 */

module.exports = {
  // Events with these exact titles will be excluded from briefings
  excludedTitles: [
    'Peloton 🚴',
    'Kasper ➡️ Bus',
    'Busy',
    'OOO',
    'Out of Office'
  ],

  // Events with these keywords will be excluded
  excludedKeywords: [
    'canceled',
    'cancelled',
    'declined'
  ],

  // Minimum event duration in minutes (exclude very short events)
  minDurationMinutes: 5,

  // Maximum events per day in briefing
  maxEventsPerDay: 50
};
```

**Update `/jobs/generate-briefings.js`** to use config:
```javascript
const eventFilters = require('../config/event-filters');

// Replace hardcoded line 81:
const excludedTitles = ['Peloton 🚴', 'Kasper ➡️ Bus', 'Busy'];

// With:
const excludedTitles = eventFilters.excludedTitles;
```

---

## Phase 2: Data Consistency (Days 4-7)

**Goal**: Eliminate dual storage paths causing data to appear/disappear.

### 2.1 Commit to Phase 2 Storage Model

**Problem**: Calendar routes check both JSONB and normalized tables, creating confusion.

**Action**: Remove all Phase 1 fallback logic from `/routes/calendar.js`.

**Current Dual Logic** (lines 119-189):
```javascript
// Try to load events from Phase 2 events table first (event_ids)
if (briefData?.event_ids && briefData.event_ids.length > 0) {
  // NEW WAY: Query events table
  const { data: events } = await supabase
    .from('events')
    .select('*')
    .in('id', briefData.event_ids);
  // ...
} else {
  // Fallback: Load from old JSONB structure (transition period)
  if (briefData?.calendar_events) {
    eventsByDate[dateStr] = briefData.calendar_events;
  }
}
```

**Simplified Phase 2 Only**:
```javascript
// Phase 2 ONLY: Load events from events table
if (!briefData?.event_ids || briefData.event_ids.length === 0) {
  eventsByDate[dateStr] = [];
  console.log(`    ℹ️  No events scheduled for ${dateStr}`);
  continue;
}

const { data: events, error: eventsError } = await supabase
  .from('events')
  .select(`
    *,
    projects (name, project_color, context)
  `)
  .in('id', briefData.event_ids)
  .order('start_time', { ascending: true });

if (eventsError) {
  console.error(`    ❌ Error loading events:`, eventsError.message);
  eventsByDate[dateStr] = [];
  continue;
}

eventsByDate[dateStr] = events.map(mapEventToFrontendFormat);
```

**Remove from Schema**:
```sql
-- Mark as deprecated (don't delete yet in case rollback needed)
COMMENT ON COLUMN daily_briefs.calendar_events IS 'DEPRECATED - Use event_ids instead';
```

### 2.2 Migration Tracking System

**Problem**: No way to know which migrations have run.

**Create Migration** `/migrations/migration_013_create_schema_migrations.sql`:
```sql
-- Create schema migrations tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at TIMESTAMP DEFAULT NOW(),
  applied_by TEXT DEFAULT 'system',
  rollback_script TEXT
);

-- Record all previous migrations
INSERT INTO schema_migrations (version, description, applied_at) VALUES
  ('001', 'Initial schema setup', '2025-10-01 00:00:00'),
  ('002', 'Add tasks table', '2025-10-05 00:00:00'),
  ('003', 'Add events table', '2025-10-10 00:00:00'),
  ('004', 'Add narratives table', '2025-10-10 00:00:00'),
  ('005', 'Add event_overrides table', '2025-10-15 00:00:00'),
  ('006', 'Add event_actions table', '2025-10-15 00:00:00'),
  ('007', 'Add daily_briefs.event_ids column', '2025-10-20 00:00:00'),
  ('008', 'Backfill event_ids from calendar_events', '2025-10-20 00:00:00'),
  ('009', 'Add task constraints', '2025-10-25 00:00:00'),
  ('010', 'Add event deduplication indexes', '2025-10-28 00:00:00'),
  ('011', 'Add contact enrichment columns', '2025-10-29 00:00:00'),
  ('012', 'Add title constraint to events', '2025-10-30 00:00:00')
ON CONFLICT (version) DO NOTHING;
```

**Add to `/health` Endpoint**:
```javascript
app.get('/health', async (req, res) => {
  // ... existing checks ...

  // Add migration status
  const { data: migrations } = await supabase
    .from('schema_migrations')
    .select('version, description, applied_at')
    .order('version', { ascending: false })
    .limit(5);

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: {
      latestMigration: migrations[0]?.version,
      appliedAt: migrations[0]?.applied_at
    },
    // ... rest of health check
  });
});
```

### 2.3 Unified Duplicate Detection

**Problem**: Three different duplicate detection implementations with different logic.

**Implementations Found**:
1. `central-processor.js` (lines 492-528): 80% Levenshtein similarity
2. `data-processor.js` (lines 6-59): Synonym-based action matching
3. `unified-email-handler.js` (lines 69-97): Email ID + cache lookup

**Create** `/services/duplicate-detector-service.js`:
```javascript
/**
 * Unified Duplicate Detection Service
 * Single source of truth for detecting duplicate tasks/events/narratives
 */

const levenshtein = require('fast-levenshtein');
const { supabase } = require('../db/supabase-client');

// Action synonyms for semantic matching
const ACTION_SYNONYMS = {
  'setup': ['set up', 'configure', 'establish', 'initialize'],
  'complete': ['finish', 'finalize', 'wrap up'],
  'review': ['check', 'examine', 'look at', 'assess'],
  'create': ['make', 'build', 'develop', 'generate'],
  'update': ['modify', 'change', 'edit', 'revise']
};

class DuplicateDetector {
  constructor(config = {}) {
    this.similarityThreshold = config.similarityThreshold || 0.80; // 80% default
    this.enableSynonymMatching = config.enableSynonymMatching !== false;
    this.cache = new Map(); // In-memory cache for recent checks
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Check if a task/event/narrative is a duplicate
   * @param {Object} item - The item to check (must have 'title' or 'description')
   * @param {String} entityType - 'task', 'event', or 'narrative'
   * @param {Object} options - Additional filtering options
   * @returns {Object} { isDuplicate: boolean, matchedItem: object|null }
   */
  async checkDuplicate(item, entityType, options = {}) {
    const cacheKey = this._getCacheKey(item, entityType);

    // Check cache first
    const cached = this._getFromCache(cacheKey);
    if (cached !== null) {
      return cached;
    }

    // Query existing items from database
    const existingItems = await this._fetchExistingItems(entityType, options);

    // Find matches
    for (const existingItem of existingItems) {
      const similarity = this._calculateSimilarity(item, existingItem);

      if (similarity >= this.similarityThreshold) {
        const result = { isDuplicate: true, matchedItem: existingItem, similarity };
        this._saveToCache(cacheKey, result);
        return result;
      }
    }

    const result = { isDuplicate: false, matchedItem: null };
    this._saveToCache(cacheKey, result);
    return result;
  }

  /**
   * Calculate similarity between two items
   */
  _calculateSimilarity(item1, item2) {
    const text1 = this._extractText(item1).toLowerCase();
    const text2 = this._extractText(item2).toLowerCase();

    // Exact match
    if (text1 === text2) return 1.0;

    // Levenshtein distance similarity
    const distance = levenshtein.get(text1, text2);
    const maxLength = Math.max(text1.length, text2.length);
    let similarity = 1 - (distance / maxLength);

    // Boost similarity if action synonyms match
    if (this.enableSynonymMatching && this._hasSynonymMatch(text1, text2)) {
      similarity = Math.min(1.0, similarity + 0.15); // Boost by 15%
    }

    return similarity;
  }

  /**
   * Check if two texts have synonym matches
   */
  _hasSynonymMatch(text1, text2) {
    for (const [action, synonyms] of Object.entries(ACTION_SYNONYMS)) {
      const hasInText1 = [action, ...synonyms].some(word => text1.includes(word));
      const hasInText2 = [action, ...synonyms].some(word => text2.includes(word));
      if (hasInText1 && hasInText2) return true;
    }
    return false;
  }

  /**
   * Extract searchable text from item
   */
  _extractText(item) {
    return item.title || item.summary || item.description || '';
  }

  /**
   * Fetch existing items from database
   */
  async _fetchExistingItems(entityType, options = {}) {
    const table = entityType + 's'; // tasks, events, narratives
    const timeWindow = options.timeWindow || 7; // days
    const cutoffDate = new Date(Date.now() - timeWindow * 24 * 60 * 60 * 1000);

    const { data, error } = await supabase
      .from(table)
      .select('*')
      .gte('created_at', cutoffDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error(`Error fetching ${entityType}s for duplicate check:`, error);
      return [];
    }

    return data || [];
  }

  /**
   * Cache management
   */
  _getCacheKey(item, entityType) {
    const text = this._extractText(item);
    return `${entityType}:${text.substring(0, 50)}`;
  }

  _getFromCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > this.cacheExpiry) {
      this.cache.delete(key);
      return null;
    }
    return cached.value;
  }

  _saveToCache(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });

    // Cleanup old cache entries (keep max 1000)
    if (this.cache.size > 1000) {
      const oldestKeys = Array.from(this.cache.keys()).slice(0, 100);
      oldestKeys.forEach(k => this.cache.delete(k));
    }
  }
}

// Export singleton instance
module.exports = new DuplicateDetector();
```

**Update Existing Services** to use unified detector:

`central-processor.js`:
```javascript
// OLD (lines 492-528): Remove duplicate detection logic
// NEW: Use unified detector
const duplicateDetector = require('./duplicate-detector-service');

const duplicateCheck = await duplicateDetector.checkDuplicate(
  task,
  'task',
  { timeWindow: 7 }
);

if (duplicateCheck.isDuplicate) {
  console.log(`Duplicate task detected, skipping`);
  continue;
}
```

---

## Phase 3: Error Visibility (Days 8-10)

**Goal**: Stop silent failures - surface all errors.

### 3.1 Logging Infrastructure with Winston

**Problem**: 300+ console.log statements with no structure or levels.

**Install Winston** (if not already):
```bash
npm install winston winston-daily-rotate-file
```

**Create** `/config/logger.js`:
```javascript
const winston = require('winston');
const path = require('path');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(colors);

// Format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    return `${info.timestamp} [${info.level}]: ${info.message}`;
  })
);

// Format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Determine log level based on environment
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : 'info';
};

// Create transports
const transports = [
  // Console output
  new winston.transports.Console({
    format: consoleFormat,
  }),
];

// File output only in production
if (process.env.NODE_ENV === 'production') {
  transports.push(
    // Error logs
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: fileFormat,
    }),
    // All logs
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: fileFormat,
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: level(),
  levels,
  transports,
  exitOnError: false,
});

module.exports = logger;
```

**Migration Strategy** - Replace console.log gradually:

Priority 1: Error handling
```javascript
// OLD
console.error('❌ Error fetching events:', error);

// NEW
logger.error('Error fetching events', { error: error.message, stack: error.stack });
```

Priority 2: Job logging
```javascript
// OLD
console.log('🔄 Email scanning job starting...');

// NEW
logger.info('Email scanning job starting');
```

Priority 3: Debug logging
```javascript
// OLD
console.log('DEBUG: briefData found:', briefData);

// NEW
logger.debug('Brief data found', { briefData });
```

### 3.2 Enhanced Health Endpoint

**Problem**: `/health` only returns basic status, doesn't check dependencies.

**Create** `/routes/health.js`:
```javascript
const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase-client');
const logger = require('../config/logger');

/**
 * Health check endpoint with dependency verification
 */
router.get('/', async (req, res) => {
  const checks = {};
  let overallStatus = 'healthy';

  // Check 1: Database connectivity
  try {
    const { data, error } = await supabase
      .from('schema_migrations')
      .select('version')
      .limit(1);

    if (error) throw error;

    checks.database = {
      status: 'ok',
      latestMigration: data[0]?.version
    };
  } catch (error) {
    checks.database = {
      status: 'error',
      message: error.message
    };
    overallStatus = 'unhealthy';
  }

  // Check 2: Gmail credentials (if configured)
  if (process.env.GMAIL_CLIENT_ID) {
    checks.gmail = {
      status: process.env.GMAIL_REFRESH_TOKEN ? 'configured' : 'incomplete',
      message: process.env.GMAIL_REFRESH_TOKEN ? null : 'Missing refresh token'
    };
    if (checks.gmail.status === 'incomplete') {
      overallStatus = 'degraded';
    }
  } else {
    checks.gmail = { status: 'not_configured' };
  }

  // Check 3: Anthropic API
  checks.anthropic = {
    status: process.env.ANTHROPIC_API_KEY ? 'configured' : 'missing',
  };
  if (!process.env.ANTHROPIC_API_KEY) {
    overallStatus = 'unhealthy';
  }

  // Check 4: Email scanning job status
  try {
    const { data: lastRun } = await supabase
      .from('job_runs')
      .select('*')
      .eq('job_name', 'email_scanning')
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    if (lastRun) {
      const lastRunTime = new Date(lastRun.started_at);
      const now = new Date();
      const minutesSinceRun = (now - lastRunTime) / (1000 * 60);

      checks.emailScanning = {
        status: lastRun.status,
        lastRun: lastRun.started_at,
        minutesSinceRun: Math.floor(minutesSinceRun),
        lastError: lastRun.error
      };

      // Email scanning should run every 30 minutes
      if (minutesSinceRun > 45) {
        checks.emailScanning.status = 'overdue';
        overallStatus = 'degraded';
      }
    } else {
      checks.emailScanning = { status: 'never_run' };
    }
  } catch (error) {
    checks.emailScanning = { status: 'unknown', error: error.message };
  }

  // Check 5: Briefing generation status
  try {
    const { data: lastBriefing } = await supabase
      .from('daily_briefs')
      .select('created_at, date')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (lastBriefing) {
      checks.briefingGeneration = {
        status: 'ok',
        lastGenerated: lastBriefing.created_at,
        forDate: lastBriefing.date
      };
    } else {
      checks.briefingGeneration = { status: 'no_data' };
    }
  } catch (error) {
    checks.briefingGeneration = { status: 'error', message: error.message };
  }

  res.status(overallStatus === 'unhealthy' ? 503 : 200).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    architecture: 'phase-2-three-entity',
    checks
  });
});

module.exports = router;
```

**Update** `server-railway.js` to use new health endpoint:
```javascript
const healthRoutes = require('./routes/health');
app.use('/health', healthRoutes);
```

### 3.3 Job Monitoring & Status Tracking

**Problem**: No visibility into scheduled job execution.

**Create Migration** `/migrations/migration_014_job_runs_table.sql`:
```sql
-- Track all scheduled job executions
CREATE TABLE IF NOT EXISTS job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  result JSONB,
  error TEXT,
  duration_ms INTEGER,
  CONSTRAINT job_runs_duration_positive CHECK (duration_ms >= 0)
);

CREATE INDEX idx_job_runs_job_name ON job_runs(job_name);
CREATE INDEX idx_job_runs_started_at ON job_runs(started_at DESC);
CREATE INDEX idx_job_runs_status ON job_runs(status);
```

**Create** `/services/job-tracker.js`:
```javascript
const { supabase } = require('../db/supabase-client');
const logger = require('../config/logger');

class JobTracker {
  /**
   * Start tracking a job run
   */
  async startJob(jobName) {
    const { data, error } = await supabase
      .from('job_runs')
      .insert({
        job_name: jobName,
        status: 'running',
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to start job tracking', { jobName, error: error.message });
      return null;
    }

    return data.id;
  }

  /**
   * Mark job as completed
   */
  async completeJob(jobId, result = {}) {
    const startTime = await this._getStartTime(jobId);
    const duration = startTime ? Date.now() - startTime : null;

    const { error } = await supabase
      .from('job_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        result,
        duration_ms: duration
      })
      .eq('id', jobId);

    if (error) {
      logger.error('Failed to complete job tracking', { jobId, error: error.message });
    }
  }

  /**
   * Mark job as failed
   */
  async failJob(jobId, error) {
    const startTime = await this._getStartTime(jobId);
    const duration = startTime ? Date.now() - startTime : null;

    const { error: updateError } = await supabase
      .from('job_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error: error.message || String(error),
        duration_ms: duration
      })
      .eq('id', jobId);

    if (updateError) {
      logger.error('Failed to mark job as failed', { jobId, error: updateError.message });
    }
  }

  /**
   * Get job start time for duration calculation
   */
  async _getStartTime(jobId) {
    const { data } = await supabase
      .from('job_runs')
      .select('started_at')
      .eq('id', jobId)
      .single();

    return data ? new Date(data.started_at).getTime() : null;
  }
}

module.exports = new JobTracker();
```

**Update Jobs** to use tracker:

`/jobs/email-scanning-job.js`:
```javascript
const jobTracker = require('../services/job-tracker');
const logger = require('../config/logger');

async function runEmailScanning() {
  if (isRunning) {
    logger.warn('Email scanning already in progress, skipping');
    return { success: false, message: 'Already running' };
  }

  isRunning = true;
  const jobId = await jobTracker.startJob('email_scanning');

  logger.info('Email scanning job starting', { jobId });

  try {
    // ... existing email scanning logic ...

    await jobTracker.completeJob(jobId, {
      gmail: results.gmail,
      outlook: results.outlook
    });

    logger.info('Email scanning completed', {
      jobId,
      processed: results.gmail.processed
    });

    return { success: true, results };

  } catch (error) {
    logger.error('Email scanning failed', { jobId, error: error.message });
    await jobTracker.failJob(jobId, error);

    return {
      success: false,
      error: error.message
    };
  } finally {
    isRunning = false;
  }
}
```

**Create Admin Endpoint** `/routes/admin.js`:
```javascript
const express = require('express');
const router = express.Router();
const { supabase } = require('../db/supabase-client');

/**
 * GET /api/admin/jobs/status
 * View status of all scheduled jobs
 */
router.get('/jobs/status', async (req, res) => {
  try {
    // Get latest run for each job
    const { data: jobs } = await supabase
      .rpc('get_latest_job_runs');

    res.json({
      success: true,
      jobs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/admin/jobs/:jobName/history
 * View execution history for a specific job
 */
router.get('/jobs/:jobName/history', async (req, res) => {
  try {
    const { jobName } = req.params;
    const limit = parseInt(req.query.limit) || 20;

    const { data: history } = await supabase
      .from('job_runs')
      .select('*')
      .eq('job_name', jobName)
      .order('started_at', { ascending: false })
      .limit(limit);

    res.json({
      success: true,
      jobName,
      history
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
```

---

## Phase 4: Code Quality (Days 11-13)

**Goal**: Simplify complex files, reduce cognitive load.

### 4.1 Split Large Services

**Problem**: `quality-control-service.js` is 1,115 lines with 30+ methods.

**New Structure**:
```
/services/quality-control/
  ├── qc-coordinator.js          (main entry point, 100 lines)
  ├── validators/
  │   ├── task-validator.js      (task-specific checks)
  │   ├── event-validator.js     (event-specific checks)
  │   └── narrative-validator.js (narrative-specific checks)
  ├── detectors/
  │   ├── title-detector.js      (title quality checks)
  │   ├── date-detector.js       (date/time validation)
  │   └── content-detector.js    (content quality checks)
  └── reporter.js                (generate QC reports)
```

**Create** `/services/quality-control/qc-coordinator.js`:
```javascript
/**
 * Quality Control Coordinator
 * Orchestrates QC checks across all entity types
 */

const TaskValidator = require('./validators/task-validator');
const EventValidator = require('./validators/event-validator');
const NarrativeValidator = require('./validators/narrative-validator');
const Reporter = require('./reporter');
const logger = require('../../config/logger');

class QCCoordinator {
  constructor() {
    this.taskValidator = new TaskValidator();
    this.eventValidator = new EventValidator();
    this.narrativeValidator = new NarrativeValidator();
    this.reporter = new Reporter();
  }

  /**
   * Run complete QC sweep across all entities
   */
  async runQualityControl() {
    logger.info('Quality control sweep starting');
    const startTime = Date.now();

    const results = {
      tasks: await this.taskValidator.validate(),
      events: await this.eventValidator.validate(),
      narratives: await this.narrativeValidator.validate()
    };

    const report = this.reporter.generateReport(results);
    const duration = Date.now() - startTime;

    logger.info('Quality control sweep completed', {
      duration,
      totalIssues: report.totalIssues
    });

    return report;
  }

  /**
   * Run QC for specific entity type
   */
  async runQualityControlFor(entityType) {
    switch (entityType) {
      case 'task':
        return await this.taskValidator.validate();
      case 'event':
        return await this.eventValidator.validate();
      case 'narrative':
        return await this.narrativeValidator.validate();
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  }
}

module.exports = QCCoordinator;
```

### 4.2 Simplify Complex Logic

**Problem**: Duplicate validation logic in generate-briefings.js (lines 81-107 and 221-232).

**Refactor** - Extract to shared function:

`/jobs/generate-briefings.js`:
```javascript
const eventFilters = require('../config/event-filters');

/**
 * Validate event has required fields
 */
function isValidEvent(event) {
  const title = event.summary || event.subject || '';

  // Must have non-empty title
  if (!title || title.trim() === '' || title === 'No Title') {
    return false;
  }

  // Must not be in excluded list
  if (eventFilters.excludedTitles.includes(title.trim())) {
    return false;
  }

  // Must have valid start time
  const hasValidStartTime = event.start?.dateTime || event.start?.date;
  if (!hasValidStartTime) {
    return false;
  }

  return true;
}

// Use in filtering (replaces lines 81-107 and 221-232)
let dayEvents = allEvents.filter(isValidEvent);
```

### 4.3 Add JSDoc Documentation

**Problem**: Many functions lack documentation explaining parameters and return values.

**Standard** - Add JSDoc to all public functions:

```javascript
/**
 * Process incoming email and extract tasks/events/narratives
 *
 * @param {Object} email - Email object from Gmail or Outlook
 * @param {string} email.id - Unique email identifier
 * @param {string} email.subject - Email subject line
 * @param {string} email.body - Email body content (plain text or HTML)
 * @param {string} email.from - Sender email address
 * @param {Date} email.receivedDate - When email was received
 * @param {string} source - Email provider ('gmail' or 'outlook')
 *
 * @returns {Promise<Object>} Processing result
 * @returns {boolean} result.success - Whether processing succeeded
 * @returns {boolean} result.skipped - Whether email was skipped (duplicate, etc)
 * @returns {Object} result.entities - Created entities
 * @returns {Array} result.entities.tasks - Tasks extracted from email
 * @returns {Array} result.entities.events - Events extracted from email
 * @returns {Array} result.entities.narratives - Narratives created
 *
 * @throws {Error} If email object is invalid or database write fails
 *
 * @example
 * const result = await processEmail({
 *   id: 'abc123',
 *   subject: 'Meeting tomorrow',
 *   body: 'Let\'s meet at 2pm to discuss the project',
 *   from: 'colleague@example.com',
 *   receivedDate: new Date()
 * }, 'gmail');
 */
async function processEmail(email, source) {
  // ... implementation ...
}
```

---

## Phase 5: Railway & Deployment (Day 14)

**Goal**: Make deployments predictable and debuggable.

### 5.1 Deployment Documentation

**Create** `DEPLOYMENT.md`:
```markdown
# Deployment Guide

## Local Development Setup

### Prerequisites
- Node.js 18+
- PostgreSQL (via Supabase)
- Obsidian vault (for local file watching)

### Setup Steps
1. Clone repository
   \`\`\`bash
   git clone https://github.com/tomsuharto-git/playbook.git
   cd playbook/backend
   \`\`\`

2. Install dependencies
   \`\`\`bash
   npm install
   \`\`\`

3. Configure environment
   \`\`\`bash
   cp .env.example .env
   # Edit .env with your credentials
   \`\`\`

4. Run migrations
   \`\`\`bash
   npm run migrate
   \`\`\`

5. Start server
   \`\`\`bash
   npm run dev  # Uses server-phase2.js with vault watcher
   \`\`\`

## Railway Production Deployment

### Automatic Deployment (GitHub)

Railway automatically deploys when you push to `main` branch:

1. Make changes locally
2. Commit and push to GitHub
   \`\`\`bash
   git add .
   git commit -m "Your changes"
   git push origin main
   \`\`\`
3. Railway detects push and deploys automatically
4. Deployment takes 2-3 minutes

### Manual Deployment (Railway CLI)

If you need to manually deploy:

\`\`\`bash
railway up
\`\`\`

**⚠️ WARNING**: This uploads local files including node_modules (10K+ files). Prefer GitHub auto-deploy.

### Verifying Deployment

After deployment completes:

1. Check health endpoint
   \`\`\`bash
   curl https://playbook-backend-production.up.railway.app/health
   \`\`\`

2. Run verification script
   \`\`\`bash
   node scripts/deployment/verify-deployment.js
   \`\`\`

3. Check for email scan endpoint
   \`\`\`bash
   curl -X POST https://playbook-backend-production.up.railway.app/api/email/scan
   \`\`\`
   Should NOT return 404

### Common Deployment Issues

#### Issue: Old Code Deployed (Endpoints Return 404)

**Symptom**: Railway redeploys but endpoints return 404 or old behavior

**Cause**: Build cache not cleared, using cached layers

**Fix**:
1. Go to Railway dashboard
2. Click on service → Deployments
3. Click "Redeploy" on latest deployment
4. If that doesn't work, clear build cache:
   - Settings → General → "Clear Build Cache"
   - Then redeploy

#### Issue: Server Won't Start

**Symptom**: Deployment succeeds but server doesn't respond

**Cause**: Missing environment variables or database connection

**Fix**:
1. Check Railway logs: `railway logs`
2. Verify all required env vars are set:
   - `ANTHROPIC_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   - `DATABASE_URL`
   - `FRONTEND_URL`
3. Check health endpoint shows database error

#### Issue: Email Scanning Not Working

**Symptom**: Email scanning job scheduled but no emails processed

**Cause**: Missing Gmail credentials

**Fix**:
1. Check Railway environment variables for:
   - `GMAIL_CLIENT_ID`
   - `GMAIL_CLIENT_SECRET`
   - `GMAIL_REFRESH_TOKEN`
2. If missing, email scanning will be scheduled but fail silently
3. Check `/health` endpoint → `checks.gmail.status`

### Railway Configuration

**Root Directory**: `/` (empty)
**Watch Paths**: (empty) - deploy all files
**Build Command**: Auto-detected (Nixpacks)
**Start Command**: `node server-railway.js`

### Environment Variables (Production)

Required in Railway dashboard:
- `ANTHROPIC_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `DATABASE_URL`
- `FRONTEND_URL` (for CORS)

Optional:
- `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`
- `OUTLOOK_CLIENT_ID`, `OUTLOOK_CLIENT_SECRET`
- `ELEVENLABS_API_KEY`
- `PDL_API_KEY`

## Rollback Procedure

If deployment breaks production:

1. Find last working commit
   \`\`\`bash
   git log --oneline
   \`\`\`

2. In Railway dashboard:
   - Go to Deployments tab
   - Find previous working deployment
   - Click "Redeploy"

3. Or rollback locally:
   \`\`\`bash
   git revert HEAD
   git push origin main
   \`\`\`

## Monitoring

After deployment:
- Check `/health` endpoint every 5 minutes
- Monitor error logs: `railway logs | grep ERROR`
- Check job execution: `/api/admin/jobs/status`
```

### 5.2 Deployment Verification Script

**Update** `/scripts/deployment/verify-deployment.js`:
```javascript
#!/usr/bin/env node

/**
 * Verify Railway deployment is working correctly
 * Run after every deployment to catch issues early
 */

const https = require('https');
const logger = require('../../config/logger');

const RAILWAY_URL = 'https://playbook-backend-production.up.railway.app';

// Tests to run
const TESTS = [
  {
    name: 'Health endpoint',
    path: '/health',
    method: 'GET',
    expectedStatus: 200,
    validate: (data) => data.status === 'healthy' || data.status === 'degraded'
  },
  {
    name: 'Email scan endpoint exists',
    path: '/api/email/scan',
    method: 'POST',
    expectedStatus: [200, 400, 401], // OK, Bad Request, or Unauthorized (but NOT 404)
    validate: () => true
  },
  {
    name: 'Calendar routes loaded',
    path: '/api/calendar/brief?days=1',
    method: 'GET',
    expectedStatus: 200,
    validate: (data) => data.success !== undefined
  },
  {
    name: 'Admin routes loaded',
    path: '/api/admin/jobs/status',
    method: 'GET',
    expectedStatus: 200,
    validate: (data) => data.success !== undefined
  }
];

// Run all tests
async function verifyDeployment() {
  logger.info('🔍 Starting deployment verification...\n');

  let passed = 0;
  let failed = 0;

  for (const test of TESTS) {
    try {
      const result = await runTest(test);
      if (result.success) {
        logger.info(`✅ ${test.name}: PASSED`);
        passed++;
      } else {
        logger.error(`❌ ${test.name}: FAILED - ${result.error}`);
        failed++;
      }
    } catch (error) {
      logger.error(`❌ ${test.name}: ERROR - ${error.message}`);
      failed++;
    }
  }

  logger.info(`\n📊 Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    logger.error('\n⚠️  DEPLOYMENT VERIFICATION FAILED');
    logger.error('Some endpoints are not working correctly.');
    logger.error('Check Railway logs for details: railway logs');
    process.exit(1);
  } else {
    logger.info('\n✅ DEPLOYMENT VERIFIED SUCCESSFULLY');
    logger.info('All critical endpoints are working.');
    process.exit(0);
  }
}

// Run individual test
async function runTest(test) {
  return new Promise((resolve) => {
    const options = {
      hostname: RAILWAY_URL.replace('https://', ''),
      path: test.path,
      method: test.method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        // Check status code
        const expectedStatuses = Array.isArray(test.expectedStatus)
          ? test.expectedStatus
          : [test.expectedStatus];

        if (!expectedStatuses.includes(res.statusCode)) {
          return resolve({
            success: false,
            error: `Expected status ${test.expectedStatus}, got ${res.statusCode}`
          });
        }

        // Parse and validate response
        try {
          const parsed = JSON.parse(data);
          if (test.validate && !test.validate(parsed)) {
            return resolve({
              success: false,
              error: 'Response validation failed'
            });
          }
        } catch (e) {
          // Not JSON, that's OK for some endpoints
        }

        resolve({ success: true });
      });
    });

    req.on('error', (error) => {
      resolve({
        success: false,
        error: error.message
      });
    });

    req.end();
  });
}

// Run verification
verifyDeployment();
```

### 5.3 Railway Webhook Configuration

**Create** `.github/workflows/deploy-notify.yml`:
```yaml
name: Railway Deployment Notification

on:
  push:
    branches:
      - main

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Wait for Railway deployment
        run: sleep 180  # Wait 3 minutes for Railway to deploy

      - name: Verify deployment
        run: |
          curl -f https://playbook-backend-production.up.railway.app/health || exit 1
          echo "✅ Deployment verified"
```

---

## Phase 6: Testing & Validation (Day 14 Afternoon)

**Goal**: Verify everything still works after refactoring.

### 6.1 Critical Path Testing Checklist

```markdown
## Manual Testing Checklist

### Email Scanning
- [ ] Email scanning job runs on schedule (check logs)
- [ ] Manual trigger works: `curl -X POST .../api/email/scan`
- [ ] Emails are processed and tasks created
- [ ] Duplicate emails are detected and skipped
- [ ] Failed scans are logged with errors

### Calendar Briefing
- [ ] Briefing generation runs 3x daily (6am, 12pm, 6pm ET)
- [ ] Briefings fetch events from events table (not JSONB)
- [ ] Event overrides are applied correctly
- [ ] Excluded events are filtered out
- [ ] Frontend can fetch briefings via `/api/calendar/brief`

### Task Management
- [ ] Tasks are created from emails
- [ ] Duplicate tasks are detected
- [ ] Tasks have proper titles and descriptions
- [ ] Tasks are linked to correct projects

### Health Monitoring
- [ ] `/health` endpoint shows all checks
- [ ] Database status is accurate
- [ ] Gmail status reflects credential state
- [ ] Job execution times are tracked
- [ ] Degraded state shows when appropriate

### Admin Endpoints
- [ ] `/api/admin/jobs/status` shows all jobs
- [ ] Job history is accessible
- [ ] Error logs are visible

### Deployment
- [ ] GitHub push triggers Railway deployment
- [ ] Deployment completes in < 5 minutes
- [ ] No endpoints return 404
- [ ] Logs show correct server started
```

### 6.2 Error Scenario Testing

```bash
# Test 1: Missing Gmail credentials
# Remove GMAIL_REFRESH_TOKEN from Railway
# Expected: Email scanning scheduled but fails gracefully
# Health endpoint shows gmail.status = "incomplete"

# Test 2: Database connection failure
# Invalid SUPABASE_KEY
# Expected: Server starts but health shows database error
# All endpoints return 503

# Test 3: Rate limit
# Make 100 requests to Anthropic API rapidly
# Expected: Errors logged, requests retried with backoff

# Test 4: Invalid email format
# Send malformed email to processor
# Expected: Error logged, email skipped, processing continues
```

---

## Success Metrics

At the end of this refactor, measure success by:

1. **Root Directory**: <10 files (vs 73+ currently)
2. **Single Duplicate Detection**: One system used everywhere (vs 3+)
3. **Single Storage Model**: Phase 2 tables only (no JSONB fallbacks)
4. **Error Visibility**: All errors visible in logs (zero silent failures)
5. **Health Monitoring**: `/health` endpoint shows all system components
6. **Deployment Verification**: Automated script passes every time
7. **Documentation**: Clear docs for all servers, configs, and deployments
8. **Code Complexity**: No files over 400 lines
9. **Test Coverage**: All critical paths have manual test procedures
10. **Deployment Confidence**: Can deploy without worrying about old code

---

## Timeline Summary

| Phase | Days | Focus | Deliverables |
|-------|------|-------|--------------|
| 1 | 1-3 | Foundation | Root cleanup, server docs, env docs, config consolidation |
| 2 | 4-7 | Data consistency | Phase 2 commitment, migration tracking, unified duplicates |
| 3 | 8-10 | Error visibility | Winston logging, health endpoint, job monitoring |
| 4 | 11-13 | Code quality | Split services, simplify logic, JSDoc |
| 5 | 14 morning | Deployment | Deploy docs, verification script, Railway config |
| 6 | 14 afternoon | Testing | Manual tests, error scenarios, validation |

**Total: 14 days (2 weeks)**

---

## Rollback Plan

If major issues arise:

### Phase 1-3 Rollback
- Keep all deprecated files with `.deprecated` suffix
- Don't delete old code, just rename it
- Can quickly restore by removing `.deprecated` suffix

### Phase 2 Data Rollback
- Migration scripts include rollback SQL
- Phase 1 JSONB data preserved (not deleted)
- Can revert calendar routes to use JSONB fallback

### Phase 5 Deployment Rollback
- Railway keeps deployment history
- Can redeploy any previous deployment via dashboard
- Git history allows reverting commits

---

## Post-Refactor Maintenance

After completing this refactor:

1. **Code Freeze Rules**:
   - No more utility scripts at root (use `/scripts` folders)
   - All new services must be under 400 lines
   - All public functions must have JSDoc
   - All errors must use logger (no console.log)

2. **Deployment Checklist**:
   - Run `verify-deployment.js` after every deploy
   - Check `/health` endpoint shows green
   - Monitor error logs for first 30 minutes
   - Check scheduled jobs are running

3. **Weekly Review**:
   - Check `/api/admin/jobs/status` for failed jobs
   - Review error logs for patterns
   - Monitor database size and performance
   - Validate backup system

---

## Questions & Clarifications

Before starting implementation, confirm:

1. **Data Migration**: OK to drop Phase 1 JSONB fallback code completely?
2. **Email Scanning**: Are Gmail credentials available for Railway?
3. **Downtime**: Can we take Railway offline for 30 minutes during Phase 2?
4. **Testing**: Do you have test emails/data for validation?
5. **Backup**: Is Supabase automatic backup enabled?

---

**Document Version**: 1.0
**Created By**: Claude Code
**Next Review**: After Phase 2 completion
