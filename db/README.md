# Database Schema Files

This directory contains the database schema for the Playbook system.

## Files

### `schema_playbook.sql` (NEW - Complete Schema)
**Use this for:** Fresh Supabase installations

This is the complete, updated schema for the Playbook system. It includes:
- Enhanced tasks table with pending approval flow
- Updated projects table with objectives and team tracking
- New daily_briefs table (migrated from GitHub Pages)
- New chat_history table
- Updated views and indexes
- Helper functions for ranking and progress calculation

**How to use:**
1. Go to your Supabase project
2. Open SQL Editor
3. Copy and paste the entire contents of `schema_playbook.sql`
4. Run it
5. Verify success message appears

### `migration_001_playbook_schema.sql` (Migration)
**Use this for:** Existing databases that already have the old schema

This migration script updates your existing database schema to the new Playbook design. It:
- Adds new columns to existing tables
- Updates constraints and indexes
- Creates new tables (daily_briefs, chat_history)
- Updates views
- Preserves existing data

**How to use:**
1. **BACKUP YOUR DATABASE FIRST** (Supabase > Database > Backups)
2. Go to Supabase SQL Editor
3. Copy and paste the entire contents of `migration_001_playbook_schema.sql`
4. Run it
5. Verify success message appears

### `schema.sql` (LEGACY - Original Schema)
**Do not use for new installations.**

This is the original schema from the ai-task-manager prototype. It's kept for reference only.

## Key Schema Changes

### Tasks Table
**New fields:**
- `description` - One sentence description
- `context` - 'Work' or 'Life'
- `extra_tags` - Array of tags (Client, Meeting, etc.)
- `icon` - Emoji chosen by AI
- `urgency` - 'Now', 'Soon', or 'Eventually'
- `rank` - AI power ranking (lower = higher priority)
- `task_type` - Distinguish tasks, team objectives, delegated work
- `pending_changes` - JSONB for AI-suggested modifications
- `confidence` - AI confidence score (0-1)
- `detection_reasoning` - Why AI created this task

**Updated fields:**
- `status` - Now: 'pending', 'active', 'blocked', 'complete', 'dismissed'
  - Old 'todo' → 'pending'
  - Old 'in-progress' → 'active'

### Projects Table
**New fields:**
- `lead` - Project lead name
- `objectives` - Team-level goals (JSONB array)
- `vault_folders` - Related Obsidian paths
- `last_activity` - Last update timestamp

### New Tables

#### `daily_briefs`
Stores daily briefing data (migrated from GitHub Pages system)
- Calendar events with AI analysis
- Vault context and attendee info
- Weather data
- Related tasks mapped to events
- HTML and Markdown content

#### `chat_history`
Stores chat conversations with AI
- User and assistant messages
- References to tasks and projects mentioned
- Chronological log

### New Views

#### `pending_tasks`
Shows all AI-detected tasks awaiting user approval, sorted by confidence score.

#### `active_tasks`
Shows all pending, active, and blocked tasks, sorted by urgency → rank → due date.

#### `project_stats`
Aggregated project statistics including task counts by status and progress calculations.

## Verification

After running either schema file, verify the setup:

```sql
-- Check that all tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'projects',
  'tasks',
  'daily_briefs',
  'chat_history',
  'meeting_notes',
  'user_preferences',
  'task_completions'
);

-- Check that new task columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'tasks'
AND column_name IN ('description', 'context', 'extra_tags', 'icon', 'urgency', 'rank', 'pending_changes');

-- Check that views were created
SELECT table_name
FROM information_schema.views
WHERE table_schema = 'public'
AND table_name IN ('active_tasks', 'pending_tasks', 'project_stats');

-- Test helper function
SELECT calculate_task_rank('Now', CURRENT_DATE + 1, 'high');
```

## Next Steps After Schema Setup

1. Update environment variables in `backend/.env`:
   ```
   SUPABASE_URL=your_project_url
   SUPABASE_KEY=your_anon_key
   ```

2. Update frontend environment in `frontend/.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   ```

3. Test the connection:
   ```bash
   cd backend
   node db/setup.js
   ```

4. Start the application and verify data flows correctly

## Rollback (If Needed)

If something goes wrong with the migration, you can restore from your Supabase backup:

1. Go to Supabase Dashboard
2. Database → Backups
3. Find your pre-migration backup
4. Click "Restore"

## Support

If you encounter issues:
1. Check Supabase logs for SQL errors
2. Verify all tables and columns were created
3. Ensure RLS policies are active
4. Test views with sample queries
