const cron = require('node-cron');
const logger = require('../utils/logger').job('refresh-project-knowledge');
const { buildProjectKnowledge } = require('../scripts/build-project-knowledge');

/**
 * Refresh project context daily
 * Runs at 11 PM (after daily brief generation)
 */
function startProjectKnowledgeRefresh() {
  cron.schedule('0 23 * * *', async () => {
    logger.info('🔄 Refreshing project knowledge...');
    
    try {
      await buildProjectKnowledge();
      logger.info('✅ Project knowledge refreshed');
    } catch (error) {
      logger.error('❌ Failed to refresh project knowledge:', { arg0: error });
    }
  });
  
  logger.info('⏰ Project knowledge refresh scheduled (daily at 11 PM)');
}

module.exports = { startProjectKnowledgeRefresh };
