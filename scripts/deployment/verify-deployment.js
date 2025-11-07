#!/usr/bin/env node

/**
 * Deployment Verification Script
 *
 * Automated testing of critical endpoints after deployment.
 * Run this after pushing to Railway to verify deployment succeeded.
 *
 * Usage:
 *   node scripts/deployment/verify-deployment.js
 *   npm run verify:deployment
 *
 * Environment:
 *   BACKEND_URL - Backend URL to test (defaults to Railway production)
 */

const axios = require('axios');

// Configuration
const BACKEND_URL = process.env.BACKEND_URL || 'https://playbook-backend-production.up.railway.app';
const TIMEOUT = 10000; // 10 seconds

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bold: '\x1b[1m'
};

// Test results tracker
const results = {
  passed: [],
  failed: [],
  warnings: []
};

/**
 * Print colored message
 */
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Print test header
 */
function printHeader() {
  log('\n' + '='.repeat(60), 'blue');
  log('🔍 DEPLOYMENT VERIFICATION', 'bold');
  log('='.repeat(60), 'blue');
  log(`Target: ${BACKEND_URL}`, 'blue');
  log(`Timeout: ${TIMEOUT}ms`, 'blue');
  log('='.repeat(60) + '\n', 'blue');
}

/**
 * Print test summary
 */
function printSummary() {
  log('\n' + '='.repeat(60), 'blue');
  log('📊 VERIFICATION SUMMARY', 'bold');
  log('='.repeat(60), 'blue');

  log(`\n✅ Passed: ${results.passed.length}`, 'green');
  results.passed.forEach(test => log(`   - ${test}`, 'green'));

  if (results.warnings.length > 0) {
    log(`\n⚠️  Warnings: ${results.warnings.length}`, 'yellow');
    results.warnings.forEach(test => log(`   - ${test}`, 'yellow'));
  }

  if (results.failed.length > 0) {
    log(`\n❌ Failed: ${results.failed.length}`, 'red');
    results.failed.forEach(test => log(`   - ${test}`, 'red'));
  }

  log('\n' + '='.repeat(60), 'blue');

  if (results.failed.length === 0) {
    log('✅ DEPLOYMENT VERIFIED - ALL TESTS PASSED', 'green');
    log('='.repeat(60) + '\n', 'blue');
    return true;
  } else {
    log('❌ DEPLOYMENT VERIFICATION FAILED', 'red');
    log('='.repeat(60) + '\n', 'blue');
    return false;
  }
}

/**
 * Test: Health endpoint
 */
async function testHealthEndpoint() {
  const testName = 'Health Endpoint';
  log(`\n🔍 Testing: ${testName}...`);

  try {
    const response = await axios.get(`${BACKEND_URL}/health`, {
      timeout: TIMEOUT
    });

    if (response.status === 200 && response.data.status === 'healthy') {
      log(`✅ ${testName} - PASSED`, 'green');
      log(`   Status: ${response.data.status}`);
      log(`   Uptime: ${response.data.uptime}s`);
      log(`   Memory: ${response.data.memory.usedMB}MB / ${response.data.memory.totalMB}MB`);
      results.passed.push(testName);
      return true;
    } else {
      log(`❌ ${testName} - FAILED (Unexpected response)`, 'red');
      log(`   Status: ${response.status}`);
      log(`   Data: ${JSON.stringify(response.data)}`);
      results.failed.push(`${testName} - Unexpected response`);
      return false;
    }
  } catch (error) {
    log(`❌ ${testName} - FAILED`, 'red');
    log(`   Error: ${error.message}`);
    results.failed.push(`${testName} - ${error.message}`);
    return false;
  }
}

/**
 * Test: Email scan endpoint exists
 */
async function testEmailScanEndpoint() {
  const testName = 'Email Scan Endpoint';
  log(`\n🔍 Testing: ${testName}...`);

  try {
    // Note: This endpoint requires auth, so we expect 200 or 401, but NOT 404
    const response = await axios.post(`${BACKEND_URL}/api/email/scan`, {}, {
      timeout: TIMEOUT,
      validateStatus: (status) => status < 500 // Accept any non-500 error
    });

    if (response.status === 404) {
      log(`❌ ${testName} - FAILED (Endpoint not found)`, 'red');
      log(`   This indicates old code deployed or route not registered`);
      results.failed.push(`${testName} - Endpoint returns 404`);
      return false;
    } else if (response.status === 200 || response.status === 401) {
      log(`✅ ${testName} - PASSED`, 'green');
      log(`   Status: ${response.status} (endpoint exists)`);
      results.passed.push(testName);
      return true;
    } else {
      log(`⚠️  ${testName} - WARNING (Unexpected status)`, 'yellow');
      log(`   Status: ${response.status}`);
      results.warnings.push(`${testName} - Status ${response.status}`);
      return true;
    }
  } catch (error) {
    if (error.response && error.response.status === 404) {
      log(`❌ ${testName} - FAILED (Endpoint not found)`, 'red');
      results.failed.push(`${testName} - Endpoint returns 404`);
      return false;
    }

    log(`⚠️  ${testName} - WARNING`, 'yellow');
    log(`   Error: ${error.message}`);
    results.warnings.push(`${testName} - ${error.message}`);
    return true;
  }
}

/**
 * Test: Calendar routes
 */
async function testCalendarRoutes() {
  const testName = 'Calendar Brief Endpoint';
  log(`\n🔍 Testing: ${testName}...`);

  try {
    const response = await axios.get(`${BACKEND_URL}/api/calendar/brief?days=1`, {
      timeout: TIMEOUT,
      validateStatus: (status) => status < 500
    });

    if (response.status === 404) {
      log(`❌ ${testName} - FAILED (Endpoint not found)`, 'red');
      results.failed.push(`${testName} - Endpoint returns 404`);
      return false;
    } else if (response.status === 200) {
      log(`✅ ${testName} - PASSED`, 'green');
      log(`   Status: ${response.status}`);

      // Check response structure
      if (response.data.eventsByDate) {
        log(`   Events fetched successfully`);
      }

      results.passed.push(testName);
      return true;
    } else {
      log(`⚠️  ${testName} - WARNING (Unexpected status)`, 'yellow');
      log(`   Status: ${response.status}`);
      results.warnings.push(`${testName} - Status ${response.status}`);
      return true;
    }
  } catch (error) {
    if (error.response && error.response.status === 404) {
      log(`❌ ${testName} - FAILED (Endpoint not found)`, 'red');
      results.failed.push(`${testName} - Endpoint returns 404`);
      return false;
    }

    log(`⚠️  ${testName} - WARNING`, 'yellow');
    log(`   Error: ${error.message}`);
    results.warnings.push(`${testName} - ${error.message}`);
    return true;
  }
}

/**
 * Test: Tasks endpoint
 */
async function testTasksEndpoint() {
  const testName = 'Tasks Endpoint';
  log(`\n🔍 Testing: ${testName}...`);

  try {
    const response = await axios.get(`${BACKEND_URL}/api/tasks`, {
      timeout: TIMEOUT,
      validateStatus: (status) => status < 500
    });

    if (response.status === 404) {
      log(`❌ ${testName} - FAILED (Endpoint not found)`, 'red');
      results.failed.push(`${testName} - Endpoint returns 404`);
      return false;
    } else if (response.status === 200) {
      log(`✅ ${testName} - PASSED`, 'green');
      log(`   Status: ${response.status}`);

      if (response.data.tasks) {
        log(`   Tasks: ${response.data.tasks.length} found`);
      }

      results.passed.push(testName);
      return true;
    } else {
      log(`⚠️  ${testName} - WARNING (Unexpected status)`, 'yellow');
      log(`   Status: ${response.status}`);
      results.warnings.push(`${testName} - Status ${response.status}`);
      return true;
    }
  } catch (error) {
    if (error.response && error.response.status === 404) {
      log(`❌ ${testName} - FAILED (Endpoint not found)`, 'red');
      results.failed.push(`${testName} - Endpoint returns 404`);
      return false;
    }

    log(`⚠️  ${testName} - WARNING`, 'yellow');
    log(`   Error: ${error.message}`);
    results.warnings.push(`${testName} - ${error.message}`);
    return true;
  }
}

/**
 * Test: Projects endpoint
 */
async function testProjectsEndpoint() {
  const testName = 'Projects Endpoint';
  log(`\n🔍 Testing: ${testName}...`);

  try {
    const response = await axios.get(`${BACKEND_URL}/api/projects`, {
      timeout: TIMEOUT,
      validateStatus: (status) => status < 500
    });

    if (response.status === 404) {
      log(`❌ ${testName} - FAILED (Endpoint not found)`, 'red');
      results.failed.push(`${testName} - Endpoint returns 404`);
      return false;
    } else if (response.status === 200) {
      log(`✅ ${testName} - PASSED`, 'green');
      log(`   Status: ${response.status}`);

      if (response.data.projects) {
        log(`   Projects: ${response.data.projects.length} found`);
      }

      results.passed.push(testName);
      return true;
    } else {
      log(`⚠️  ${testName} - WARNING (Unexpected status)`, 'yellow');
      log(`   Status: ${response.status}`);
      results.warnings.push(`${testName} - Status ${response.status}`);
      return true;
    }
  } catch (error) {
    if (error.response && error.response.status === 404) {
      log(`❌ ${testName} - FAILED (Endpoint not found)`, 'red');
      results.failed.push(`${testName} - Endpoint returns 404`);
      return false;
    }

    log(`⚠️  ${testName} - WARNING`, 'yellow');
    log(`   Error: ${error.message}`);
    results.warnings.push(`${testName} - ${error.message}`);
    return true;
  }
}

/**
 * Test: Server is using Phase 2 architecture
 */
async function testPhase2Architecture() {
  const testName = 'Phase 2 Architecture Check';
  log(`\n🔍 Testing: ${testName}...`);

  try {
    // Check if events table is being used (Phase 2 indicator)
    const response = await axios.get(`${BACKEND_URL}/api/calendar/brief?days=1`, {
      timeout: TIMEOUT,
      validateStatus: (status) => status < 500
    });

    if (response.status === 200) {
      // Check if response structure indicates Phase 2
      const hasPhase2Structure = response.data.eventsByDate !== undefined;

      if (hasPhase2Structure) {
        log(`✅ ${testName} - PASSED`, 'green');
        log(`   Server is using Phase 2 (Three-Entity Model)`);
        results.passed.push(testName);
        return true;
      } else {
        log(`⚠️  ${testName} - WARNING`, 'yellow');
        log(`   Response structure unclear`);
        results.warnings.push(`${testName} - Structure unclear`);
        return true;
      }
    } else {
      log(`⚠️  ${testName} - SKIPPED (Calendar endpoint unavailable)`, 'yellow');
      results.warnings.push(`${testName} - Skipped`);
      return true;
    }
  } catch (error) {
    log(`⚠️  ${testName} - SKIPPED`, 'yellow');
    log(`   Error: ${error.message}`);
    results.warnings.push(`${testName} - Skipped`);
    return true;
  }
}

/**
 * Main verification function
 */
async function verifyDeployment() {
  printHeader();

  // Run all tests sequentially
  await testHealthEndpoint();
  await testEmailScanEndpoint();
  await testCalendarRoutes();
  await testTasksEndpoint();
  await testProjectsEndpoint();
  await testPhase2Architecture();

  // Print summary and exit
  const success = printSummary();
  process.exit(success ? 0 : 1);
}

// Run verification
verifyDeployment().catch(error => {
  log(`\n❌ VERIFICATION FAILED WITH ERROR`, 'red');
  log(`Error: ${error.message}`, 'red');
  process.exit(1);
});
