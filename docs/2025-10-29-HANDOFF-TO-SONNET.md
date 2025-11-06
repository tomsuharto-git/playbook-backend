# Handoff to Sonnet - October 29, 2025

**From:** Claude Opus 4.1
**To:** Claude Sonnet
**Time:** ~9:00 AM ET
**Context:** Phase 2 Architecture deployment and documentation

---

## 🎯 IMMEDIATE PRIORITY: Fix Calendar Routes on Railway

### The Problem
The `/api/calendar/brief` endpoint returns 404 on production but works locally.

**Production URL:** `https://playbook-production.up.railway.app/api/calendar/brief`
**Frontend trying to reach:** This endpoint from `https://angelic-determination-production.up.railway.app`

### What We Know
1. The route EXISTS in `backend/routes/calendar.js` (line 13: `router.get('/brief', ...`)
2. Routes load successfully locally when running `node server-railway.js`
3. Routes fail to load on Railway deployment
4. The try/catch in server-railway.js isn't catching an error - it's likely the route file exists but something inside it fails

### Debugging Steps to Try
```bash
# 1. Check Railway logs for the actual error
cd /Users/tomsuharto/Documents/Obsidian\ Vault/ai-task-manager
railway logs

# 2. Look for the calendar routes loading message
# Should see either:
# "✅ Calendar routes loaded at /api/calendar"
# OR
# "⚠️ Calendar routes not available"

# 3. Test the endpoint directly
curl -I https://playbook-production.up.railway.app/api/calendar/brief
```

### Likely Causes
1. **Missing dependencies in calendar.js** - Check if all requires work in Railway environment
2. **Environment variable issues** - Calendar.js might expect vars that don't exist
3. **File path issues** - Railway file structure might be different

### Files to Check
- `backend/routes/calendar.js` - The route definition
- `backend/server-railway.js` - How routes are loaded (lines 60-66)
- `backend/services/google-calendar.js` - Used by calendar routes
- `backend/services/event-briefing.js` - Also used by calendar routes

---

## 📊 Current System State

### Phase 2 Architecture Status
**Partially Deployed** - Core architecture working but integration incomplete

**What's Working:**
- ✅ Central Processor (`backend/services/central-processor.js`)
- ✅ Unified Email Handler (`backend/services/unified-email-handler.js`)
- ✅ New database tables (events, narratives, news)
- ✅ Railway deployment with `server-railway.js`
- ✅ CORS fixed (adds https:// prefix automatically)
- ✅ False positive rate reduced from 50% to 30%

**What's NOT Working:**
- ❌ Calendar routes on Railway (404 error)
- ❌ Frontend using old data structure (reads from JSONB not new tables)
- ❌ Email scanning not configured on Railway (no Gmail/Outlook credentials)
- ❌ Data migration incomplete (events/narratives still in JSONB)

### Server Files Overview
```
backend/
├── server.js              # OLD - Phase 1 (don't use)
├── server-railway.js      # CURRENT - Production on Railway
├── server-phase2.js       # Full Phase 2 (local only, has vault watcher)
└── test-server.js         # Testing server
```

**Important:** Railway uses `server-railway.js` via `npm start` command in package.json

---

## 🔧 What Was Done Today (October 29)

### 1. Deployed Phase 2 Architecture
- Created `server-railway.js` for cloud deployment (no vault dependencies)
- Fixed CORS to add https:// prefix
- Attempted to load routes with try/catch blocks

### 2. Documentation Created
- `backend/PHASE2_IMPLEMENTATION_STATUS.md` - Complete current state
- `DOCUMENTATION_INDEX.md` - Shows what docs are current vs outdated
- Updated `README.md` with Phase 2 status
- Updated `DEPLOYMENT.md` with today's deployment

### 3. Discovered Issues
- Calendar routes not loading on Railway
- Frontend needs updating to use new tables

---

## 🚀 Next Steps (In Priority Order)

### 1. Fix Calendar Routes (HIGH PRIORITY)
```javascript
// The problematic code in server-railway.js:
try {
  const calendarRoutes = require('./routes/calendar');
  app.use('/api/calendar', calendarRoutes);
  console.log('✅ Calendar routes loaded at /api/calendar');
} catch (e) {
  console.log('⚠️  Calendar routes not available');
}
```

**Actions:**
1. Add more detailed error logging
2. Check if calendar.js dependencies are available
3. Test with a minimal calendar route
4. Consider moving route logic directly into server-railway.js as temporary fix

### 2. Update Frontend to Use New Tables
```typescript
// Frontend needs to change from:
const events = daily_briefs.calendar_events; // OLD

// To:
const { data: events } = await supabase
  .from('events')
  .select('*')
  .eq('project_id', projectId); // NEW
```

### 3. Complete Data Migration
```bash
# Run the migration script
cd /Users/tomsuharto/Documents/Obsidian\ Vault/ai-task-manager
node backend/migrations/migrate-phase2.js

# Verify in Supabase
SELECT COUNT(*) FROM events;
SELECT COUNT(*) FROM narratives;
```

### 4. Add Email Scanning to Railway
Add these environment variables to Railway:
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `OUTLOOK_CLIENT_ID`
- `OUTLOOK_CLIENT_SECRET`

---

## 🛠️ Quick Commands

### Check Railway Deployment
```bash
cd /Users/tomsuharto/Documents/Obsidian\ Vault/ai-task-manager
railway status
railway logs
```

### Test Locally with Railway Server
```bash
cd /Users/tomsuharto/Documents/Obsidian\ Vault/ai-task-manager/backend
PORT=3002 node server-railway.js
# Then test: curl http://localhost:3002/api/calendar/brief
```

### Deploy Changes
```bash
cd /Users/tomsuharto/Documents/Obsidian\ Vault/ai-task-manager
git add .
git commit -m "Fix calendar routes"
git push origin main
# Railway auto-deploys from main branch
```

---

## 📁 Key File Locations

### Documentation
- `backend/PHASE2_IMPLEMENTATION_STATUS.md` - Read this first!
- `DOCUMENTATION_INDEX.md` - Shows all docs status
- `backend/THREE_ENTITY_ARCHITECTURE_IMPLEMENTATION.md` - Original plan

### Core Phase 2 Files
- `backend/services/central-processor.js` - Heart of Phase 2
- `backend/services/unified-email-handler.js` - Email processing
- `backend/server-railway.js` - Production server

### Problem Files
- `backend/routes/calendar.js` - Has the /brief endpoint that's 404ing
- `frontend/app/briefs/page.tsx` - Trying to call the endpoint

---

## 🔍 Background Processes Running

Multiple dev servers are running in background (can be ignored or killed):
- Several `npm run dev` processes
- `railway logs` monitoring
- Test servers

To kill all if needed:
```bash
killall node
```

---

## 💡 Important Context

1. **Railway URLs:**
   - Frontend: `https://angelic-determination-production.up.railway.app`
   - Backend: `https://playbook-production.up.railway.app`

2. **The user (Tom) wants:**
   - Phase 2 working in production
   - Reduced false positives (achieved: 50% → 30%)
   - Three-entity architecture (Tasks, Events, Narratives)

3. **Don't:**
   - Use server.js (it's the old Phase 1)
   - Forget to test locally before deploying
   - Mix frontend and backend deployments (they're separate services)

---

## 🎯 Success Criteria

You'll know you've succeeded when:
1. `curl https://playbook-production.up.railway.app/api/calendar/brief` returns data (not 404)
2. Frontend brief page loads without errors
3. Railway logs show "✅ Calendar routes loaded at /api/calendar"

---

**Good luck! The main issue is the calendar routes. Once that's fixed, Phase 2 will be largely operational.**

**P.S.** If you get stuck on the routes issue, consider temporarily adding the brief endpoint directly to server-railway.js instead of loading it from a separate file. This would at least unblock the frontend while you debug the module loading issue.