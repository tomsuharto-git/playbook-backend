# Podcast Generation System

An automated daily morning podcast generator that creates conversational briefings using Claude AI and ElevenLabs text-to-speech.

## Overview

The podcast generation system creates daily morning briefings with two AI hosts discussing:
- Today's calendar events
- Urgent tasks organized by Work/Code/Life
- Recent project narratives
- Weather and time/energy management

### Architecture: Claude Script + Multi-Voice TTS

1. **Data Collection**: Gathers calendar events, tasks, projects, and weather
2. **Markdown Generation**: Creates structured briefing script
3. **Claude Script Writing**: Uses Claude Sonnet 4 to write natural conversational dialogue between two hosts
4. **TTS Generation**: Uses ElevenLabs API to generate audio for each dialogue line
5. **Audio Concatenation**: Uses ffmpeg to combine all segments into final podcast
6. **Database Storage**: Saves metadata and audio path to Supabase

## Prerequisites

### 1. Install ffmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install ffmpeg
```

**Windows:**
Download from https://ffmpeg.org/download.html

### 2. Environment Variables

Add to your `.env` file:

```bash
# Anthropic API (for Claude script writing)
ANTHROPIC_API_KEY=your_anthropic_api_key

# ElevenLabs API (for text-to-speech)
ELEVENLABS_API_KEY=your_elevenlabs_api_key

# Podcast voice selection
PODCAST_VOICE_1=voice_id_for_host_1  # The Strategist
PODCAST_VOICE_2=voice_id_for_host_2  # The Maker

# Backend URL (for webhooks if needed)
BACKEND_URL=http://localhost:3001
```

### 3. Choose ElevenLabs Voices

Visit https://elevenlabs.io/app/voice-library to browse voices.

**Recommended character profiles:**

**Host 1 - The Strategist:**
- Curious and provocative thinker
- Direct and incisive about priorities
- Plans multiple steps ahead
- Serious but warm tone

**Host 2 - The Maker:**
- Creative and inventive thinker
- Funny and irreverent
- Dreams big while staying practical
- Energetic and upbeat tone

Copy the voice IDs and add them to your `.env` file.

## Usage

### Manual Generation

```bash
# Using the API endpoint
curl -X POST http://localhost:3001/api/podcast/generate

# Or run the test script
node backend/test-podcast-claude.js
```

### Automated Daily Generation

The system includes a cron job that runs at 6 AM ET daily:

```javascript
// backend/jobs/generate-podcast.js
cron.schedule('0 6 * * *', async () => {
  await generateDailyPodcast();
}, { timezone: 'America/New_York' });
```

## API Endpoints

### POST /api/podcast/generate
Manually trigger podcast generation for today.

**Response:**
```json
{
  "success": true,
  "date": "2025-10-11",
  "status": "ready",
  "message": "Podcast generated successfully!",
  "audio_path": "/path/to/podcast_2025-10-11.mp3",
  "duration_seconds": 485,
  "dialogue_count": 52,
  "markdown_preview": "# Good Morning Tom..."
}
```

### GET /api/podcast/latest
Get today's podcast (or most recent).

**Response:**
```json
{
  "success": true,
  "podcast": {
    "date": "2025-10-11",
    "status": "ready",
    "audio_url": "/path/to/podcast_2025-10-11.mp3",
    "duration_seconds": 485,
    "generated_at": "2025-10-11T06:00:00.000Z",
    "completed_at": "2025-10-11T06:08:23.000Z"
  }
}
```

### GET /api/podcast/:date
Get podcast for specific date (YYYY-MM-DD).

**Example:**
```bash
curl http://localhost:3001/api/podcast/2025-10-11
```

### GET /api/podcast/audio/:date
Stream podcast audio file.

**Example:**
```bash
# Play in browser
open http://localhost:3001/api/podcast/audio/2025-10-11

# Download
curl http://localhost:3001/api/podcast/audio/2025-10-11 -o podcast.mp3
```

## File Structure

```
backend/
├── services/
│   ├── podcast-generator.js          # Main orchestration service
│   ├── claude-podcast-writer.js      # Claude script writing
│   ├── elevenlabs-tts.js             # Text-to-speech generation
│   └── audio-concatenator.js         # ffmpeg audio concatenation
├── routes/
│   └── podcast.js                    # API endpoints
├── jobs/
│   └── generate-podcast.js           # Cron job scheduler
├── db/
│   └── migration_003_daily_podcasts.sql  # Database schema
├── podcasts/                         # Generated audio files (gitignored)
│   └── podcast_YYYY-MM-DD.mp3
└── temp/                             # Temporary audio segments (gitignored)
    └── podcast_YYYY-MM-DD/
        ├── segment_000.mp3
        ├── segment_001.mp3
        └── ...
```

## How It Works

### 1. Markdown Generation
```javascript
const result = await podcastGenerator.generateMorningPodcast();
// Returns structured markdown briefing
```

### 2. Claude Script Writing
```javascript
const script = await claudeWriter.writeScript(markdown, date);
// Returns: { date, dialogue: [{host: 1, text: "..."}, ...], estimatedDuration }
```

Claude uses a detailed prompt with character profiles and conversation guidelines to write natural dialogue between two hosts.

### 3. TTS Generation
```javascript
const audioPaths = await elevenLabsTTS.generateDialogueAudio(
  script.dialogue,
  segmentsDir
);
// Returns: ["segment_000.mp3", "segment_001.mp3", ...]
```

Each dialogue line is converted to audio using ElevenLabs TTS with optimized voice settings.

### 4. Audio Concatenation
```javascript
const result = await audioConcatenator.concatenate(
  audioPaths,
  outputPath
);
// Returns: { outputPath, duration, fileSize }
```

ffmpeg combines all segments into a single MP3 file.

### 5. Cleanup
```javascript
await audioConcatenator.cleanupSegments(audioPaths);
// Deletes temporary segment files
```

## Testing

```bash
# Run full end-to-end test
node backend/test-podcast-claude.js
```

The test will:
1. Check ffmpeg installation
2. Verify API keys
3. Generate markdown briefing
4. Create conversational script with Claude
5. Generate TTS audio
6. Concatenate segments
7. Save to database
8. Provide path to play the audio

## Database Schema

```sql
CREATE TABLE daily_podcasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL UNIQUE,
  project_id TEXT,
  status TEXT DEFAULT 'generating',
  audio_url TEXT,
  markdown_content TEXT,
  duration_seconds INTEGER,
  file_size_bytes BIGINT,
  generated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  error_message TEXT
);
```

**Status values:**
- `generating`: Podcast is being created
- `ready`: Podcast is complete and available
- `failed`: Generation failed (see error_message)

## Troubleshooting

### ffmpeg not found
```bash
# macOS
brew install ffmpeg

# Ubuntu
sudo apt-get install ffmpeg
```

### Missing API keys
Check your `.env` file has:
- `ANTHROPIC_API_KEY`
- `ELEVENLABS_API_KEY`
- `PODCAST_VOICE_1`
- `PODCAST_VOICE_2`

### Audio quality issues
Adjust voice settings in `backend/services/elevenlabs-tts.js`:
```javascript
voice_settings: {
  stability: 0.5,        // 0-1: Lower = more variable
  similarity_boost: 0.75, // 0-1: Higher = closer to original
  style: 0.5,            // 0-1: Exaggeration level
  use_speaker_boost: true
}
```

### Script quality issues
Adjust temperature in `backend/services/claude-podcast-writer.js`:
```javascript
temperature: 0.8  // 0-1: Higher = more creative/random
```

## Cost Estimates

**Per 8-minute podcast:**
- Claude API: ~$0.02 (script writing)
- ElevenLabs TTS: ~$0.40 (50 dialogue lines × ~8 seconds each)
- **Total: ~$0.42 per podcast**

**Monthly (30 podcasts):**
- Approximately $12.60/month

## Future Enhancements

- [ ] Upload to cloud storage (S3, Supabase Storage)
- [ ] Add background music between sections
- [ ] Support custom intro/outro music
- [ ] Add pause/pacing control
- [ ] Support multiple languages
- [ ] Add voice emotion tags
- [ ] Create podcast RSS feed
- [ ] Add sound effects for emphasis
