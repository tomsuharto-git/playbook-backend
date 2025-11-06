require('dotenv').config();
const axios = require('axios');

async function checkRawData() {
  const CALENDAR_FOLDER_ID = '15CJiwytPs1A0rAIectouqr8xExIYMiMf';

  // Get latest file
  const listUrl = `https://www.googleapis.com/drive/v3/files?q='${CALENDAR_FOLDER_ID}'+in+parents&orderBy=modifiedTime desc&pageSize=1&fields=files(id,name,modifiedTime)&key=${process.env.GOOGLE_API_KEY}`;
  const listResponse = await axios.get(listUrl);
  const file = listResponse.data.files[0];

  console.log('📄 Checking file:', file.name);

  // Download file
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${process.env.GOOGLE_API_KEY}`;
  const downloadResponse = await axios.get(downloadUrl);

  // Find a work event
  const events = downloadResponse.data.value || [];
  const baileysEvent = events.find(e => e.subject && e.subject.includes('Baileys'));
  const therabodyEvent = events.find(e => e.subject && e.subject.includes('Therabody'));

  console.log('\n📊 Total events in file:', events.length);
  console.log();

  if (baileysEvent) {
    console.log('✅ Found Baileys event:');
    console.log('  Subject:', baileysEvent.subject);
    console.log('  Has attendees field?', baileysEvent.attendees !== undefined);
    console.log('  Attendees count:', baileysEvent.attendees ? baileysEvent.attendees.length : 0);
    if (baileysEvent.attendees && baileysEvent.attendees.length > 0) {
      console.log('  Sample attendee:', JSON.stringify(baileysEvent.attendees[0], null, 2));
    }
    console.log();
  }

  if (therabodyEvent) {
    console.log('✅ Found Therabody event:');
    console.log('  Subject:', therabodyEvent.subject);
    console.log('  Has attendees field?', therabodyEvent.attendees !== undefined);
    console.log('  Attendees count:', therabodyEvent.attendees ? therabodyEvent.attendees.length : 0);
    if (therabodyEvent.attendees && therabodyEvent.attendees.length > 0) {
      console.log('  Sample attendee:', JSON.stringify(therabodyEvent.attendees[0], null, 2));
    }
  }

  if (!baileysEvent && !therabodyEvent) {
    console.log('⚠️  No Baileys or Therabody events found in file');
    console.log('\nSample event structure (first event):');
    const sample = events[0] || {};
    console.log('  Keys:', Object.keys(sample).join(', '));
    console.log('  Subject:', sample.subject);
    console.log('  Has attendees?', sample.attendees !== undefined);
  }
}

checkRawData()
  .then(() => process.exit(0))
  .catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
  });
