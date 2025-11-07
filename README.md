# Playbook Backend - AI Task Manager

AI-powered personal productivity system with automated email scanning, task management, calendar integration, and daily briefings.

## Architecture

**Phase 2: Three-Entity Model**
- **Tasks**: Actionable items extracted from emails/events
- **Events**: Calendar appointments and meetings
- **Narratives**: Project-based context and summaries

## Project Structure

```
playbook-backend/
├── server-railway.js       # Production server (Railway deployment)
├── package.json           # Dependencies and scripts
├── railway.toml          # Railway deployment configuration
│
├── config/               # Unified configuration system
│   ├── index.js         # Central config (USE THIS)
│   ├── gmail-config.js
│   ├── google-calendar-config.js
│   ├── project-folder-mappings.js
│   └── qc-config.js
│
├── services/            # Core business logic
│   ├── central-processor.js      # Main AI processing pipeline
│   ├── unified-email-handler.js  # Email processing coordination
│   ├── quality-control-service.js
│   ├── recurring-tasks-scheduler.js
│   └── [other services]
│
├── routes/              # Express API endpoints
│   ├── calendar.js      # Calendar operations
│   ├── events.js        # Event CRUD
│   ├── projects.js      # Project management
│   ├── podcast.js       # Podcast features
│   ├── weather.js       # Weather integration
│   └── admin.js         # Admin operations
│
├── jobs/                # Scheduled background jobs
│   ├── email-scanning-job.js     # Scans email every 30 mins
│   ├── quality-control-job.js    # QC every 6 hours
│   └── generate-briefings.js     # Briefings 3x daily
│
├── db/                  # Database utilities
│   └── supabase.js      # Supabase client
│
├── migrations/          # Database schema migrations
│   └── [SQL migration files]
│
├── scripts/             # Utility and maintenance scripts
│   ├── diagnostics/     # check-*, debug-*, analyze-* scripts
│   ├── cleanup/         # cleanup-*, delete-* scripts
│   ├── backfill/        # backfill-* scripts
│   └── migration/       # data migration scripts
│
├── archive/             # Obsolete/deprecated files
│
└── docs/                # Documentation (moved from root)
    ├── STABILIZATION_PLAN.md
    ├── BRIEF_PAGE_*.md
    ├── DUPLICATE_*.md
    └── [other documentation]
```

## Configuration

All configuration is centralized in `config/index.js`:

```javascript
const config = require('./config');

// Database
const supabase = createClient(config.database.url, config.database.key);

// AI
const anthropic = new Anthropic({ apiKey: config.ai.anthropic.apiKey });

// Feature flags
if (config.features.emailScanning) {
  // ...
}
```

**Benefits:**
- Single source of truth for all settings
- Environment variable validation
- Easy to discover what configuration exists
- Prevents config sprawl

## Environment Variables

Required:
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_KEY` - Supabase anon/service key
- `ANTHROPIC_API_KEY` - Claude API key

Optional (Email):
- `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`
- `OUTLOOK_CLIENT_ID`, `OUTLOOK_CLIENT_SECRET`, `OUTLOOK_REFRESH_TOKEN`

Optional (Calendar):
- `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REFRESH_TOKEN`

Optional (Other):
- `OPENWEATHER_API_KEY` - Weather data
- `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` - OneDrive access
- `FRONTEND_URL` - Frontend origin for CORS
- `PORT` - Server port (default: 3001)

See `config/index.js` for complete list.

## Scheduled Jobs

All jobs run on Eastern Time (America/New_York):

1. **Email Scanning** - Every 30 minutes
   - Scans Gmail/Outlook for new emails
   - Processes with Central Processor
   - Creates tasks/events/narratives

2. **Quality Control** - Every 6 hours (12am, 6am, 12pm, 6pm)
   - Reviews database consistency
   - Detects duplicate tasks/events
   - Cleans up malformed data

3. **Briefing Generation** - 3x daily (6am, 12pm, 6pm)
   - Generates AI-powered daily briefings
   - Summarizes upcoming events
   - Highlights priority tasks

## API Endpoints

### Calendar
- `GET /api/calendar/brief?date=YYYY-MM-DD` - Get briefing for date
- `POST /api/calendar/events` - Create event
- `PUT /api/calendar/events/:id` - Update event
- `DELETE /api/calendar/events/:id` - Delete event

### Tasks
- `GET /api/tasks` - List tasks
- `POST /api/tasks` - Create task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task

### Projects
- `GET /api/projects` - List projects
- `POST /api/projects` - Create project

### Manual Operations
- `POST /api/email/scan` - Trigger email scan
- `POST /api/process` - Process input manually
- `POST /api/phase2/test` - Test Phase 2 processing

### Health
- `GET /health` - Server health status

## Database Schema (Supabase)

Key tables:
- `tasks` - Actionable items
- `events` - Calendar appointments
- `narratives` - Project context
- `daily_briefs` - Generated briefings
- `projects` - Project metadata
- `processed_emails` - Email processing log

## Deployment (Railway)

**Auto-deploy:** Pushes to GitHub automatically deploy to Railway.

**Quick verification after deployment:**
```bash
npm run verify:deployment
```

**Manual operations:**
```bash
# View logs
railway logs

# Trigger redeploy (if needed)
# Go to Railway dashboard → Deployments → Redeploy

# Check deployment status
railway status
```

**Important:** If Railway serves stale code after a push, manually click "Redeploy" in the Railway dashboard to clear build cache.

For comprehensive deployment documentation, troubleshooting, and best practices, see **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

## Development

```bash
# Install dependencies
npm install

# Run locally (requires .env file)
node server-railway.js

# Run diagnostic scripts
node scripts/diagnostics/check-db.js
node scripts/diagnostics/check-events.js

# Run cleanup scripts
node scripts/cleanup/cleanup-duplicates.js
```

## Phase 2 Migration Status

**✅ Complete:**
- Three-entity model implemented
- Normalized database tables created
- Central processor running
- Email scanning active

**✅ Stabilization Complete (Phases 1-5):**
- Phase 1: Foundation - Code organization and documentation
- Phase 2: Data Consistency - Normalized database tables
- Phase 3: Winston Logging - Centralized structured logging
- Phase 4: Duplicate Detection - Unified similarity matching
- Phase 5: Railway & Deployment - Complete deployment documentation

See `docs/STABILIZATION_PLAN.md` for detailed refactoring roadmap.
See `DEPLOYMENT.md` for comprehensive deployment guide.

## Troubleshooting

**Email scanning not working:**
1. Check Railway logs: `railway logs | grep -i email`
2. Verify email provider credentials in Railway variables
3. Test endpoint: `curl -X POST https://[your-railway-url].up.railway.app/api/email/scan`

**Railway deploying old code:**
1. Verify latest commit pushed to GitHub: `git log -1`
2. Check Railway dashboard for deployment status
3. If needed, manually "Redeploy" to clear cache

**Database connection errors:**
1. Verify `SUPABASE_URL` and `SUPABASE_KEY` in Railway variables
2. Check Supabase project status at supabase.com
3. Test connection: `node scripts/diagnostics/check-db.js`

## Contributing

When adding new features:
1. Use `config/index.js` for all configuration
2. Add documentation to appropriate files in `docs/`
3. Create diagnostic scripts in `scripts/diagnostics/` for testing
4. Update this README if adding new API endpoints or jobs

## License

Private project - All rights reserved
