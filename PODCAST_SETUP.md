# Daily Morning Podcast Setup Instructions

## Step 1: Create Database Table

You need to create the `daily_podcasts` table in Supabase:

1. Go to your Supabase dashboard: https://supabase.com/dashboard
2. Select your project
3. Navigate to **SQL Editor** (left sidebar)
4. Click **New Query**
5. Open the file: `backend/db/migration_003_daily_podcasts.sql`
6. Copy the entire contents
7. Paste into the SQL Editor
8. Click **Run**

You should see: "Daily podcasts table created successfully!"

## Step 2: Test Markdown Generation

Once the table is created, test the markdown generation:

```bash
cd backend
node test-podcast-generator.js
```

This will:
- Query your database for today's tasks, projects, and calendar
- Generate a complete podcast script
- Save it to `backend/test-podcast-output.md`
- Show you a preview

## Step 3: Add Environment Variables

Add these to your `.env` file:

```bash
# ElevenLabs API (required for podcast generation)
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here

# Backend URL (for webhooks)
BACKEND_URL=http://localhost:3001  # or your Railway URL

# OpenWeather API (optional, falls back to mock data)
OPENWEATHER_API_KEY=your_openweather_api_key_here
```

Get your ElevenLabs API key:
1. Sign up at: https://elevenlabs.io
2. Go to: Profile → API Keys
3. Create a new key

## Step 4: Manual Test API Integration

Once you have the ElevenLabs API key set, you can test the full integration:

```bash
# Create podcast route for manual testing
curl -X POST http://localhost:3001/api/podcast/generate
```

## Step 5: Schedule Daily Generation

The cron job will be added to `server.js` to run at 6 AM daily.

## Testing Checklist

- [ ] Database table created
- [ ] Markdown generation works (`test-podcast-generator.js`)
- [ ] `.env` has `ELEVENLABS_API_KEY`
- [ ] API route created (`/api/podcast/generate`)
- [ ] Webhook handler created (`/api/podcast/webhook`)
- [ ] Cron job scheduled for 6 AM
- [ ] Test end-to-end podcast creation

## Troubleshooting

**"Could not find table 'daily_podcasts'"**
- Run the SQL migration in Supabase SQL Editor

**"ELEVENLABS_API_KEY not set"**
- Add your API key to `.env` file

**"No calendar events"**
- Make sure you have a `daily_briefs` entry for today
- Or test with a date that has data

## Next Steps

After testing markdown generation, we'll:
1. Create the API routes (`/api/podcast/*`)
2. Create the webhook handler
3. Integrate ElevenLabs API
4. Add the 6 AM cron job
5. Test end-to-end
