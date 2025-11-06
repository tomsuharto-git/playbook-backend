const logger = require('../../utils/logger');

const { supabase } = require('./db/supabase-client');

(async () => {
  // Get total meeting notes
  const { data: allNotes, count: totalCount } = await supabase
    .from('meeting_notes')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  logger.debug('\n📊 Meeting Notes Statistics:');
  logger.info('Total meeting notes:', { totalCount: totalCount });

  const analyzed = allNotes.filter(n => n.analyzed).length;
  const withAnalysis = allNotes.filter(n => n.analysis).length;
  const withNarrative = allNotes.filter(n => n.analysis && n.analysis.narrative).length;

  logger.info('Analyzed:', { analyzed: analyzed });
  logger.info('With analysis object:', { withAnalysis: withAnalysis });
  logger.info('With narrative in analysis:', { withNarrative: withNarrative });

  // Check recent notes with narratives
  logger.debug('\n📝 Recent meeting notes WITH narratives:');
  allNotes
    .filter(n => n.analysis && n.analysis.narrative && n.analysis.narrative.headline)
    .slice(0, 10)
    .forEach(n => {
      logger.info('•  ()', { title: n.title, date || 'no date': n.date || 'no date' });
      logger.info('Project ID:', { project_id || 'none': n.project_id || 'none' });
      logger.info('Narrative:', { headline: n.analysis.narrative.headline });
    });

  // Check recent notes WITHOUT narratives
  logger.error('\n❌ Recent meeting notes WITHOUT narratives:');
  allNotes
    .filter(n => !n.analysis || !n.analysis.narrative || !n.analysis.narrative.headline)
    .slice(0, 10)
    .forEach(n => {
      logger.info('•  ()', { title: n.title, date || 'no date': n.date || 'no date' });
      logger.info('Project ID:', { project_id || 'none': n.project_id || 'none' });
      logger.info('Has analysis:', { analysis: !!n.analysis });
    });

  process.exit(0);
})();
