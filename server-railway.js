#!/usr/bin/env node

/**
 * Railway Production Server - Phase 2 Architecture
 * Minimal server without local vault dependencies
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');

// Import Phase 2 services (these don't require vault)
const centralProcessor = require('./services/central-processor');
const unifiedEmailHandler = require('./services/unified-email-handler');

// Email scanners are not available in this minimal build

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
// Fix CORS by ensuring FRONTEND_URL has https:// prefix
const frontendUrl = process.env.FRONTEND_URL
  ? (process.env.FRONTEND_URL.startsWith('http')
      ? process.env.FRONTEND_URL
      : `https://${process.env.FRONTEND_URL}`)
  : 'http://localhost:3000';

app.use(cors({
  origin: frontendUrl,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

console.log(`✅ CORS configured for: ${frontendUrl}`);

// ============================================================
// STARTUP
// ============================================================
console.log('\n' + '='.repeat(60));
console.log('🚀 RAILWAY PRODUCTION SERVER - PHASE 2');
console.log('='.repeat(60));
console.log(`
Architecture: Three-Entity Model
- Central Processor: ✓
- Unified Email Handler: ✓
- Entities: Tasks, Events, Narratives
- Environment: ${process.env.NODE_ENV || 'production'}
- No Vault Watcher (cloud environment)
`);

// ============================================================
// API ROUTES
// ============================================================

// Import existing API routes - Railway has files at ai-task-manager/backend/
// Load routes that exist, but don't fail if they don't
try {
  const calendarRoutes = require('./routes/calendar');
  app.use('/api/calendar', calendarRoutes);
  console.log('✅ Calendar routes loaded at /api/calendar');
} catch (e) {
  console.log('⚠️  Calendar routes not available');
}

try {
  const projectsRoutes = require('./routes/projects');
  app.use('/api/projects', projectsRoutes);
  console.log('✅ Projects routes loaded');
} catch (e) {
  console.log('⚠️  Projects routes not available');
}

try {
  const eventsRoutes = require('./routes/events');
  app.use('/api/events', eventsRoutes);
  console.log('✅ Events routes loaded');
} catch (e) {
  console.log('⚠️  Events routes not available');
}

try {
  const podcastRoutes = require('./routes/podcast');
  app.use('/api/podcast', podcastRoutes);
  console.log('✅ Podcast routes loaded');
} catch (e) {
  console.log('⚠️  Podcast routes not available');
}

try {
  const weatherRoutes = require('./routes/weather');
  app.use('/api/weather', weatherRoutes);
  console.log('✅ Weather routes loaded');
} catch (e) {
  console.log('⚠️  Weather routes not available');
}

try {
  const adminRoutes = require('./routes/admin');
  app.use('/api/admin', adminRoutes);
  console.log('✅ Admin routes loaded');
} catch (e) {
  console.log('⚠️  Admin routes not available');
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    architecture: 'phase-2-railway',
    environment: process.env.NODE_ENV || 'production',
    services: {
      centralProcessor: 'active',
      unifiedEmailHandler: 'active',
      gmail: process.env.GMAIL_CLIENT_ID ? 'configured' : 'not configured',
      outlook: process.env.OUTLOOK_CLIENT_ID ? 'configured' : 'not configured'
    }
  });
});

// Phase 2 test endpoint
app.post('/api/phase2/test', async (req, res) => {
  try {
    const testInput = {
      source: 'email',
      email_id: 'test-' + Date.now(),
      from: 'test@example.com',
      subject: 'Phase 2 Test',
      body: req.body.content || 'This is a test of the Phase 2 architecture',
      received_date: new Date(),
      metadata: { test: true }
    };

    const results = await centralProcessor.process(testInput);

    res.json({
      success: true,
      message: 'Phase 2 processing complete',
      results: {
        tasks: results.tasks.length,
        events: results.events.length,
        narratives: results.narratives.length
      }
    });
  } catch (error) {
    console.error('Phase 2 test error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Manual processing endpoint
app.post('/api/process', async (req, res) => {
  try {
    const results = await centralProcessor.process(req.body);
    res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('Processing error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// EMAIL SCANNING
// ============================================================
// Email scanning is handled by the main server, not this minimal Railway version

// ============================================================
// ERROR HANDLING
// ============================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📛 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

// ============================================================
// SCHEDULED JOBS
// ============================================================

const { scheduleQualityControl } = require('./jobs/quality-control-job');
const { generateBriefings } = require('./jobs/generate-briefings');

// Start QC job (runs every 6 hours: midnight, 6am, noon, 6pm ET)
scheduleQualityControl();

// Schedule briefing generation (runs 3x daily: 6am, 12pm, 6pm ET)
// Cron syntax: minute hour * * *
// Uses Eastern Time timezone
cron.schedule('0 6,12,18 * * *', async () => {
  try {
    console.log('\n🔄 Scheduled briefing generation starting...');
    await generateBriefings();
    console.log('✅ Scheduled briefing generation complete\n');
  } catch (error) {
    console.error('❌ Scheduled briefing generation failed:', error.message);
  }
}, {
  timezone: 'America/New_York'
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log(`✅ RAILWAY PHASE 2 SERVER RUNNING ON PORT ${PORT}`);
  console.log('='.repeat(60));
  console.log(`
Active Services:
  🔄 Central Processor: Ready
  📊 Three-Entity Creation: Tasks, Events, Narratives
  🔍 Quality Control: Scheduled (every 6 hours)
  📅 Briefing Generation: Scheduled (6am, 12pm, 6pm ET)
  🌐 Phase 2 Test Endpoint: /api/phase2/test

URL: ${process.env.RAILWAY_STATIC_URL || 'http://localhost:' + PORT}
  `);
  console.log('='.repeat(60) + '\n');
});