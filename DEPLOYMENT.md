# Deployment Guide - Playbook Backend

**Last Updated**: November 6, 2025
**Architecture**: Phase 2 (Three-Entity Model)
**Platform**: Railway (Production), Local (Development)

---

## Table of Contents

- [Quick Start](#quick-start)
- [Local Development Setup](#local-development-setup)
- [Railway Production Deployment](#railway-production-deployment)
- [Environment Variables](#environment-variables)
- [Verifying Deployments](#verifying-deployments)
- [Common Deployment Issues](#common-deployment-issues)
- [Rollback Procedures](#rollback-procedures)
- [Monitoring & Health Checks](#monitoring--health-checks)

---

## Quick Start

### For Development
```bash
# Clone and install
git clone https://github.com/tomsuharto-git/playbook-backend.git
cd playbook-backend
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Start server
npm run dev  # Uses server-railway.js with nodemon
```

### For Production Deployment
```bash
# Make changes locally
git add .
git commit -m "Your changes"
git push origin main

# Railway auto-deploys in 2-3 minutes
# Verify: curl https://[your-railway-url]/health
```

---

## Local Development Setup

### Prerequisites

- **Node.js**: 18+ (LTS recommended)
- **PostgreSQL**: via Supabase (cloud-hosted)
- **Git**: For version control
- **Railway CLI** (optional): For manual deployments

### Installation Steps

#### 1. Clone Repository
```bash
git clone https://github.com/tomsuharto-git/playbook-backend.git
cd playbook-backend
```

#### 2. Install Dependencies
```bash
npm install
```

This installs all required packages including:
- Express (API framework)
- Winston (structured logging)
- Supabase client (database)
- Anthropic SDK (Claude AI)
- fast-levenshtein (duplicate detection)

#### 3. Configure Environment Variables

Create your `.env` file:
```bash
cp .env.example .env
```

Edit `.env` with your actual credentials (see [Environment Variables](#environment-variables) section).

**Required Variables:**
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_KEY` - Supabase anon/service key
- `ANTHROPIC_API_KEY` - Claude API key for AI processing
- `DATABASE_URL` - PostgreSQL connection string (from Supabase)

#### 4. Verify Database Connection
```bash
node -e "require('./db/supabase-client').supabase.from('tasks').select('count').then(console.log)"
```

Should return a count without errors.

#### 5. Start Development Server
```bash
npm run dev
```

Server starts on `http://localhost:3001` (or port specified in `.env`).

### Development Workflow

#### Making Changes
1. Edit code in your IDE
2. Nodemon automatically restarts server
3. Check logs for errors
4. Test endpoints with curl/Postman

#### Running Scripts
```bash
# Diagnostic scripts
node scripts/diagnostics/check-db.js
node scripts/diagnostics/check-events.js

# Maintenance scripts
node scripts/cleanup/cleanup-duplicates.js
```

#### Testing Email Scanning
```bash
curl -X POST http://localhost:3001/api/email/scan
```

#### Testing Briefing Generation
```bash
curl -X POST http://localhost:3001/api/calendar/regenerate
```

---

## Railway Production Deployment

### Automatic Deployment (Recommended)

Railway is configured for **automatic deployment** from GitHub:

1. **Make Changes Locally**
   ```bash
   # Edit files
   git add .
   git commit -m "Descriptive commit message"
   ```

2. **Push to GitHub**
   ```bash
   git push origin main
   ```

3. **Railway Deploys Automatically**
   - Railway detects the push within seconds
   - Builds Docker container using Nixpacks
   - Deploys to production environment
   - Total time: 2-3 minutes

4. **Verify Deployment**
   ```bash
   # Check health endpoint
   curl https://playbook-backend-production.up.railway.app/health

   # Should return status: "healthy" or "degraded"
   ```

### Manual Deployment (Railway CLI)

If automatic deployment fails or you need to deploy without pushing:

```bash
# Install Railway CLI (one-time)
npm install -g @railway/cli

# Login
railway login

# Deploy current directory
railway up
```

**⚠️ WARNING**: `railway up` uploads ALL local files including `node_modules` (10,000+ files). This can take 5-10 minutes. **Prefer GitHub auto-deploy whenever possible.**

### Deployment Configuration

Railway uses these settings (configured in Railway dashboard):

- **Root Directory**: `/` (project root)
- **Watch Paths**: (empty) - watches entire repository
- **Build Command**: Auto-detected by Nixpacks
- **Start Command**: `node server-railway.js`
- **Auto-Deploy**: Enabled for `main` branch
- **Health Check**: Disabled (we use `/health` endpoint manually)

### Deployment Checklist

Before deploying to production:

- [ ] All tests pass locally
- [ ] No console.error or console.warn in code (use logger)
- [ ] Environment variables set in Railway dashboard
- [ ] Database migrations applied (if any)
- [ ] Commit message is descriptive
- [ ] No sensitive data in code (use env vars)

After deployment:

- [ ] Health endpoint returns 200 OK
- [ ] Check Railway logs for errors: `railway logs`
- [ ] Test critical endpoints (email scan, briefings)
- [ ] Monitor logs for 10 minutes for errors
- [ ] Check scheduled jobs are running

---

## Environment Variables

### Required (All Environments)

| Variable | Description | Example |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Claude API key for AI processing | `sk-ant-...` |
| `SUPABASE_URL` | Supabase project URL | `https://abc.supabase.co` |
| `SUPABASE_KEY` | Supabase anon or service key | `eyJhbGciOi...` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:[pwd]@db...` |

### Required (Production Only)

| Variable | Description | Example |
|----------|-------------|---------|
| `FRONTEND_URL` | Frontend origin for CORS | `https://playbook.vercel.app` |

### Optional (Email Integration)

| Variable | Description | When Required |
|----------|-------------|---------------|
| `GMAIL_CLIENT_ID` | Gmail OAuth client ID | Email scanning enabled |
| `GMAIL_CLIENT_SECRET` | Gmail OAuth secret | Email scanning enabled |
| `GMAIL_REFRESH_TOKEN` | Gmail OAuth refresh token | Email scanning enabled |
| `OUTLOOK_CLIENT_ID` | Outlook OAuth client ID | Outlook calendar sync |
| `OUTLOOK_CLIENT_SECRET` | Outlook OAuth secret | Outlook calendar sync |
| `OUTLOOK_REFRESH_TOKEN` | Outlook refresh token | Outlook calendar sync |

### Optional (External Services)

| Variable | Description | When Required |
|----------|-------------|---------------|
| `ELEVENLABS_API_KEY` | Text-to-speech for podcasts | Podcast generation enabled |
| `PDL_API_KEY` | People Data Labs API | Contact enrichment |
| `GOOGLE_API_KEY` | Google Calendar API | Calendar integration |
| `OPENWEATHER_API_KEY` | Weather data API | Weather in briefings |

### Optional (Configuration)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `NODE_ENV` | Environment mode | `development` |

### Setting Environment Variables

#### Local Development (.env file)
```bash
# .env
ANTHROPIC_API_KEY=sk-ant-your-key-here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
DATABASE_URL=postgresql://postgres:password@db.project.supabase.co:5432/postgres

# Optional - Email
GMAIL_CLIENT_ID=your-client-id
GMAIL_CLIENT_SECRET=your-client-secret
GMAIL_REFRESH_TOKEN=your-refresh-token
```

#### Railway Production (Dashboard)

1. Go to Railway dashboard
2. Select your project
3. Click "Variables" tab
4. Add each variable with name and value
5. Redeploy for changes to take effect

**Note**: Railway variables are encrypted and not visible in logs.

---

## Verifying Deployments

### Health Endpoint

The `/health` endpoint provides comprehensive system status:

```bash
curl https://playbook-backend-production.up.railway.app/health
```

**Healthy Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-06T12:00:00.000Z",
  "environment": "production",
  "database": "connected",
  "uptime": 3600000
}
```

**Degraded Response** (some features unavailable):
```json
{
  "status": "degraded",
  "timestamp": "2025-11-06T12:00:00.000Z",
  "warnings": ["Gmail credentials not configured"]
}
```

**Unhealthy Response** (critical failure):
```json
{
  "status": "unhealthy",
  "error": "Database connection failed"
}
```

### Manual Verification Steps

#### 1. Check Server is Running
```bash
curl -I https://playbook-backend-production.up.railway.app/health
# Should return: HTTP/2 200
```

#### 2. Test Email Scan Endpoint
```bash
curl -X POST https://playbook-backend-production.up.railway.app/api/email/scan
# Should NOT return 404 (may return 400/401, but endpoint exists)
```

#### 3. Test Calendar Endpoint
```bash
curl https://playbook-backend-production.up.railway.app/api/calendar/brief?days=1
# Should return JSON with eventsByDate
```

#### 4. Check Railway Logs
```bash
railway logs | tail -50
```

Look for:
- ✅ "Server started successfully"
- ✅ "Scheduled jobs initialized"
- ❌ Any errors or warnings

#### 5. Monitor Scheduled Jobs

Check that jobs are running:
```bash
railway logs | grep -E "(Email scanning|Briefing generation|Quality control)"
```

Should see job executions every:
- **Email scanning**: Every 30 minutes
- **Briefing generation**: 6am, 12pm, 6pm ET
- **Quality control**: Every 6 hours

### Automated Verification Script

Run the verification script after each deployment:

```bash
node scripts/deployment/verify-deployment.js
```

This script tests:
- Health endpoint responds
- Email scan endpoint exists (not 404)
- Calendar routes loaded
- Database connection working

**Output:**
```
🔍 Starting deployment verification...

✅ Health endpoint: PASSED
✅ Email scan endpoint exists: PASSED
✅ Calendar routes loaded: PASSED
✅ Database connection: PASSED

📊 Results: 4 passed, 0 failed

✅ DEPLOYMENT VERIFIED SUCCESSFULLY
```

---

## Common Deployment Issues

### Issue 1: Old Code Deployed (Endpoints Return 404)

**Symptoms:**
- Railway shows "Deployment successful"
- But endpoints return 404 or show old behavior
- Logs show old code running

**Cause:** Build cache not cleared, Railway using cached Docker layers

**Solution:**

1. **Soft Fix** - Redeploy:
   ```bash
   # In Railway dashboard:
   # Deployments → Click latest → "Redeploy"
   ```

2. **Hard Fix** - Clear build cache:
   ```bash
   # In Railway dashboard:
   # Settings → General → "Clear Build Cache"
   # Then redeploy
   ```

3. **Nuclear Fix** - Force rebuild:
   ```bash
   # Make a trivial change and push
   echo "# Force rebuild" >> README.md
   git add README.md
   git commit -m "Force rebuild"
   git push
   ```

**Prevention:** After major changes (new routes, renamed files), manually redeploy to clear cache.

---

### Issue 2: Server Won't Start

**Symptoms:**
- Deployment succeeds but no HTTP responses
- Health endpoint times out
- Railway logs show startup errors

**Cause:** Missing required environment variables or database connection failure

**Solution:**

1. **Check Railway Logs:**
   ```bash
   railway logs | grep -i error
   ```

2. **Verify Required Variables:**
   ```bash
   # In Railway dashboard → Variables
   # Ensure these are set:
   - ANTHROPIC_API_KEY
   - SUPABASE_URL
   - SUPABASE_KEY
   - DATABASE_URL
   ```

3. **Test Database Connection:**
   ```bash
   # Check health endpoint error message
   curl https://[your-url]/health
   # Will show specific database error
   ```

4. **Check Supabase Status:**
   - Go to supabase.com
   - Verify project is not paused
   - Check for service outages

**Prevention:** Use deployment verification script before announcing changes.

---

### Issue 3: Email Scanning Not Working

**Symptoms:**
- Email scanning job scheduled but no emails processed
- Health endpoint shows `gmail.status: "incomplete"`
- No errors in logs

**Cause:** Missing Gmail OAuth credentials

**Solution:**

1. **Check Gmail Variables in Railway:**
   ```bash
   # Required for email scanning:
   - GMAIL_CLIENT_ID
   - GMAIL_CLIENT_SECRET
   - GMAIL_REFRESH_TOKEN
   ```

2. **Verify Credentials:**
   ```bash
   curl https://[your-url]/health
   # Check response: checks.gmail.status
   ```

3. **Test Manual Scan:**
   ```bash
   curl -X POST https://[your-url]/api/email/scan
   # Should return success or specific error
   ```

**Prevention:** Email scanning is optional. System works without it, but won't process emails.

---

### Issue 4: Winston Logs Not Showing

**Symptoms:**
- Railway logs show old console.log format
- Emoji icons but no structured logging
- Missing Winston metadata

**Cause:** Old code still deployed (see Issue 1)

**Solution:**

1. **Verify Latest Code Deployed:**
   ```bash
   git log -1 --oneline
   # Compare with Railway deployment hash
   ```

2. **Force Redeploy:**
   ```bash
   # Railway dashboard → Redeploy
   ```

3. **Check for winston in package.json:**
   ```bash
   cat package.json | grep winston
   # Should show: "winston": "^3.11.0"
   ```

**Prevention:** Winston was added in Phase 3. If logs still show console format, cache wasn't cleared.

---

### Issue 5: Scheduled Jobs Not Running

**Symptoms:**
- No "Email scanning job starting" in logs
- Briefings not generated at scheduled times
- Health endpoint shows jobs as "never_run"

**Cause:** Server restarted during job schedule window or timezone misconfiguration

**Solution:**

1. **Check Server Uptime:**
   ```bash
   curl https://[your-url]/health
   # Check "uptime" field
   ```

2. **Verify Job Schedules:**
   ```bash
   railway logs | grep "Scheduled job"
   # Should show job registration at startup
   ```

3. **Check Timezone:**
   ```bash
   railway logs | grep "Current time"
   # Should show Eastern Time (ET)
   ```

4. **Manually Trigger Jobs:**
   ```bash
   # Email scan
   curl -X POST https://[your-url]/api/email/scan

   # Briefing generation
   curl -X POST https://[your-url]/api/calendar/regenerate
   ```

**Prevention:** Jobs run on schedule. If server restarts between scheduled times, jobs wait for next window.

---

## Rollback Procedures

### Scenario 1: Broken Deployment

If deployment introduces critical bugs:

#### Option A: Redeploy Previous Version (Fastest)

1. **In Railway Dashboard:**
   - Go to "Deployments" tab
   - Find last working deployment
   - Click "Redeploy"
   - Wait 2-3 minutes

2. **Verify Rollback:**
   ```bash
   curl https://[your-url]/health
   ```

#### Option B: Git Revert (Most Clean)

1. **Find Breaking Commit:**
   ```bash
   git log --oneline -10
   # Identify the bad commit hash
   ```

2. **Revert Commit:**
   ```bash
   git revert <commit-hash>
   git push origin main
   # Railway auto-deploys reverted code
   ```

3. **Verify Revert:**
   ```bash
   # Check deployment logs
   railway logs | tail -50
   ```

---

### Scenario 2: Database Migration Failure

If migration breaks database:

1. **Check Migration Status:**
   ```bash
   # Query schema_migrations table
   node -e "require('./db/supabase-client').supabase.from('schema_migrations').select('*').order('version',{ascending:false}).limit(5).then(d=>console.log(d.data))"
   ```

2. **Run Rollback Script:**
   ```bash
   # If migration has rollback SQL
   node migrations/rollback_<version>.js
   ```

3. **Revert Code:**
   ```bash
   git revert <migration-commit>
   git push
   ```

**Prevention:** Test migrations locally before deploying. Never run migrations directly in production without testing.

---

## Monitoring & Health Checks

### Real-Time Monitoring

#### Railway Dashboard

Access logs in real-time:
```bash
railway logs --follow
```

Or in web dashboard:
- railway.app → Your Project → Logs

#### Health Endpoint

Poll every 5 minutes:
```bash
while true; do
  curl -s https://[your-url]/health | jq '.status'
  sleep 300
done
```

#### Error Logs

Watch for errors:
```bash
railway logs | grep -i error
```

### Daily Health Checks

Run these checks daily:

```bash
# 1. Check health status
curl https://[your-url]/health

# 2. Check last email scan
railway logs | grep "Email scanning" | tail -5

# 3. Check last briefing generation
railway logs | grep "Briefing generation" | tail -5

# 4. Check for errors
railway logs | grep -c "error" | tail -100
```

### Setting Up Alerts

#### Option 1: Railway Notifications

In Railway dashboard:
- Settings → Notifications
- Enable "Deployment Failed"
- Enable "Service Crashed"

#### Option 2: External Monitoring (Recommended)

Use a service like:
- **UptimeRobot**: Free, checks health endpoint every 5 minutes
- **BetterUptime**: More features, paid
- **StatusCake**: Free tier available

Configure to check:
```
URL: https://[your-url]/health
Method: GET
Expected: Status 200
Keyword: "healthy"
Check Interval: 5 minutes
```

### Performance Metrics

Track these over time:

- **Response Time**: Should be < 500ms
- **Error Rate**: Should be < 1%
- **Job Success Rate**: Should be > 95%
- **Database Query Time**: Should be < 100ms

---

## Best Practices

### Deployment Best Practices

1. **Always Test Locally First**
   ```bash
   npm run dev
   # Test all critical paths
   ```

2. **Use Descriptive Commit Messages**
   ```bash
   # Good
   git commit -m "Fix duplicate detection in email handler"

   # Bad
   git commit -m "fix bug"
   ```

3. **Deploy During Low-Traffic Times**
   - Best: Late evening or early morning
   - Avoid: Peak business hours

4. **Monitor After Deployment**
   - Watch logs for 10 minutes
   - Check health endpoint
   - Test critical features

5. **Have Rollback Plan Ready**
   - Know the last working deployment
   - Keep previous version hash handy

### Code Quality Before Deployment

- ✅ No console.log (use logger)
- ✅ No hardcoded credentials
- ✅ All env vars documented
- ✅ Syntax validated (run `node -c file.js`)
- ✅ No obvious errors in local testing

---

## Support & Troubleshooting

### Getting Help

1. **Check this document** for common issues
2. **Review Railway logs** for specific errors
3. **Check Supabase dashboard** for database issues
4. **Review recent commits** for breaking changes

### Useful Commands

```bash
# Railway commands
railway logs                    # View logs
railway logs --tail 100        # Last 100 lines
railway logs | grep error      # Filter errors
railway status                 # Service status
railway variables              # List env vars

# Health checks
curl https://[your-url]/health                  # System health
curl https://[your-url]/api/calendar/brief?days=1  # Test calendar

# Database checks
node scripts/diagnostics/check-db.js            # Database connection
node scripts/diagnostics/check-events.js        # Event data integrity
```

### Emergency Contacts

- **Repository**: https://github.com/tomsuharto-git/playbook-backend
- **Railway Dashboard**: https://railway.app
- **Supabase Dashboard**: https://supabase.com

---

**Document Version**: 1.0
**Last Updated**: November 6, 2025
**Next Review**: After Phase 6 completion
