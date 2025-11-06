/**
 * Debug script to check what data is in the Outlook calendar file
 */

const { getLatestCalendarFile } = require('./services/outlook-calendar');
const fs = require('fs');

async function debugOutlookData() {
  console.log('🔍 Fetching latest Outlook calendar file...\n');

  try {
    const calendarFile = await getLatestCalendarFile();

    if (!calendarFile) {
      console.log('❌ No calendar file found');
      return;
    }

    console.log(`\n📄 File name: ${calendarFile.name}`);
    console.log(`📊 Data structure:`, typeof calendarFile.data);

    // Check if data has 'value' property
    if (calendarFile.data.value) {
      console.log(`\n✅ Has 'value' property with ${calendarFile.data.value.length} items`);

      // Show first event structure
      if (calendarFile.data.value.length > 0) {
        const firstEvent = calendarFile.data.value[0];
        console.log('\n📋 First event structure:');
        console.log('Keys:', Object.keys(firstEvent));
        console.log('\nFirst event full data:');
        console.log(JSON.stringify(firstEvent, null, 2));

        // Check for required fields
        console.log('\n🔍 Field check:');
        console.log(`  - id: ${firstEvent.id ? '✅' : '❌'}`);
        console.log(`  - subject: ${firstEvent.subject ? '✅' : '❌'} (value: "${firstEvent.subject}")`);
        console.log(`  - start: ${firstEvent.start ? '✅' : '❌'}`);
        console.log(`  - end: ${firstEvent.end ? '✅' : '❌'}`);
        console.log(`  - isAllDay: ${firstEvent.isAllDay !== undefined ? '✅' : '❌'}`);
      }

      // Show last 5 events to see if pattern continues
      console.log('\n📋 Last 5 event titles:');
      const last5 = calendarFile.data.value.slice(-5);
      last5.forEach((event, i) => {
        console.log(`  ${i + 1}. "${event.subject || 'NO SUBJECT'}" - ${event.start || 'NO START'}`);
      });

    } else {
      console.log('❌ No "value" property found in data');
      console.log('Data keys:', Object.keys(calendarFile.data));

      // Save raw data to file for inspection
      fs.writeFileSync('./temp-outlook-data.json', JSON.stringify(calendarFile.data, null, 2));
      console.log('\n💾 Saved raw data to temp-outlook-data.json');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

debugOutlookData();
