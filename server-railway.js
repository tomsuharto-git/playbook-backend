#!/usr/bin/env node

/**
 * Railway Production Server - Phase 2 Architecture
 * Minimal server without local vault dependencies
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const logger = require('./utils/logger');

// Import Phase 2 services (these don't require vault)
const centralProcessor = require('./services/central-processor');
const unifiedEmailHandler = require('./services/unified-email-handler');

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

logger.info('✅ CORS configured', { frontendUrl });

// ============================================================
// STARTUP
// ============================================================
logger.info('='.repeat(60));
logger.info('🚀 RAILWAY PRODUCTION SERVER - PHASE 2');
logger.info('='.repeat(60));
logger.info('Architecture: Three-Entity Model', {
  centralProcessor: '✓',
  unifiedEmailHandler: '✓',
  entities: 'Tasks, Events, Narratives',
  environment: process.env.NODE_ENV || 'production',
  vaultWatcher: 'No Vault Watcher (cloud environment)'
});

// ============================================================
// API ROUTES
// ============================================================

// Import existing API routes - Railway has files at ai-task-manager/backend/
// Load routes that exist, but don't fail if they don't
try {
  const calendarRoutes = require('./routes/calendar');
  app.use('/api/calendar', calendarRoutes);
  logger.info('✅ Calendar routes loaded at /api/calendar');
} catch (e) {
  logger.warn('⚠️  Calendar routes not available');
}

try {
  const projectsRoutes = require('./routes/projects');
  app.use('/api/projects', projectsRoutes);
  logger.info('✅ Projects routes loaded');
} catch (e) {
  logger.warn('⚠️  Projects routes not available');
}

try {
  const eventsRoutes = require('./routes/events');
  app.use('/api/events', eventsRoutes);
  logger.info('✅ Events routes loaded');
} catch (e) {
  logger.warn('⚠️  Events routes not available');
}

try {
  const podcastRoutes = require('./routes/podcast');
  app.use('/api/podcast', podcastRoutes);
  logger.info('✅ Podcast routes loaded');
} catch (e) {
  logger.warn('⚠️  Podcast routes not available');
}

try {
  const weatherRoutes = require('./routes/weather');
  app.use('/api/weather', weatherRoutes);
  logger.info('✅ Weather routes loaded');
} catch (e) {
  logger.warn('⚠️  Weather routes not available');
}

try {
  const adminRoutes = require('./routes/admin');
  app.use('/api/admin', adminRoutes);
  logger.info('✅ Admin routes loaded');
} catch (e) {
  logger.warn('⚠️  Admin routes not available');
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
    logger.error('❌ Phase 2 test error', { error: error.message, stack: error.stack });
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
    logger.error('❌ Processing error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Manual email scan endpoint
app.post('/api/email/scan', async (req, res) => {
  try {
    logger.info('🔄 Manual email scan triggered via API');
    const { runEmailScanning } = require('./jobs/email-scanning-job');
    const results = await runEmailScanning();

    res.json({
      success: results.success,
      message: 'Email scan completed',
      results
    });
  } catch (error) {
    logger.error('❌ Manual email scan error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

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
  logger.error('❌ Server error', { error: err.message, stack: err.stack });
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('❌ Uncaught exception', { error: err.message, stack: err.stack });
});

process.on('unhandledRejection', (err) => {
  logger.error('❌ Unhandled rejection', { error: err });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.warn('📛 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

// ============================================================
// SCHEDULED JOBS
// ============================================================

const { scheduleQualityControl } = require('./jobs/quality-control-job');
const { generateBriefings } = require('./jobs/generate-briefings');
const { scheduleEmailScanning } = require('./jobs/email-scanning-job');

// Start QC job (runs every 6 hours: midnight, 6am, noon, 6pm ET)
scheduleQualityControl();

// Start email scanning (runs every 30 minutes)
scheduleEmailScanning();

// Schedule briefing generation (runs 3x daily: 6am, 12pm, 6pm ET)
// Cron syntax: minute hour * * *
// Uses Eastern Time timezone
cron.schedule('0 6,12,18 * * *', async () => {
  try {
    logger.info('🔄 Scheduled briefing generation starting...');
    await generateBriefings();
    logger.info('✅ Scheduled briefing generation complete');
  } catch (error) {
    logger.error('❌ Scheduled briefing generation failed', { error: error.message });
  }
}, {
  timezone: 'America/New_York'
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
  logger.info('='.repeat(60));
  logger.info(`✅ RAILWAY PHASE 2 SERVER RUNNING ON PORT ${PORT}`);
  logger.info('='.repeat(60));
  logger.info('Active Services', {
    centralProcessor: 'Ready',
    threeEntityCreation: 'Tasks, Events, Narratives',
    emailScanning: 'Scheduled (every 30 minutes)',
    qualityControl: 'Scheduled (every 6 hours)',
    briefingGeneration: 'Scheduled (6am, 12pm, 6pm ET)',
    phase2TestEndpoint: '/api/phase2/test',
    url: process.env.RAILWAY_STATIC_URL || 'http://localhost:' + PORT
  });
  logger.info('='.repeat(60));
});