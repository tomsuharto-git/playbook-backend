/**
 * Sync Meeting Notes Narratives to Projects
 *
 * This job processes analyzed meeting notes and syncs their narratives
 * to the projects.narrative JSONB field so they appear in briefings.
 *
 * Root cause fix: Meeting notes were being analyzed and stored in meeting_notes.analysis,
 * but the narrative data wasn't being transferred to projects.narrative where
 * event-briefing.js reads from.
 */

const { supabase } = require('../db/supabase-client');
const { updateProjectNarrative } = require('./gmail-scanner');
const cron = require('node-cron');
const logger = require('../utils/logger').job('sync-meeting-narratives');

/**
 * Sync narratives from meeting_notes to projects.narrative
 */
async function syncMeetingNarratives() {
  logger.info('🔄 Starting meeting narrative sync...');

  try {
    // Get meeting notes that:
    // 1. Have been analyzed
    // 2. Have narrative data in analysis
    // 3. Have a project_id
    // 4. Haven't been synced yet (narrative_synced = false or null)
    const { data: meetingNotes, error } = await supabase
      .from('meeting_notes')
      .select('id, title, date, project_id, analysis, file_path')
      .eq('analyzed', true)
      .not('analysis', 'is', null)
      .not('project_id', 'is', null)
      .or('narrative_synced.is.null,narrative_synced.eq.false')
      .order('date', { ascending: false })
      .limit(50);

    if (error) {
      logger.error('Failed to fetch meeting notes:', { error: error.message });
      return { success: false, error: error.message };
    }

    if (!meetingNotes || meetingNotes.length === 0) {
      logger.info('No unsynced meeting notes found');
      return { success: true, synced: 0 };
    }

    logger.info(`Found ${meetingNotes.length} meeting notes to check`);

    let syncedCount = 0;
    let skippedCount = 0;

    for (const note of meetingNotes) {
      try {
        const analysis = note.analysis;

        // Check if analysis has narrative data
        if (!analysis?.narrative?.headline) {
          logger.debug(`Skipping ${note.title} - no narrative headline`);
          skippedCount++;
          continue;
        }

        const narrative = analysis.narrative;
        const noteDate = note.date || new Date().toISOString().split('T')[0];

        // Determine source type based on file path
        let source = 'meeting';
        if (note.file_path) {
          if (note.file_path.includes('Granola') || note.file_path.includes('Meeting')) {
            source = 'meeting';
          } else if (note.file_path.includes('Email')) {
            source = 'email';
          } else {
            source = 'note';
          }
        }

        // Call updateProjectNarrative to sync to projects.narrative
        await updateProjectNarrative(
          note.project_id,
          narrative,
          noteDate,
          source
        );

        // Mark as synced
        await supabase
          .from('meeting_notes')
          .update({ narrative_synced: true, narrative_synced_at: new Date().toISOString() })
          .eq('id', note.id);

        syncedCount++;
        logger.info(`✓ Synced narrative from "${note.title}" to project ${note.project_id}`);

      } catch (noteError) {
        logger.error(`Failed to sync note ${note.id}:`, { error: noteError.message });
      }
    }

    logger.info(`✅ Meeting narrative sync complete: ${syncedCount} synced, ${skippedCount} skipped`);
    return { success: true, synced: syncedCount, skipped: skippedCount };

  } catch (error) {
    logger.error('Meeting narrative sync failed:', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Backfill: Sync ALL meeting notes with narratives (ignores narrative_synced flag)
 * Use this to fix historical data
 */
async function backfillMeetingNarratives() {
  logger.info('🔄 Starting meeting narrative BACKFILL...');

  try {
    const { data: meetingNotes, error } = await supabase
      .from('meeting_notes')
      .select('id, title, date, project_id, analysis, file_path')
      .eq('analyzed', true)
      .not('analysis', 'is', null)
      .not('project_id', 'is', null)
      .order('date', { ascending: false });

    if (error) {
      logger.error('Failed to fetch meeting notes:', { error: error.message });
      return { success: false, error: error.message };
    }

    logger.info(`Found ${meetingNotes?.length || 0} total analyzed meeting notes`);

    let syncedCount = 0;
    let skippedCount = 0;

    for (const note of meetingNotes || []) {
      try {
        const analysis = note.analysis;

        if (!analysis?.narrative?.headline) {
          skippedCount++;
          continue;
        }

        const narrative = analysis.narrative;
        const noteDate = note.date || new Date().toISOString().split('T')[0];

        let source = 'meeting';
        if (note.file_path) {
          if (note.file_path.includes('Granola') || note.file_path.includes('Meeting')) {
            source = 'meeting';
          } else if (note.file_path.includes('Email')) {
            source = 'email';
          } else {
            source = 'note';
          }
        }

        await updateProjectNarrative(
          note.project_id,
          narrative,
          noteDate,
          source
        );

        await supabase
          .from('meeting_notes')
          .update({ narrative_synced: true, narrative_synced_at: new Date().toISOString() })
          .eq('id', note.id);

        syncedCount++;

      } catch (noteError) {
        logger.error(`Failed to sync note ${note.id}:`, { error: noteError.message });
      }
    }

    logger.info(`✅ Backfill complete: ${syncedCount} synced, ${skippedCount} skipped (no narrative)`);
    return { success: true, synced: syncedCount, skipped: skippedCount };

  } catch (error) {
    logger.error('Backfill failed:', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Schedule meeting narrative sync
 * Runs 15 minutes after each Gmail scan to catch new meeting notes
 */
function startSyncSchedule() {
  // Run at 6:15am, 12:15pm, 6:15pm ET (15 min after Gmail scanner)
  cron.schedule('15 6,12,18 * * *', syncMeetingNarratives, {
    timezone: 'America/New_York'
  });

  logger.info('⏰ Meeting narrative sync scheduled (6:15am, 12:15pm, 6:15pm ET)');
}

module.exports = {
  syncMeetingNarratives,
  backfillMeetingNarratives,
  startSyncSchedule
};
