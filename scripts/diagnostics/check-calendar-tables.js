// Check which calendar/event tables exist
const logger = require('../../utils/logger');

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function checkTables() {
  logger.debug('\n🔍 Checking Event/Calendar Tables...\n');

  // Check calendar_events table
  const { data: ce, error: ceError, count: ceCount } = await supabase
    .from('calendar_events')
    .select('*', { count: 'exact', head: true });

  if (ceError) {
    logger.error('❌ calendar_events table: NOT FOUND');
    logger.error('   Error:', { arg0: ceError.message });
  } else {
    logger.info('✅ calendar_events table: EXISTS');
    logger.info('Records:', { ceCount || 0: ceCount || 0 });
  }

  // Check events table (Phase 2)
  const { data: ev, error: evError, count: evCount } = await supabase
    .from('events')
    .select('*', { count: 'exact', head: true });

  if (evError) {
    logger.error('❌ events table: NOT FOUND');
    logger.error('   Error:', { arg0: evError.message });
  } else {
    logger.info('✅ events table: EXISTS');
    logger.info('Records:', { evCount || 0: evCount || 0 });
  }

  logger.info('\n');
}

checkTables();
