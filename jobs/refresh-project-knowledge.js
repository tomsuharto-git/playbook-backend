const cron = require('node-cron');
const { buildProjectKnowledge } = require('../scripts/build-project-knowledge');

/**
 * Refresh project context daily
 * Runs at 11 PM (after daily brief generation)
 */
function startProjectKnowledgeRefresh() {
  cron.schedule('0 23 * * *', async () => {
    console.log('🔄 Refreshing project knowledge...');
    
    try {
      await buildProjectKnowledge();
      console.log('✅ Project knowledge refreshed');
    } catch (error) {
      console.error('❌ Failed to refresh project knowledge:', error);
    }
  });
  
  console.log('⏰ Project knowledge refresh scheduled (daily at 11 PM)');
}

module.exports = { startProjectKnowledgeRefresh };
