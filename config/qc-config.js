/**
 * Quality Control Agent Configuration
 *
 * Controls QC behavior, thresholds, and safety limits
 */

module.exports = {
  // ============================================================
  // SCHEDULE
  // ============================================================
  schedule: {
    // Cron expression: Every 6 hours (midnight, 6am, noon, 6pm ET)
    cron: '0 0,6,12,18 * * *',
    timezone: 'America/New_York',

    // Enable/disable QC agent
    enabled: true,

    // Run in read-only mode (detection only, no fixes)
    readOnlyMode: false, // PHASE 2: Auto-fix enabled
  },

  // ============================================================
  // DETECTION THRESHOLDS
  // ============================================================
  thresholds: {
    // Pending Task Quality
    duplicateSimilarity: 0.90,      // 90%+ match = likely duplicate
    lowQualityScore: 0.40,          // Below 40% = low quality
    stalePendingDays: 7,            // 7+ days = stale
    completionConfidence: 0.80,     // 80%+ = likely already done

    // Event Quality
    titleMinLength: 3,              // <3 chars = probably empty
    duplicateTimeWindow: 3600,      // 1 hour (in seconds)
    attendeeOverlap: 0.50,          // 50%+ attendee overlap = duplicate

    // Task Quality
    rankDifferenceThreshold: 100,   // Rank off by 100+ = needs recalc

    // Narrative Quality
    lowSignificance: 0.40,          // Below 40% = low value
    narrativeAgeDays: 14,           // 14+ days for low-sig pruning
    duplicateHeadline: 0.90,        // 90%+ headline match = duplicate

    // Project Detection
    projectConfidence: 0.70,        // 70%+ = auto-link project

    // Archival
    archiveCompletedDays: 30,       // 30+ days completed = archive
    archiveEventsDays: 90,          // 90+ days past = archive
  },

  // ============================================================
  // SAFETY LIMITS
  // ============================================================
  // Prevent mass deletion bugs
  safetyLimits: {
    maxDismissPerRun: 50,           // Never dismiss >50 tasks at once
    maxHidePerRun: 20,              // Never hide >20 events at once
    maxDeletePerRun: 100,           // Never delete >100 narratives at once
    maxActionsPerRun: 200,          // Total actions per run limit

    // Execution timeout
    timeoutSeconds: 300,            // 5 minutes max per run
  },

  // ============================================================
  // AUTO-FIX CONFIGURATION
  // ============================================================
  // Which checks should auto-fix vs. flag for manual review
  autoFix: {
    // Pending Task Quality - PHASE 2: ENABLED
    duplicateTasks: true,           // Auto-dismiss duplicate pending tasks
    lowQualityTasks: true,          // Auto-dismiss vague/non-actionable tasks
    stalePending: true,             // Auto-dismiss stale low-confidence tasks (keeps high-confidence)
    alreadyCompleted: true,         // Auto-complete tasks with narrative evidence

    // Event Quality - PHASE 2: ENABLED
    noTitleEvents: true,            // Auto-enrich event titles from attendees/location
    duplicateEvents: true,          // Auto-hide duplicate events
    missingProject: true,           // Auto-link events to projects

    // Task Quality
    orphanedTasks: false,           // PHASE 3: Manual review (data migration)
    taskRanks: false,               // DISABLED: Rank calculation may differ from system

    // Narrative Quality
    lowSignificanceNarratives: false, // PHASE 3: Manual review (deletion)
    duplicateNarratives: false,     // PHASE 3: Manual review (merging)

    // System Health
    databaseIntegrity: false,       // PHASE 3: Manual review (data fixes)
  },

  // ============================================================
  // NOTIFICATIONS
  // ============================================================
  notifications: {
    enabled: true,

    // When to send alerts
    criticalAlerts: true,           // Immediate alert for critical issues
    dailyDigest: true,              // Daily summary email
    weeklyReport: true,             // Weekly trends

    // Alert thresholds
    criticalIssueCount: 20,         // 20+ issues = critical alert
    errorThreshold: 3,              // 3+ errors in run = alert
  },

  // ============================================================
  // REPORTING
  // ============================================================
  reporting: {
    // Report storage
    saveReports: true,
    reportDirectory: 'qc_reports',

    // Report detail level
    includeExamples: true,          // Include specific examples in report
    maxExamplesPerCheck: 5,         // Max 5 examples per check type

    // Format
    formats: ['markdown', 'json'],  // Generate both formats
  },

  // ============================================================
  // PHASE CONFIGURATION
  // ============================================================
  // Gradually enable features
  phases: {
    currentPhase: 2,                // NOW IN PHASE 2: Auto-fix enabled

    phase1: {
      description: 'Detection only',
      readOnlyMode: true,
      autoFixEnabled: false,
      duration: '1 week',
    },

    phase2: {
      description: 'Enable safe auto-fixes',
      readOnlyMode: false,
      autoFixEnabled: true,
      enabledFixes: [
        'duplicateEvents',          // Safe: just hides
        'noTitleEvents',            // Safe: enrichment
        'taskRanks',                // Safe: recalculation
      ],
      duration: '1 week',
    },

    phase3: {
      description: 'Enable all auto-fixes',
      readOnlyMode: false,
      autoFixEnabled: true,
      enabledFixes: 'all',          // Enable all fixes
      duration: 'ongoing',
    },
  },

  // ============================================================
  // FEATURE FLAGS
  // ============================================================
  features: {
    semanticDuplicateDetection: true,
    aiProjectDetection: true,
    narrativeCompletionDetection: true,
    advancedEventEnrichment: true,
  },

  // ============================================================
  // MODELS
  // ============================================================
  models: {
    // QC agent uses Haiku for speed + cost
    defaultModel: 'haiku',

    // For complex analysis (rare)
    fallbackModel: 'sonnet',

    // Semantic similarity
    embeddingModel: 'text-embedding-3-small', // If using OpenAI embeddings
  },

  // ============================================================
  // LOGGING
  // ============================================================
  logging: {
    level: 'info',                  // debug, info, warn, error
    logActions: true,               // Log every action taken
    logDetections: true,            // Log all detections (even if not fixed)
    consoleOutput: true,            // Output to console
    fileOutput: true,               // Save to log files
  },
};
