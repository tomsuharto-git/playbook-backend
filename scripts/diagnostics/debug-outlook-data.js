/**
 * Debug script to check what data is in the Outlook calendar file
 */

const { getLatestCalendarFile } = require('./services/outlook-calendar');
const fs = require('fs');
const logger = require('../../utils/logger');

async function debugOutlookData() {
  logger.debug('🔍 Fetching latest Outlook calendar file...\n');

  try {
    const calendarFile = await getLatestCalendarFile();

    if (!calendarFile) {
      logger.error('❌ No calendar file found');
      return;
    }

    logger.info('\n📄 File name:', { name: calendarFile.name });
    logger.debug('📊 Data structure:');

    // Check if data has 'value' property
    if (calendarFile.data.value) {
      logger.info('\n✅ Has 'value' property with  items', { length: calendarFile.data.value.length });

      // Show first event structure
      if (calendarFile.data.value.length > 0) {
        const firstEvent = calendarFile.data.value[0];
        logger.info('\n📋 First event structure:');
        logger.info('Keys:');
        logger.info('\nFirst event full data:');
        logger.info(JSON.stringify(firstEvent, { arg0: null });

        // Check for required fields
        logger.debug('\n🔍 Field check:');
        logger.error('- id:', { id ? '✅' : '❌': firstEvent.id ? '✅' : '❌' });
        logger.error('- subject:  (value: "")', { subject ? '✅' : '❌': firstEvent.subject ? '✅' : '❌', subject: firstEvent.subject });
        logger.error('- start:', { start ? '✅' : '❌': firstEvent.start ? '✅' : '❌' });
        logger.error('- end:', { end ? '✅' : '❌': firstEvent.end ? '✅' : '❌' });
        logger.error('- isAllDay:', { isAllDay !== undefined ? '✅' : '❌': firstEvent.isAllDay !== undefined ? '✅' : '❌' });
      }

      // Show last 5 events to see if pattern continues
      logger.info('\n📋 Last 5 event titles:');
      const last5 = calendarFile.data.value.slice(-5);
      last5.forEach((event, i) => {
        logger.info('. "" -', { i + 1: i + 1, subject || 'NO SUBJECT': event.subject || 'NO SUBJECT', start || 'NO START': event.start || 'NO START' });
      });

    } else {
      logger.error('❌ No "value" property found in data');
      logger.info('Data keys:');

      // Save raw data to file for inspection
      fs.writeFileSync('./temp-outlook-data.json', JSON.stringify(calendarFile.data, null, 2));
      logger.info('\n💾 Saved raw data to temp-outlook-data.json');
    }

  } catch (error) {
    logger.error('❌ Error:', { arg0: error.message });
    logger.error(error.stack);
  }

  process.exit(0);
}

debugOutlookData();
