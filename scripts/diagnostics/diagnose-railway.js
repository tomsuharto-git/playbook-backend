#!/usr/bin/env node

/**
 * Railway Deployment Diagnostic Tool
 * Diagnoses why Railway isn't deploying the latest code
 */

const https = require('https');
const { execSync } = require('child_process');

const RAILWAY_URL = 'https://playbook-backend-production.up.railway.app';
const GITHUB_REPO = 'tomsuharto-git/playbook';
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}`;

console.log('\n🔍 RAILWAY DEPLOYMENT DIAGNOSTIC TOOL\n');
console.log('='.repeat(60));

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
console.log('\n📂 LOCAL GIT STATUS');
console.log('-'.repeat(60));
try {
  const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
  const latestCommit = execSync('git rev-parse HEAD').toString().trim();
  const latestCommitShort = execSync('git rev-parse --short HEAD').toString().trim();
  const commitMessage = execSync('git log -1 --pretty=%B').toString().trim();
  const commitDate = execSync('git log -1 --pretty=%cd').toString().trim();

  console.log(`Branch: ${branch}`);
  console.log(`Latest Commit: ${latestCommitShort} (${latestCommit})`);
  console.log(`Message: ${commitMessage}`);
  console.log(`Date: ${commitDate}`);

  // Check if local is ahead of remote
  try {
    const ahead = execSync('git rev-list --count @{u}..HEAD').toString().trim();
    if (ahead > 0) {
      console.log(`⚠️  WARNING: Local is ${ahead} commit(s) ahead of remote!`);
    } else {
      console.log('✅ Local is in sync with remote');
    }
  } catch (e) {
    console.log('⚠️  Could not check if local is ahead of remote');
  }
} catch (error) {
  console.log('❌ Error checking git status:', error.message);
}

// 2. Check GitHub API for latest commit
console.log('\n🐙 GITHUB REPOSITORY STATUS');
console.log('-'.repeat(60));
httpsGet(`${GITHUB_API}/commits/main`).then(data => {
  if (data.error) {
    console.log('❌ Error fetching GitHub data:', data.statusCode);
  } else {
    console.log(`Latest commit on GitHub: ${data.sha.substring(0, 7)}`);
    console.log(`Author: ${data.commit.author.name}`);
    console.log(`Date: ${data.commit.author.date}`);
    console.log(`Message: ${data.commit.message.split('\n')[0]}`);
  }
}).catch(err => console.log('❌ Error:', err.message));

// 3. Check Railway deployment health
console.log('\n🚂 RAILWAY DEPLOYMENT STATUS');
console.log('-'.repeat(60));

setTimeout(() => {
  httpsGet(`${RAILWAY_URL}/health`).then(data => {
    if (data.error) {
      console.log('❌ Health endpoint returned error:', data.statusCode);
      console.log(data.error.substring(0, 200));
    } else {
      console.log(`✅ Server is running`);
      console.log(`Timestamp: ${data.timestamp}`);
      console.log(`Status: ${data.status}`);

      // Calculate how old the deployment is
      const deployTime = new Date(data.timestamp);
      const now = new Date();
      const ageMinutes = Math.floor((now - deployTime) / 60000);
      console.log(`Server age: ${ageMinutes} minutes old`);
    }
  }).catch(err => console.log('❌ Error:', err.message));
}, 1000);

// 4. Check if email scan endpoint exists
console.log('\n📧 EMAIL SCANNING ENDPOINT CHECK');
console.log('-'.repeat(60));

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
        console.log('❌ Endpoint NOT FOUND (404)');
        console.log('   This confirms Railway is running OLD CODE');
      } else if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log('✅ Endpoint EXISTS and responded:', res.statusCode);
        console.log('   Railway is running LATEST CODE');
      } else {
        console.log(`⚠️  Endpoint responded with: ${res.statusCode}`);
      }
    });
  });

  req.on('error', (e) => {
    console.log('❌ Error testing endpoint:', e.message);
  });

  req.end();
}, 2000);

// 5. Check server-railway.js for email scanning code
console.log('\n📄 LOCAL CODE CHECK');
console.log('-'.repeat(60));

setTimeout(() => {
  const fs = require('fs');
  const serverPath = './server-railway.js';

  if (fs.existsSync(serverPath)) {
    const content = fs.readFileSync(serverPath, 'utf8');

    // Check for email scanning endpoint
    if (content.includes('/api/email/scan')) {
      console.log('✅ Email scan endpoint EXISTS in local server-railway.js');
    } else {
      console.log('❌ Email scan endpoint NOT FOUND in local server-railway.js');
    }

    // Check for email scanning scheduling
    if (content.includes('scheduleEmailScanning')) {
      console.log('✅ Email scanning scheduler EXISTS in local server-railway.js');
    } else {
      console.log('❌ Email scanning scheduler NOT FOUND in local server-railway.js');
    }
  } else {
    console.log('❌ server-railway.js not found');
  }
}, 2500);

// 6. Check Railway CLI configuration
console.log('\n⚙️  RAILWAY CLI CONFIGURATION');
console.log('-'.repeat(60));

setTimeout(() => {
  try {
    const project = execSync('railway status 2>&1').toString();
    console.log(project);

    // Try to get variables that might affect deployment
    console.log('\nChecking for root directory configuration...');
    const vars = execSync('railway variables 2>&1 | grep -i "root\\|dir\\|path" || echo "No path-related variables found"').toString();
    console.log(vars);

  } catch (error) {
    console.log('❌ Error checking Railway CLI:', error.message);
  }
}, 3000);

// 7. Summary and recommendations
setTimeout(() => {
  console.log('\n💡 DIAGNOSTIC SUMMARY');
  console.log('='.repeat(60));
  console.log('\nIf the email scan endpoint is 404:');
  console.log('  1. Railway is deploying old code from cache');
  console.log('  2. Check Railway dashboard Settings → Source');
  console.log('     - Root Directory should be: / or empty');
  console.log('     - Watch Paths should be: empty or **/*');
  console.log('  3. Go to Deployments tab and click "Redeploy" on latest');
  console.log('  4. Clear build cache if redeploy doesn\'t work\n');

  console.log('If health check timestamp is old:');
  console.log('  1. Server hasn\'t restarted recently');
  console.log('  2. Auto-deploy might not be triggered');
  console.log('  3. Check GitHub webhook delivery in repo settings\n');

  console.log('Next steps:');
  console.log('  1. Go to: https://railway.app/project/blissful-presence');
  console.log('  2. Click on your service');
  console.log('  3. Check Deployments tab for commit SHA');
  console.log('  4. Compare commit SHA to local git commit');
  console.log('  5. If different, check Settings → Source configuration\n');
}, 4000);
