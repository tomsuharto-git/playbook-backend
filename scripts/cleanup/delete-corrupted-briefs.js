const logger = require('../../utils/logger');

const { supabase } = require('./db/supabase-client');

(async () => {
  logger.info('🗑️  Deleting corrupted briefings...\n');

  const datesToDelete = ['2025-10-20', '2025-10-21'];

  for (const date of datesToDelete) {
    logger.info('Deleting:', { date: date });

    const { error } = await supabase
      .from('daily_briefs')
      .delete()
      .eq('date', date);

    if (error) {
      logger.error('❌ Error:');
    } else {
      logger.info('✅ Deleted');
    }
  }

  logger.info('\n✅ Cleanup complete!\n');
  process.exit(0);
})();
