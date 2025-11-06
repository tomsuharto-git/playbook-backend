const logger = require('../../utils/logger');

require('dotenv').config();
const { supabase } = require('./db/supabase-client');

/**
 * Backfill ITA Airlines narrative logs from Oct 13 & 15 meeting notes
 * These meetings contained important strategic context that should be in briefings
 */

(async () => {
  logger.info('🔄 Backfilling ITA Airlines narrative logs...\n');

  // Find ITA Airlines project
  const { data: project, error: projError } = await supabase
    .from('projects')
    .select('id, name, narrative')
    .ilike('name', '%ITA%')
    .single();

  if (projError || !project) {
    logger.error('❌ Error finding ITA Airlines project:', { arg0: projError });
    return;
  }

  logger.info('📁 Found project:', { name: project.name });
  logger.debug('📊 Current narrative entries: \n', { length || 0: project.narrative?.length || 0 });

  // Define narratives to backfill (extracted from meeting notes)
  const narrativesToAdd = [
    {
      date: '2025-10-15',
      headline: 'Creative development progress: three territories explored',
      bullets: [
        'Italian team (Nicola, Massimo, Carlotta) joined Swedish team (Sophia, Emma)',
        'Two main creative territories: "Italy happens within you" (emotional), "It\'s Italian" (quality signal)',
        'Warning: previous "Sky Full of Italy" campaign failed by focusing too much on Italy culture, not airline service',
        'Must center the flight experience, not just Italian culture',
        'November 3/4 first client meeting - full campaign presentation expected (not tissue session)',
        'Competing agencies bringing complete executions'
      ],
      source: 'meeting'
    },
    {
      date: '2025-10-15',
      headline: 'Estro word exploration as unique positioning opportunity',
      bullets: [
        'Italian word "estro" means inspiration/creativity in the moment - difficult to translate',
        'Unique ownership opportunity for campaign concept',
        'Campaign idea: ask Italians to explain what "estro" means from different professions',
        'Concern raised: double explanation burden (explain word + explain new vision of Italy)',
        'Works for social media content with different interpretations'
      ],
      source: 'meeting'
    },
    {
      date: '2025-10-13',
      headline: 'Initial creative concepts and remaking vs rebooting Italy approach',
      bullets: [
        'Focused on "remaking vs rebooting Italy" approach',
        'Moving away from cliched Italian stereotypes (Leaning Tower, traditional iconography)',
        'Goal: Create fresh, contemporary Italian narrative',
        'Two directions: Remaking Italy (contemporary iconography) vs Rebooting Italy (conceptual essence)',
        'References: Bottega Veneta craft language, Prada standalone elegance, Paolo Sorrentino films'
      ],
      source: 'meeting'
    },
    {
      date: '2025-10-13',
      headline: 'Strategic challenge: interpreting surprising simplicity brief',
      bullets: [
        'Team emphasized need for creative strategy over heavy brand strategy',
        'Task: Unpack "surprising simplicity" into 3-4 creative territories',
        'Must work for both Italian and international audiences',
        'Core insight: Italian simplicity = quality (unlike other markets where simple can mean cheap)',
        'Italian approach: few ingredients done exceptionally well (3-ingredient pasta example)'
      ],
      source: 'meeting'
    },
    {
      date: '2025-10-13',
      headline: 'Italian quality philosophy and core brand belief established',
      bullets: [
        'Italian simplicity vs Nordic minimalism: emotional/inspired vs rational/intellectual',
        'Italian approach: "expanded not reduced" - simplicity through craft',
        '"Taste this" culture - Italians want to share their creations',
        'Life philosophy: experiences deserve to be beautiful, not just functional',
        'Core brand belief emerging: "Life worth appreciating"',
        'ITA Airways as embodiment of Italian brand (like Prada, Bottega Veneta)'
      ],
      source: 'meeting'
    }
  ];

  // Add to existing narrative (most recent first)
  const existingNarrative = project.narrative || [];

  // Check for duplicates before adding (compare headlines and dates)
  const newNarratives = narrativesToAdd.filter(newEntry => {
    const isDuplicate = existingNarrative.some(existing =>
      existing.date === newEntry.date &&
      existing.headline === newEntry.headline
    );
    return !isDuplicate;
  });

  if (newNarratives.length === 0) {
    logger.info('✅ All narratives already exist in database. No backfill needed.');
    return;
  }

  logger.debug('📝 Adding  new narrative entries...\n', { length: newNarratives.length });

  // Merge: new narratives go to the front
  const mergedNarrative = [...newNarratives, ...existingNarrative];

  // Keep only last 50 entries
  const trimmedNarrative = mergedNarrative.slice(0, 50);

  // Update database
  const { error: updateError } = await supabase
    .from('projects')
    .update({
      narrative: trimmedNarrative,
      last_activity: new Date().toISOString()
    })
    .eq('id', project.id);

  if (updateError) {
    logger.error('❌ Error updating project:', { arg0: updateError });
    return;
  }

  logger.info('✅ Successfully backfilled ITA Airlines narrative logs!\n');
  logger.info('Summary:');
  newNarratives.forEach((entry, idx) => {
    logger.info('. []', { idx + 1: idx + 1, date: entry.date, headline: entry.headline });
  });
  logger.debug('\n📊 Total narrative entries now:', { length: trimmedNarrative.length });
  logger.info('\n💡 These narratives will be included in future briefing generation.');
})();
