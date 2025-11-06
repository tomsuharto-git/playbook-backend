// Quick script to check if Phase 2 tables exist in Supabase
const logger = require('../../utils/logger');

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function checkTables() {
  logger.debug('\n🔍 Checking Phase 2 Tables in Supabase...\n');

  try {
    // Check events table
    const { data: events, error: eventsError, count: eventsCount } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true });

    if (eventsError) {
      logger.error('❌ events table: NOT FOUND');
      logger.error('   Error:', { arg0: eventsError.message });
    } else {
      logger.info('✅ events table: EXISTS');
      logger.info('Records:', { eventsCount || 0: eventsCount || 0 });
    }

    // Check narratives table
    const { data: narratives, error: narrativesError, count: narrativesCount } = await supabase
      .from('narratives')
      .select('*', { count: 'exact', head: true });

    if (narrativesError) {
      logger.error('❌ narratives table: NOT FOUND');
      logger.error('   Error:', { arg0: narrativesError.message });
    } else {
      logger.info('✅ narratives table: EXISTS');
      logger.info('Records:', { narrativesCount || 0: narrativesCount || 0 });
    }

    // Check news table
    const { data: news, error: newsError, count: newsCount } = await supabase
      .from('news')
      .select('*', { count: 'exact', head: true });

    if (newsError) {
      logger.error('❌ news table: NOT FOUND');
      logger.error('   Error:', { arg0: newsError.message });
    } else {
      logger.info('✅ news table: EXISTS');
      logger.info('Records:', { newsCount || 0: newsCount || 0 });
    }

    logger.info('\n---\n');

    // Summary
    const tablesExist = !eventsError && !narrativesError && !newsError;
    if (tablesExist) {
      logger.info('✅ All Phase 2 tables exist!');
      if (eventsCount === 0 && narrativesCount === 0) {
        logger.warn('⚠️  Tables are empty - data migration may be needed');
      } else {
        logger.info('✅ Tables have data - migration appears complete!');
      }
    } else {
      logger.error('❌ Some tables are missing - migration needs to be run');
    }

  } catch (error) {
    logger.error('Error checking tables:', { arg0: error });
  }
}

checkTables();
