/**
 * Daily Morning Podcast Generator
 *
 * Generates conversational podcast briefings using:
 * - Today's calendar events
 * - Urgent tasks organized by Work/Code/Life
 * - Recent project narratives
 * - Weather and time/energy management
 *
 * Integrates with ElevenLabs GenFM API for conversational two-host format
 */

const { supabase } = require('../db/supabase-client');
const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;
const weatherService = require('./weather-service');
const claudeWriter = require('./claude-podcast-writer');
const elevenLabsTTS = require('./elevenlabs-tts');
const audioConcatenator = require('./audio-concatenator');
const { fetchTodaysEvents } = require('./google-calendar');

class PodcastGenerator {
  constructor() {
    this.elevenLabsUrl = 'https://api.elevenlabs.io/v1/studio/podcasts';
    this.backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
  }

  get elevenLabsApiKey() {
    return process.env.ELEVENLABS_API_KEY;
  }

  /**
   * Main function to generate daily podcast
   * @returns {Promise<Object>} Podcast metadata
   */
  async generateMorningPodcast() {
    const today = new Date().toISOString().split('T')[0];
    console.log(`\n🎙️  Generating morning podcast for ${today}...`);

    try {
      // Check if podcast already exists for today
      const { data: existing } = await supabase
        .from('daily_podcasts')
        .select('*')
        .eq('date', today)
        .single();

      if (existing && existing.status !== 'failed') {
        console.log(`   ⏭️  Podcast already exists (status: ${existing.status})`);
        return existing;
      }

      // Fetch all required data
      console.log('   📊 Gathering data...');
      const data = await this.fetchPodcastData(today);

      // Build markdown content
      console.log('   ✍️  Building podcast script...');
      const markdown = await this.buildPodcastMarkdown(data);

      // Save to database
      const { data: podcast, error } = await supabase
        .from('daily_podcasts')
        .upsert({
          date: today,
          markdown_content: markdown,
          status: 'generating',
          generated_at: new Date().toISOString()
        }, {
          onConflict: 'date'
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      console.log('   ✅ Podcast markdown generated');
      console.log(`   📝 ${markdown.length} characters`);

      return {
        id: podcast.id,
        date: today,
        markdown_length: markdown.length,
        status: 'ready_for_api',
        markdown: markdown
      };

    } catch (error) {
      console.error('   ❌ Podcast generation failed:', error.message);

      // Save error to database
      await supabase
        .from('daily_podcasts')
        .upsert({
          date: today,
          status: 'failed',
          error_message: error.message,
          generated_at: new Date().toISOString()
        }, {
          onConflict: 'date'
        });

      throw error;
    }
  }

  /**
   * Fetch all data needed for podcast
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Object>} All data needed for podcast
   */
  async fetchPodcastData(date) {
    const [brief, tasks, projects, weather] = await Promise.all([
      this.getTodaysBrief(date),
      this.getTodaysTasks(),
      this.getActiveProjects(),
      this.getWeather()
    ]);

    return {
      date,
      brief,
      tasks,
      projects,
      weather
    };
  }

  /**
   * Get today's brief (calendar events from BOTH Google and Outlook)
   * Phase 2: Fetches from normalized events table via event_ids
   */
  async getTodaysBrief(date) {
    // Fetch briefing metadata and event IDs
    const { data: briefData } = await supabase
      .from('daily_briefs')
      .select('event_ids, weather, ai_insights, priorities')
      .eq('date', date)
      .single();

    let calendarEvents = [];

    // Phase 2: Load events from normalized events table using event_ids
    if (briefData?.event_ids && briefData.event_ids.length > 0) {
      console.log(`   📊 Fetching ${briefData.event_ids.length} events from events table...`);

      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select(`
          *,
          projects (
            name,
            project_color,
            context
          )
        `)
        .in('id', briefData.event_ids)
        .order('start_time', { ascending: true });

      if (eventsError) {
        console.error(`   ⚠️  Error loading events:`, eventsError.message);
      } else if (events && events.length > 0) {
        // Map Phase 2 events table structure to expected podcast format
        calendarEvents = events.map(e => {
          const startTime = new Date(e.start_time);
          const endTime = new Date(e.end_time);
          const isAllDay = startTime.getUTCHours() === 0 &&
                           startTime.getUTCMinutes() === 0 &&
                           startTime.getUTCSeconds() === 0;

          return {
            id: e.calendar_id,
            summary: e.title || e.summary || e.subject || 'No Title',
            subject: e.title || e.summary || e.subject || 'No Title',
            start: isAllDay
              ? { date: startTime.toISOString().split('T')[0] }
              : { dateTime: e.start_time },
            end: isAllDay
              ? { date: endTime.toISOString().split('T')[0] }
              : { dateTime: e.end_time },
            body: e.description,
            location: e.location,
            requiredAttendees: e.attendees?.filter(a => !a.optional).map(a => a.email).join('; ') || '',
            optionalAttendees: e.attendees?.filter(a => a.optional).map(a => a.email).join('; ') || '',
            attendees: e.attendees || []
          };
        });
        console.log(`   ✅ Loaded ${events.length} events from events table`);
      }
    }

    // Fetch Google Calendar events (still direct from Google API)
    let googleEvents = [];
    try {
      const targetDate = new Date(date + 'T12:00:00');
      googleEvents = await fetchTodaysEvents(targetDate);
      console.log(`   📧 Google Calendar: ${googleEvents.length} events`);
      console.log(`   📧 Database events: ${calendarEvents.length} events`);
    } catch (error) {
      console.error(`   ⚠️  Google Calendar fetch failed:`, error.message);
    }

    // Combine both calendars
    const allEvents = [...googleEvents, ...calendarEvents];

    return {
      calendar_events: allEvents,
      weather: briefData?.weather || null,
      ai_insights: briefData?.ai_insights || null,
      priorities: briefData?.priorities || []
    };
  }

  /**
   * Get today's tasks organized by urgency and context
   */
  async getTodaysTasks() {
    const { data: allTasks } = await supabase
      .from('tasks')
      .select(`
        *,
        projects (
          name,
          tags,
          urgency
        )
      `)
      .eq('status', 'active') // Only fetch active tasks, exclude pending (since they might be dismissed)
      .order('urgency', { ascending: true })
      .order('due_date', { ascending: true });

    // Organize by context (Work/Code/Life) and urgency
    const organized = {
      work: { now: [], soon: [], eventually: [] },
      code: { now: [], soon: [], eventually: [] },
      life: { now: [], soon: [], eventually: [] }
    };

    (allTasks || []).forEach(task => {
      // Context can be "Work", "Code", "Life" - normalize to lowercase
      const context = (task.context || 'Life').toLowerCase();

      // Urgency can be "Now", "Soon", "Eventually" - normalize to lowercase
      const urgency = (task.urgency || 'Eventually').toLowerCase();

      if (organized[context] && organized[context][urgency]) {
        organized[context][urgency].push(task);
      }
    });

    return organized;
  }

  /**
   * Get active projects with recent narrative updates
   * Only returns projects with updates from last 3 days (not 48 hours)
   * This provides context for today's work without overwhelming the briefing
   */
  async getActiveProjects() {
    const { data: allProjects } = await supabase
      .from('projects')
      .select('*')
      .eq('status', 'active')
      .order('urgency', { ascending: false })
      .order('last_activity', { ascending: false, nullsFirst: false });

    // Filter for projects with recent narrative updates (last 3 days for more context)
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    const recentProjects = (allProjects || []).filter(project => {
      // Use narrative field (living updates) instead of objectives (static goals)
      if (!project.narrative || project.narrative.length === 0) return false;

      // Check if latest narrative is within 3 days
      const latestDate = project.narrative[0]?.date;
      return latestDate && latestDate >= threeDaysAgo.split('T')[0];
    });

    // Organize by tags (Work/Code/Life)
    const organized = {
      work: [],
      code: [],
      life: []
    };

    recentProjects.forEach(project => {
      const tags = project.tags || [];
      if (tags.includes('work')) organized.work.push(project);
      else if (tags.includes('code')) organized.code.push(project);
      else organized.life.push(project);
    });

    return organized;
  }

  /**
   * Get current weather
   */
  async getWeather() {
    return await weatherService.getCurrentWeather();
  }

  /**
   * Build complete podcast markdown script
   * @param {Object} data - All podcast data
   * @returns {string} Formatted markdown content
   */
  async buildPodcastMarkdown(data) {
    const sections = [];

    // Section 1: Opening
    sections.push(this.buildOpening(data));

    // Section 2: Calendar
    sections.push(this.buildCalendar(data));

    // Section 3: Task Priorities
    sections.push(this.buildTaskPriorities(data));

    // Section 4: Project Updates
    sections.push(this.buildProjectUpdates(data));

    // Section 5: Time & Energy Management
    sections.push(this.buildTimeManagement(data));

    // Section 6: Closing
    sections.push(this.buildClosing(data));

    return sections.join('\n\n');
  }

  /**
   * Section 1: Opening (30 sec)
   */
  buildOpening(data) {
    const { date, weather, brief, tasks } = data;

    // Format date nicely
    const dateObj = new Date(date + 'T12:00:00');
    const dateStr = dateObj.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    // Count stats - only TODAY's meetings
    const allEvents = brief.calendar_events || [];
    const todaysEvents = allEvents.filter(event => {
      if (!event.start) return false;
      // Handle both Google (start.dateTime) and Outlook (start) formats
      const startTime = event.start?.dateTime || event.start?.date || event.start;
      const eventDate = startTime.split('T')[0];
      return eventDate === date;
    });
    const totalMeetings = todaysEvents.length;

    const urgentTasks = Object.values(tasks).reduce((sum, context) =>
      sum + (context.now?.length || 0), 0
    );

    const allProjects = Object.values(data.projects).flat();
    const activeProjectCount = allProjects.length;

    return `# Good Morning Tom - ${dateStr}

## OPENING

${weather.description}, ${weather.temp}°F${weather.location ? ` in ${weather.location}` : ''}. Time to lock in${totalMeetings > 2 ? ' – big day ahead' : ''}.

${totalMeetings} ${totalMeetings === 1 ? 'meeting' : 'meetings'} today, ${urgentTasks} urgent ${urgentTasks === 1 ? 'task' : 'tasks'}, ${activeProjectCount} active ${activeProjectCount === 1 ? 'project' : 'projects'}.`;
  }

  /**
   * Section 2: Calendar (2-3 min)
   */
  buildCalendar(data) {
    const events = data.brief.calendar_events || [];

    if (events.length === 0) {
      return `## CALENDAR

No meetings scheduled today. Clear calendar for deep work.`;
    }

    // Filter out today's events only and sort by start time
    const today = new Date().toISOString().split('T')[0];
    const todaysEvents = events
      .filter(event => {
        // Handle both Google (start.dateTime) and Outlook (start) formats
        const startTime = event.start?.dateTime || event.start?.date || event.start;
        if (!startTime) return false;
        const eventDate = startTime.split('T')[0];
        return eventDate === today;
      })
      .sort((a, b) => {
        const aTime = a.start?.dateTime || a.start?.date || a.start;
        const bTime = b.start?.dateTime || b.start?.date || b.start;
        return new Date(aTime) - new Date(bTime);
      });

    if (todaysEvents.length === 0) {
      return `## CALENDAR

No meetings scheduled today. Clear calendar for deep work.`;
    }

    const eventSections = todaysEvents.slice(0, 10).map(event => {
      const time = this.formatEventTime(event);
      const duration = this.calculateDuration(event);
      const title = event.subject || event.summary || 'Untitled Meeting';

      // Parse attendees from Office 365 format
      const attendees = this.parseAttendees(event);

      return `### ${time} - ${title} (${duration})
${attendees.length ? `**Attendees**: ${attendees.join(', ')}` : ''}
${event.location ? `**Location**: ${event.location}` : ''}
${event.body && event.body.length > 10 ? `\n${event.body.substring(0, 200)}...` : ''}`;
    }).join('\n\n');

    return `## CALENDAR\n\n${eventSections}`;
  }

  /**
   * Section 3: Task Priorities (2 min)
   */
  buildTaskPriorities(data) {
    const { tasks } = data;
    const sections = [];

    // Helper to format task list
    const formatTasks = (taskList, label) => {
      if (!taskList || taskList.length === 0) return '';

      return `**${label}:**\n` + taskList.map(task => {
        const projectName = task.projects?.name || 'No project';
        const dueDate = task.due_date ? ` (due ${this.formatDate(task.due_date)})` : '';
        const estimate = task.time_estimate ? ` [${task.time_estimate}m]` : '';
        return `- ${task.title} - ${projectName}${estimate}${dueDate}`;
      }).join('\n');
    };

    // Work Tasks
    if (tasks.work.now.length || tasks.work.soon.length || tasks.work.eventually.length) {
      sections.push(`### WORK\n\n${
        formatTasks(tasks.work.now, 'MUST DO TODAY') || ''
      }${tasks.work.now.length && tasks.work.soon.length ? '\n\n' : ''}${
        formatTasks(tasks.work.soon, 'SHOULD DO') || ''
      }${(tasks.work.now.length || tasks.work.soon.length) && tasks.work.eventually.length ? '\n\n' : ''}${
        formatTasks(tasks.work.eventually, 'CAN WAIT') || ''
      }`);
    }

    // Code Tasks
    if (tasks.code.now.length || tasks.code.soon.length || tasks.code.eventually.length) {
      sections.push(`### CODE\n\n${
        formatTasks(tasks.code.now, 'MUST DO TODAY') || ''
      }${tasks.code.now.length && tasks.code.soon.length ? '\n\n' : ''}${
        formatTasks(tasks.code.soon, 'SHOULD DO') || ''
      }${(tasks.code.now.length || tasks.code.soon.length) && tasks.code.eventually.length ? '\n\n' : ''}${
        formatTasks(tasks.code.eventually, 'CAN WAIT') || ''
      }`);
    }

    // Life Tasks
    if (tasks.life.now.length || tasks.life.soon.length || tasks.life.eventually.length) {
      sections.push(`### LIFE\n\n${
        formatTasks(tasks.life.now, 'MUST DO TODAY') || ''
      }${tasks.life.now.length && tasks.life.soon.length ? '\n\n' : ''}${
        formatTasks(tasks.life.soon, 'SHOULD DO') || ''
      }${(tasks.life.now.length || tasks.life.soon.length) && tasks.life.eventually.length ? '\n\n' : ''}${
        formatTasks(tasks.life.eventually, 'CAN WAIT') || ''
      }`);
    }

    if (sections.length === 0) {
      return `## TASK PRIORITIES\n\nNo pending tasks. Clear slate!`;
    }

    return `## TASK PRIORITIES\n\n${sections.join('\n\n')}`;
  }

  /**
   * Section 4: Project Updates (1-2 min)
   * Only mention projects relevant to today's work
   * Focus on context that helps with today's tasks/meetings
   */
  buildProjectUpdates(data) {
    const { projects } = data;
    const sections = [];

    // Helper to format project - use narrative (living updates) not objectives (static goals)
    const formatProject = (project) => {
      const latest = project.narrative?.[0];
      if (!latest) return '';

      const urgencyLabel = project.urgency === 'high' ? ' - URGENT' : '';
      const deadlineText = project.deadline ? `\n**Deadline:** ${this.formatDate(project.deadline)}` : '';

      return `**${project.name.toUpperCase()}${urgencyLabel}**
${latest.headline}
${latest.bullets?.map(b => `- ${b}`).join('\n') || ''}${deadlineText}`;
    };

    // Work Projects
    if (projects.work.length > 0) {
      sections.push(`### WORK PROJECTS\n\n${
        projects.work.map(formatProject).filter(Boolean).join('\n\n')
      }`);
    }

    // Code Projects
    if (projects.code.length > 0) {
      sections.push(`### CODE PROJECTS\n\n${
        projects.code.map(formatProject).filter(Boolean).join('\n\n')
      }`);
    }

    // Life Projects
    if (projects.life.length > 0) {
      sections.push(`### LIFE PROJECTS\n\n${
        projects.life.map(formatProject).filter(Boolean).join('\n\n')
      }`);
    }

    if (sections.length === 0) {
      return `## PROJECT UPDATES\n\nNo recent project updates.`;
    }

    return `## PROJECT UPDATES\n\n${sections.join('\n\n')}`;
  }

  /**
   * Section 5: Time & Energy Management (1 min)
   */
  buildTimeManagement(data) {
    const allEvents = data.brief.calendar_events || [];

    // Filter to today's events only
    const today = data.date;
    const todaysEvents = allEvents.filter(event => {
      if (!event.start) return false;
      // Handle both Google (start.dateTime) and Outlook (start) formats
      const startTime = event.start?.dateTime || event.start?.date || event.start;
      const eventDate = startTime.split('T')[0];
      return eventDate === today;
    });

    // Analyze calendar blocks
    const morningMeetings = todaysEvents.filter(e => {
      const hour = this.getEventHour(e);
      return hour >= 6 && hour < 12;
    });

    const afternoonMeetings = todaysEvents.filter(e => {
      const hour = this.getEventHour(e);
      return hour >= 12 && hour < 17;
    });

    const eveningMeetings = todaysEvents.filter(e => {
      const hour = this.getEventHour(e);
      return hour >= 17;
    });

    // Find largest free block
    const freeBlocks = this.findFreeBlocks(todaysEvents);
    const bestWorkWindow = freeBlocks[0] || { start: '10:00 AM', end: '12:00 PM', hours: 2 };

    return `## TIME & ENERGY MANAGEMENT

**Morning:** ${morningMeetings.length ? `${morningMeetings.length} meeting(s)` : 'Free'}
**Afternoon:** ${afternoonMeetings.length ? `${afternoonMeetings.length} meeting(s)` : 'Free'}
**Evening:** ${eveningMeetings.length ? `${eveningMeetings.length} meeting(s)` : 'Free'}

**Best Work Window:** ${bestWorkWindow.start} to ${bestWorkWindow.end} (${bestWorkWindow.hours}-hour focus block)

${this.getTimeRecommendation(data)}`;
  }

  /**
   * Section 6: Closing (30 sec)
   */
  buildClosing(data) {
    const { tasks, projects, date } = data;

    // Find most critical item
    const urgentTaskCount = Object.values(tasks).reduce((sum, context) =>
      sum + (context.now?.length || 0), 0
    );

    const highPriorityProjects = Object.values(projects).flat()
      .filter(p => p.urgency === 'high');

    // Count today's meetings
    const allEvents = data.brief.calendar_events || [];
    const todaysEvents = allEvents.filter(event => {
      if (!event.start) return false;
      // Handle both Google (start.dateTime) and Outlook (start) formats
      const startTime = event.start?.dateTime || event.start?.date || event.start;
      const eventDate = startTime.split('T')[0];
      return eventDate === date;
    });

    let bottomLine = 'Solid day ahead.';
    if (urgentTaskCount > 3) {
      bottomLine = 'High-stakes day. Lots on the line.';
    } else if (highPriorityProjects.length > 0) {
      bottomLine = `Critical focus: ${highPriorityProjects[0].name}.`;
    }

    return `## CLOSING

${bottomLine} Weather's ${data.weather.description.toLowerCase()}, calendar's ${
      todaysEvents.length > 2 ? 'packed' : 'manageable'
    }. You're prepared.

Lock in. Make it count. You've got this.`;
  }

  /**
   * Generate podcast using Claude script + TTS + Concatenation
   * This is the new approach that works with standard ElevenLabs API
   * @param {string} markdown - Podcast script
   * @param {string} date - Date string
   * @returns {Promise<Object>} Result with audio URL and metadata
   */
  async generatePodcastWithClaudeScript(markdown, date) {
    const podcastDate = date || new Date().toISOString().split('T')[0];

    console.log('\n🎙️  Generating podcast with Claude script + TTS...');

    try {
      // Check if ffmpeg is available
      const hasFFmpeg = await audioConcatenator.checkFFmpeg();
      if (!hasFFmpeg) {
        throw new Error('ffmpeg is required but not installed');
      }

      // Step 1: Have Claude write the conversational script
      console.log('\n📝 Step 1: Writing conversational script with Claude...');
      const script = await claudeWriter.writeScript(markdown, podcastDate);

      console.log(`   ✅ Script written: ${script.dialogue.length} dialogue exchanges`);
      console.log(`   ⏱️  Estimated duration: ${Math.floor(script.estimatedDuration / 60)}m ${script.estimatedDuration % 60}s`);

      // Step 2: Generate TTS for each dialogue line
      console.log('\n🎤 Step 2: Generating TTS audio for each line...');
      const segmentsDir = path.join(__dirname, '../temp', `podcast_${podcastDate}`);
      const audioPaths = await elevenLabsTTS.generateDialogueAudio(script.dialogue, segmentsDir);

      console.log(`   ✅ Generated ${audioPaths.length} audio segments`);

      // Step 3: Concatenate all audio segments
      console.log('\n🎬 Step 3: Concatenating audio segments...');
      const outputPath = path.join(__dirname, '../podcasts', `podcast_${podcastDate}.mp3`);

      // Ensure podcasts directory exists
      await fs.mkdir(path.join(__dirname, '../podcasts'), { recursive: true });

      // Check for intro/outro music files
      const introPath = path.join(__dirname, '../assets/audio/intro.mp3');
      const outroPath = path.join(__dirname, '../assets/audio/outro.mp3');

      const musicOptions = {};
      try {
        await fs.access(introPath);
        musicOptions.intro = introPath;
        console.log('   🎵 Intro music found');
      } catch (e) {
        // No intro music
      }

      try {
        await fs.access(outroPath);
        musicOptions.outro = outroPath;
        console.log('   🎵 Outro music found');
      } catch (e) {
        // No outro music
      }

      const concatenationResult = await audioConcatenator.concatenate(audioPaths, outputPath, musicOptions);

      console.log(`   ✅ Final podcast created: ${outputPath}`);

      // Step 4: Clean up temporary segments
      console.log('\n🧹 Step 4: Cleaning up temporary files...');
      await audioConcatenator.cleanupSegments(audioPaths);

      // Remove temp directory
      try {
        await fs.rmdir(segmentsDir);
      } catch (e) {
        // Ignore if directory not empty or doesn't exist
      }

      console.log('\n✅ Podcast generation complete!');

      return {
        success: true,
        audio_path: concatenationResult.outputPath,
        duration_seconds: concatenationResult.duration,
        file_size_bytes: concatenationResult.fileSize,
        dialogue_count: script.dialogue.length
      };

    } catch (error) {
      console.error('\n❌ Podcast generation failed:', error.message);
      throw error;
    }
  }

  // ===== Helper Functions =====

  formatEventTime(event) {
    if (!event.start) return 'Time TBD';
    // Handle both Google (start.dateTime) and Outlook (start) formats
    const startTime = event.start?.dateTime || event.start?.date || event.start;
    const date = new Date(startTime);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  calculateDuration(event) {
    if (!event.start || !event.end) return 'Unknown duration';

    // Handle both Google (start.dateTime) and Outlook (start) formats
    const startTime = event.start?.dateTime || event.start?.date || event.start;
    const endTime = event.end?.dateTime || event.end?.date || event.end;

    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationMs = end - start;
    const durationMinutes = Math.round(durationMs / (1000 * 60));

    if (durationMinutes < 60) {
      return `${durationMinutes}m`;
    } else if (durationMinutes === 60) {
      return '1h';
    } else {
      const hours = Math.floor(durationMinutes / 60);
      const minutes = durationMinutes % 60;
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
  }

  parseAttendees(event) {
    const attendees = [];

    // Office 365 format: "name1@email.com; name2@email.com"
    if (event.requiredAttendees) {
      const required = event.requiredAttendees
        .split(';')
        .map(a => a.trim())
        .filter(a => a.length > 0)
        .map(a => this.formatAttendeeName(a));
      attendees.push(...required);
    }

    if (event.optionalAttendees) {
      const optional = event.optionalAttendees
        .split(';')
        .map(a => a.trim())
        .filter(a => a.length > 0)
        .map(a => this.formatAttendeeName(a) + ' (optional)');
      attendees.push(...optional);
    }

    // Google Calendar format: array of objects with email/displayName
    if (event.attendees && Array.isArray(event.attendees)) {
      event.attendees.forEach(attendee => {
        if (typeof attendee === 'object' && attendee.email) {
          const name = attendee.displayName || this.formatAttendeeName(attendee.email);
          const optionalTag = attendee.optional ? ' (optional)' : '';
          attendees.push(name + optionalTag);
        } else if (typeof attendee === 'string') {
          // Legacy string format
          attendees.push(attendee);
        }
      });
    }

    return attendees;
  }

  formatAttendeeName(emailOrName) {
    // If it's an email, extract the name part
    if (emailOrName.includes('@')) {
      const namePart = emailOrName.split('@')[0];
      // Convert "first.last" to "First Last"
      return namePart
        .split(/[._]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    }
    return emailOrName;
  }

  getEventHour(event) {
    if (!event.start) return 12;
    // Handle both Google (start.dateTime) and Outlook (start) formats
    const startTime = event.start?.dateTime || event.start?.date || event.start;
    return new Date(startTime).getHours();
  }

  formatDate(dateStr) {
    const date = new Date(dateStr + 'T12:00:00');
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dateOnly = date.toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    if (dateOnly === todayStr) return 'today';
    if (dateOnly === tomorrowStr) return 'tomorrow';

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  }

  findFreeBlocks(events) {
    // Simplified: return default morning block
    // TODO: Actually parse calendar and find gaps
    return [
      { start: '10:00 AM', end: '12:00 PM', hours: 2 }
    ];
  }

  getTimeRecommendation(data) {
    const urgentTasks = Object.values(data.tasks).reduce((sum, context) =>
      sum + (context.now?.length || 0), 0
    );

    if (urgentTasks > 3) {
      return '**Recommendation:** Tackle urgent tasks first, block calendar for focus time.';
    } else if (data.brief.calendar_events?.length > 3) {
      return '**Recommendation:** Use gaps between meetings for quick wins.';
    } else {
      return '**Recommendation:** Perfect day for deep work on high-value projects.';
    }
  }

  /**
   * Call ElevenLabs API to generate podcast
   * @param {string} markdown - Podcast script
   * @param {string} date - Date string
   * @returns {Promise<Object>} ElevenLabs response
   */
  async callElevenLabsAPI(markdown, date) {
    if (!this.elevenLabsApiKey) {
      throw new Error('ELEVENLABS_API_KEY not set');
    }

    const dateObj = new Date(date + 'T12:00:00');
    const dateStr = dateObj.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    const requestBody = {
      model_id: 'eleven_multilingual_v2',
      mode: {
        type: 'conversation',
        ...(process.env.PODCAST_VOICE_1 && process.env.PODCAST_VOICE_2 && {
          conversation: {
            host_voice_id: process.env.PODCAST_VOICE_1,   // Host 1 - The Strategist
            guest_voice_id: process.env.PODCAST_VOICE_2   // Host 2 - The Maker
          }
        })
      },
      source: {
        type: 'text',
        text: markdown
      },
      quality_preset: 'high',
      duration_scale: 'default',
      language: 'en',
      intro: `Good morning Tom, here's your daily project update for ${dateStr}`,
      outro: "That's your briefing. Lock in and make it count!",
      // Note: ElevenLabs Studio API doesn't support custom music IDs in conversation mode yet
      // Intro/outro music is handled in generatePodcastWithClaudeScript() method instead
      instructions_prompt: `You are two executive coaches having a morning briefing conversation with Tom.

HOST 1 - THE STRATEGIST:
- Curious and provocative thinker
- Asks challenging "why" questions
- Sees connections between projects and long-term implications
- Direct and incisive about priorities
- Plans multiple steps ahead

HOST 2 - THE MAKER:
- Creative and inventive thinker
- Funny and irreverent, lightens tension
- Dreams big while staying practical
- Offers unexpected solutions and perspectives
- Finds humor in situations

CONVERSATION DYNAMICS:
- Host 1 focuses on strategy, priorities, long-term thinking
- Host 2 brings creative energy, humor, fresh perspectives
- Natural back-and-forth, sometimes playful disagreement
- Both talk TO Tom directly (use "you")

CONVERSATION STYLE:
- Natural and authentic, react genuinely
- Digress briefly when relevant, then return to topic
- Use transitions: "Speaking of which...", "Here's a thought..."
- Ask rhetorical questions: "Ready for this?", "You know what that means?"
- Show personality

PACING:
- Urgent/high-stakes items get more discussion
- Routine items get brief mentions
- Allow natural pauses for emphasis

TONE:
- Professional but friendly and real
- Honest about challenges
- Celebratory about wins
- Direct when needed

HUMOR (Host 2):
- Light, observational humor
- Self-aware jokes about the process
- Never at Tom's expense
- Don't joke during serious topics

DIGRESSION RULES:
- Brief connections between topics (2-3 sentences max)
- "Meta" observations welcome occasionally
- Always return to briefing flow`,
      callback_url: `${this.backendUrl}/api/podcast/webhook`
    };

    try {
      const response = await axios.post(this.elevenLabsUrl, requestBody, {
        headers: {
          'xi-api-key': this.elevenLabsApiKey,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      });

      return response.data;
    } catch (error) {
      console.error('   ❌ ElevenLabs API Error Details:');
      console.error('   Status:', error.response?.status);
      console.error('   Message:', error.response?.data?.detail?.message || error.response?.data?.message || error.message);
      console.error('   Full response:', JSON.stringify(error.response?.data, null, 2));
      throw error;
    }
  }
}

module.exports = new PodcastGenerator();
