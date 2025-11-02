const data = require('/Users/tomsuharto/Downloads/calendar-2025-10-12-2200.json');

const events = data.value || [];
const baileysEvent = events.find(e => e.subject && e.subject.includes('Baileys'));

if (baileysEvent) {
  console.log('📅 Baileys event structure:\n');
  console.log('Subject:', baileysEvent.subject);
  console.log('\nAttendee fields:');
  console.log('  requiredAttendees:', baileysEvent.requiredAttendees);
  console.log('  optionalAttendees:', baileysEvent.optionalAttendees);
  console.log('  Has attendees array?', baileysEvent.attendees !== undefined);
  console.log();

  // Parse the attendees
  const required = (baileysEvent.requiredAttendees || '').split(';').filter(e => e.trim());
  const optional = (baileysEvent.optionalAttendees || '').split(';').filter(e => e.trim());

  console.log('Required attendees count:', required.length);
  console.log('Optional attendees count:', optional.length);
  console.log('\nSample required attendees:');
  required.slice(0, 3).forEach(email => console.log('  -', email));
}
