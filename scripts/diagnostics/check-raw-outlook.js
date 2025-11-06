require('dotenv').config();
const axios = require('axios');
const logger = require('../../utils/logger');

async function checkRawData() {
  const CALENDAR_FOLDER_ID = '15CJiwytPs1A0rAIectouqr8xExIYMiMf';

  // Get latest file
  const listUrl = `https://www.googleapis.com/drive/v3/files?q='${CALENDAR_FOLDER_ID}'+in+parents&orderBy=modifiedTime desc&pageSize=1&fields=files(id,name,modifiedTime)&key=${process.env.GOOGLE_API_KEY}`;
  const listResponse = await axios.get(listUrl);
  const file = listResponse.data.files[0];

  logger.info('📄 Checking file:', { arg0: file.name });

  // Download file
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${process.env.GOOGLE_API_KEY}`;
  const downloadResponse = await axios.get(downloadUrl);

  // Find a work event
  const events = downloadResponse.data.value || [];
  const baileysEvent = events.find(e => e.subject && e.subject.includes('Baileys'));
  const therabodyEvent = events.find(e => e.subject && e.subject.includes('Therabody'));

  logger.debug('\n📊 Total events in file:', { arg0: events.length });
  logger.info();

  if (baileysEvent) {
    logger.info('✅ Found Baileys event:');
    logger.info('  Subject:', { arg0: baileysEvent.subject });
    logger.info('  Has attendees field?');
    logger.info('  Attendees count:');
    if (baileysEvent.attendees && baileysEvent.attendees.length > 0) {
      logger.info('  Sample attendee:', { arg1: null });
    }
    logger.info();
  }

  if (therabodyEvent) {
    logger.info('✅ Found Therabody event:');
    logger.info('  Subject:', { arg0: therabodyEvent.subject });
    logger.info('  Has attendees field?');
    logger.info('  Attendees count:');
    if (therabodyEvent.attendees && therabodyEvent.attendees.length > 0) {
      logger.info('  Sample attendee:', { arg1: null });
    }
  }

  if (!baileysEvent && !therabodyEvent) {
    logger.warn('⚠️  No Baileys or Therabody events found in file');
    logger.info('\nSample event structure (first event):');
    const sample = events[0] || {};
    logger.info('  Keys:');
    logger.info('  Subject:', { arg0: sample.subject });
    logger.info('  Has attendees?');
  }
}

checkRawData()
  .then(() => process.exit(0))
  .catch(e => {
    logger.error('Error:', { arg0: e.message });
    process.exit(1);
  });
