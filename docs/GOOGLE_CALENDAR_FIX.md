# Google Calendar Integration Fix

**Date:** October 28, 2025
**Issue:** Google Calendar events not appearing in briefings
**Status:** ✅ Fixed

---

## Problem

Google Calendar events were not appearing in daily briefings on the production Railway deployment. The logs showed:

```
📊 Grand Total: 9 events
     - Google: 0
     - Outlook: 9
```

### Root Cause

The Google Calendar service was **hardcoded to read credentials from local files**:

```javascript
// ❌ OLD CODE - Only works locally
const CREDENTIALS_PATH = path.join(__dirname, '../../..', 'credentials.json');
const TOKEN_PATH = path.join(__dirname, '../../..', 'token.json');

const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
```

**Issues:**
1. These files don't exist on Railway (they're in `.gitignore`)
2. The service threw `ENOENT: no such file or directory` errors
3. The error was caught and the service returned an empty array `[]`
4. **Result:** 0 Google Calendar events fetched at 6am, 12pm, and 6pm briefing generation

**Why Gmail worked but Google Calendar didn't:**
- Gmail scanner (`jobs/gmail-scanner.js`) already had environment variable support via `config/gmail-config.js`
- Google Calendar service (`services/google-calendar.js`) did not have this support

---

## Solution

### 1. Created Config Helper

Created `backend/config/google-calendar-config.js` that supports both deployment environments:

```javascript
function getGoogleCalendarCredentials() {
  // Railway/Production: use environment variable
  if (process.env.GOOGLE_CALENDAR_CREDENTIALS) {
    return JSON.parse(process.env.GOOGLE_CALENDAR_CREDENTIALS);
  }

  // Local: use file
  return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
}

function getGoogleCalendarToken() {
  // Railway/Production: use environment variable
  if (process.env.GOOGLE_CALENDAR_TOKEN) {
    return JSON.parse(process.env.GOOGLE_CALENDAR_TOKEN);
  }

  // Local: use file
  return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
}
```

**Key features:**
- Checks for environment variables first (Railway)
- Falls back to files for local development
- Consistent with existing Gmail config pattern
- Throws clear errors if neither source is available

### 2. Fixed Path Bug

Fixed incorrect VAULT_ROOT calculation:

```javascript
// ❌ OLD - Pointed 4 levels up (wrong)
const VAULT_ROOT = path.join(__dirname, '../../../..');

// ✅ NEW - Points 3 levels up (correct)
// From config/ -> backend/ -> ai-task-manager/ -> Obsidian Vault/
const VAULT_ROOT = path.join(__dirname, '../../..');
```

### 3. Updated Google Calendar Service

Modified `backend/services/google-calendar.js`:

```javascript
// ❌ OLD
const fs = require('fs');
const CREDENTIALS_PATH = path.join(VAULT_ROOT, 'credentials.json');
const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));

// ✅ NEW
const { getGoogleCalendarCredentials, getGoogleCalendarToken } = require('../config/google-calendar-config');
const credentials = getGoogleCalendarCredentials();
const token = getGoogleCalendarToken();
```

### 4. Added Railway Environment Variables

Set environment variables in Railway dashboard:

```bash
GOOGLE_CALENDAR_CREDENTIALS='{"installed":{"client_id":"157626933281-...","project_id":"dailybriefing-474205","auth_uri":"...","token_uri":"...","client_secret":"GOCSPX-...","redirect_uris":["http://localhost"]}}'

GOOGLE_CALENDAR_TOKEN='{"access_token":"ya29.a0AQQ_BD...","refresh_token":"1//05xIMgNeou0UIC...","scope":"https://www.googleapis.com/auth/calendar.readonly","token_type":"Bearer","expiry_date":1761068895495}'
```

**How to set:**
```bash
railway variables --set 'GOOGLE_CALENDAR_CREDENTIALS=...'
railway variables --set 'GOOGLE_CALENDAR_TOKEN=...'
```

---

## Files Changed

### New Files
- `backend/config/google-calendar-config.js` - Config helper for credentials

### Modified Files
- `backend/services/google-calendar.js` - Updated to use config helper
- `DEPLOYMENT.md` - Added documentation and environment variables

### Commit
```bash
git commit ff82a593
"Fix Google Calendar integration - add environment variable support"
```

---

## How It Works

### Local Development
1. Reads `credentials.json` and `token.json` from Obsidian Vault root
2. Uses file system access (works on your machine)
3. No environment variables needed

### Railway Production
1. Checks for `GOOGLE_CALENDAR_CREDENTIALS` environment variable
2. Checks for `GOOGLE_CALENDAR_TOKEN` environment variable
3. Parses JSON strings into objects
4. Creates OAuth2 client with parsed credentials

### Briefing Generation Flow

```
6am, 12pm, 6pm ET (scheduled)
    ↓
generateBriefings() job runs
    ↓
fetchTodaysEvents() called
    ↓
getCalendarClient()
    ↓
getGoogleCalendarCredentials() → Checks env var → Falls back to file
    ↓
getGoogleCalendarToken() → Checks env var → Falls back to file
    ↓
Creates OAuth2 client
    ↓
Fetches events from 3 calendars:
  - tomsuharto@gmail.com (Personal)
  - 67qeidqgbdro795lpr2dc9miho@group.calendar.google.com (Family)
  - fv18afmp4k955cpl6jgb1gu21a7c6khm@import.calendar.google.com (Work)
    ↓
Normalizes events
    ↓
Combines with Outlook events
    ↓
Deduplicates
    ↓
Categorizes (Google → Life, Outlook → Work)
    ↓
Saves to database
    ↓
Displays in brief page
```

---

## Testing

### Local Testing
```bash
cd backend
node -e "
const { getGoogleCalendarCredentials, getGoogleCalendarToken } = require('./config/google-calendar-config');
const creds = getGoogleCalendarCredentials();
const token = getGoogleCalendarToken();
console.log('✅ Credentials loaded');
console.log('Client ID:', creds.installed.client_id);
console.log('Token scopes:', token.scope);
"
```

### Production Testing
1. Wait for next scheduled briefing (12pm, 6pm ET)
2. Check Railway logs for:
   ```
   📅 Fetching Google Calendar events...
   ✅ Fetched X Google Calendar events
   Sources: X Google + Y Outlook
   - Google: X (should be > 0)
   - Outlook: Y
   ```
3. Check brief page for "Life Events" section with Google Calendar events

---

## Expected Results

After the fix:
- ✅ Google Calendar events appear in briefings
- ✅ Events categorized as "Life Events" (Gmail = Life by default)
- ✅ Events from all 3 calendars included
- ✅ Deduplication works between Google and Outlook
- ✅ No more "0 Google events" in logs

**Example log output:**
```
📊 Grand Total: 12 events
     - Google: 3
     - Outlook: 9
```

---

## Maintenance

### Token Refresh

Google OAuth2 tokens expire. If you see authentication errors:

1. **Regenerate token locally:**
   ```bash
   cd backend/scripts
   node authorize-google-calendar.js
   ```

2. **Copy new token:**
   ```bash
   cat ../../../token.json
   ```

3. **Update Railway environment variable:**
   ```bash
   railway variables --set 'GOOGLE_CALENDAR_TOKEN=<new-token-json>'
   ```

### Adding More Calendars

Edit `backend/services/google-calendar.js`:

```javascript
const CALENDARS = {
  'tomsuharto@gmail.com': 'Personal',
  '67qeidqgbdro795lpr2dc9miho@group.calendar.google.com': 'Family',
  'new-calendar@group.calendar.google.com': 'New Calendar'  // Add here
};
```

---

## Related Systems

### Gmail Integration (Already Working)
- Uses same pattern with `config/gmail-config.js`
- Environment variables: `GMAIL_CREDENTIALS`, `GMAIL_TOKEN`
- Fetches emails 3x daily at 6am, 12pm, 6pm ET
- Creates task summaries in Obsidian

### Outlook Integration (Working)
- Reads events from Google Drive CSV export
- Already had proper file handling
- Environment variables not needed (uses Drive API)

### Brief Generation Schedule
- **Cron:** `0 6,12,18 * * *` (6am, 12pm, 6pm ET)
- **Job:** `backend/jobs/generate-briefings.js`
- **API:** POST `/api/calendar/regenerate` (manual trigger)

---

## Troubleshooting

### "No Google events" in logs
- Check environment variables are set in Railway
- Verify JSON is valid (no trailing commas, proper escaping)
- Check Railway logs for auth errors

### "Invalid grant" errors
- Token expired - regenerate using steps above
- Refresh token revoked - re-authorize app

### Path errors
- Verify VAULT_ROOT points to correct directory
- Check file paths are correct for your environment

---

## References

- **Config Pattern:** Inspired by `backend/config/gmail-config.js`
- **Google Calendar API:** https://developers.google.com/calendar/api
- **OAuth2 Flow:** https://developers.google.com/identity/protocols/oauth2
- **Railway Env Vars:** https://docs.railway.app/develop/variables
