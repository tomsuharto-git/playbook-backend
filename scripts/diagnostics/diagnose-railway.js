#!/usr/bin/env node

/**
 * Railway Deployment Diagnostic Tool
 * Diagnoses why Railway isn't deploying the latest code
 */

const https = require('https');
const logger = require('../../utils/logger');
const { execSync } = require('child_process');

const RAILWAY_URL = 'https://playbook-backend-production.up.railway.app';
const GITHUB_REPO = 'tomsuharto-git/playbook';
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}`;

logger.debug('\n🔍 RAILWAY DEPLOYMENT DIAGNOSTIC TOOL\n');
logger.info('='.repeat(60));

// Helper function to make HTTPS GET requests
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Railway-Diagnostic-Tool'
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(res.statusCode === 200 ? JSON.parse(data) : { error: data, statusCode: res.statusCode });
        } catch (e) {
          resolve({ error: data, statusCode: res.statusCode });
        }
      });
    }).on('error', reject);
  });
}

// 1. Check local git status
logger.info('\n📂 LOCAL GIT STATUS');
logger.info('-'.repeat(60));
try {
  const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
  const latestCommit = execSync('git rev-parse HEAD').toString().trim();
  const latestCommitShort = execSync('git rev-parse --short HEAD').toString().trim();
  const commitMessage = execSync('git log -1 --pretty=%B').toString().trim();
  const commitDate = execSync('git log -1 --pretty=%cd').toString().trim();

  logger.info('Branch:', { branch: branch });
  logger.info('Latest Commit:  ()', { latestCommitShort: latestCommitShort, latestCommit: latestCommit });
  logger.info('Message:', { commitMessage: commitMessage });
  logger.info('Date:', { commitDate: commitDate });

  // Check if local is ahead of remote
  try {
    const ahead = execSync('git rev-list --count @{u}..HEAD').toString().trim();
    if (ahead > 0) {
      logger.warn('⚠️  WARNING: Local is  commit(s) ahead of remote!', { ahead: ahead });
    } else {
      logger.info('✅ Local is in sync with remote');
    }
  } catch (e) {
    logger.warn('⚠️  Could not check if local is ahead of remote');
  }
} catch (error) {
  logger.error('❌ Error checking git status:', { arg0: error.message });
}

// 2. Check GitHub API for latest commit
logger.info('\n🐙 GITHUB REPOSITORY STATUS');
logger.info('-'.repeat(60));
httpsGet(`${GITHUB_API}/commits/main`).then(data => {
  if (data.error) {
    logger.error('❌ Error fetching GitHub data:', { arg0: data.statusCode });
  } else {
    logger.info('Latest commit on GitHub:', { substring(0, 7): data.sha.substring(0, 7) });
    logger.info('Author:', { name: data.commit.author.name });
    logger.info('Date:', { date: data.commit.author.date });
    logger.info('Message:', { split('\n')[0]: data.commit.message.split('\n')[0] });
  }
}).catch(err => logger.error('❌ Error:');

// 3. Check Railway deployment health
logger.info('\n🚂 RAILWAY DEPLOYMENT STATUS');
logger.info('-'.repeat(60));

setTimeout(() => {
  httpsGet(`${RAILWAY_URL}/health`).then(data => {
    if (data.error) {
      logger.error('❌ Health endpoint returned error:', { arg0: data.statusCode });
      logger.error(data.error.substring(0);
    } else {
      logger.info('✅ Server is running');
      logger.info('Timestamp:', { timestamp: data.timestamp });
      logger.info('Status:', { status: data.status });

      // Calculate how old the deployment is
      const deployTime = new Date(data.timestamp);
      const now = new Date();
      const ageMinutes = Math.floor((now - deployTime) / 60000);
      logger.info('Server age:  minutes old', { ageMinutes: ageMinutes });
    }
  }).catch(err => logger.error('❌ Error:');
}, 1000);

// 4. Check if email scan endpoint exists
logger.info('\n📧 EMAIL SCANNING ENDPOINT CHECK');
logger.info('-'.repeat(60));

setTimeout(() => {
  const options = {
    hostname: 'playbook-backend-production.up.railway.app',
    path: '/api/email/scan',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      if (res.statusCode === 404) {
        logger.error('❌ Endpoint NOT FOUND (404)');
        logger.info('   This confirms Railway is running OLD CODE');
      } else if (res.statusCode >= 200 && res.statusCode < 300) {
        logger.info('✅ Endpoint EXISTS and responded:', { arg0: res.statusCode });
        logger.info('   Railway is running LATEST CODE');
      } else {
        logger.warn('⚠️  Endpoint responded with:', { statusCode: res.statusCode });
      }
    });
  });

  req.on('error', (e) => {
    logger.error('❌ Error testing endpoint:', { arg0: e.message });
  });

  req.end();
}, 2000);

// 5. Check server-railway.js for email scanning code
logger.info('\n📄 LOCAL CODE CHECK');
logger.info('-'.repeat(60));

setTimeout(() => {
  const fs = require('fs');
  const serverPath = './server-railway.js';

  if (fs.existsSync(serverPath)) {
    const content = fs.readFileSync(serverPath, 'utf8');

    // Check for email scanning endpoint
    if (content.includes('/api/email/scan')) {
      logger.info('✅ Email scan endpoint EXISTS in local server-railway.js');
    } else {
      logger.error('❌ Email scan endpoint NOT FOUND in local server-railway.js');
    }

    // Check for email scanning scheduling
    if (content.includes('scheduleEmailScanning')) {
      logger.info('✅ Email scanning scheduler EXISTS in local server-railway.js');
    } else {
      logger.error('❌ Email scanning scheduler NOT FOUND in local server-railway.js');
    }
  } else {
    logger.error('❌ server-railway.js not found');
  }
}, 2500);

// 6. Check Railway CLI configuration
logger.info('\n⚙️  RAILWAY CLI CONFIGURATION');
logger.info('-'.repeat(60));

setTimeout(() => {
  try {
    const project = execSync('railway status 2>&1').toString();
    logger.info(project);

    // Try to get variables that might affect deployment
    logger.info('\nChecking for root directory configuration...');
    const vars = execSync('railway variables 2>&1 | grep -i "root\\|dir\\|path" || echo "No path-related variables found"').toString();
    logger.info(vars);

  } catch (error) {
    logger.error('❌ Error checking Railway CLI:', { arg0: error.message });
  }
}, 3000);

// 7. Summary and recommendations
setTimeout(() => {
  logger.info('\n💡 DIAGNOSTIC SUMMARY');
  logger.info('='.repeat(60));
  logger.info('\nIf the email scan endpoint is 404:');
  logger.info('  1. Railway is deploying old code from cache');
  logger.info('  2. Check Railway dashboard Settings → Source');
  logger.info('     - Root Directory should be: / or empty');
  logger.info('     - Watch Paths should be: empty or **/*');
  logger.info('  3. Go to Deployments tab and click "Redeploy" on latest');
  logger.info('  4. Clear build cache if redeploy doesn\'t work\n');

  logger.info('If health check timestamp is old:');
  logger.info('  1. Server hasn\'t restarted recently');
  logger.info('  2. Auto-deploy might not be triggered');
  logger.info('  3. Check GitHub webhook delivery in repo settings\n');

  logger.info('Next steps:');
  logger.info('  1. Go to: https://railway.app/project/blissful-presence');
  logger.info('  2. Click on your service');
  logger.info('  3. Check Deployments tab for commit SHA');
  logger.info('  4. Compare commit SHA to local git commit');
  logger.info('  5. If different, check Settings → Source configuration\n');
}, 4000);
