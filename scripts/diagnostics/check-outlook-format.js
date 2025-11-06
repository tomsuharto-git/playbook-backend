const data = require('/Users/tomsuharto/Downloads/calendar-2025-10-12-2200.json');
const logger = require('../../utils/logger');

const events = data.value || [];
const baileysEvent = events.find(e => e.subject && e.subject.includes('Baileys'));

if (baileysEvent) {
  logger.info('📅 Baileys event structure:\n');
  logger.info('Subject:', { arg0: baileysEvent.subject });
  logger.info('\nAttendee fields:');
  logger.info('  requiredAttendees:', { arg0: baileysEvent.requiredAttendees });
  logger.info('  optionalAttendees:', { arg0: baileysEvent.optionalAttendees });
  logger.info('  Has attendees array?');
  logger.info();

  // Parse the attendees
  const required = (baileysEvent.requiredAttendees || '').split(';').filter(e => e.trim());
  const optional = (baileysEvent.optionalAttendees || '').split(';').filter(e => e.trim());

  logger.info('Required attendees count:', { arg0: required.length });
  logger.info('Optional attendees count:', { arg0: optional.length });
  logger.info('\nSample required attendees:');
  required.slice(0, 3).forEach(email => logger.info('  -');
}
