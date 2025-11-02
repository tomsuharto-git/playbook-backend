const { supabase } = require('./db/supabase-client');

(async () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  console.log('==========================================');
  console.log('   FORENSIC ANALYSIS - BRIEF PAGE BUG');
  console.log('==========================================\n');
  console.log('Date being checked:', today);
  console.log('Current ET time:', new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));

  // 1. Check database state
  console.log('\n--- DATABASE CHECK ---');
  const { data, error } = await supabase
    .from('daily_briefs')
    .select('*')
    .eq('date', today)
    .single();

  if (error) {
    console.log('ERROR fetching from database:', error.message);
    process.exit(1);
  }

  if (!data) {
    console.log('NO DATA found in database for today');
    process.exit(0);
  }

  console.log('Database record last updated:', data.updated_at);
  console.log('Total events in database:', data.calendar_events?.length || 0);

  const events = data.calendar_events || [];

  // 2. Analyze each event
  console.log('\n--- EVENT ANALYSIS ---');
  let validCount = 0;
  let invalidCount = 0;

  events.forEach((e, i) => {
    const summary = e.summary || e.subject || null;
    const startTime = e.start?.dateTime || e.start?.date || null;
    const isValid = summary && startTime;

    if (isValid) {
      validCount++;
    } else {
      invalidCount++;
      console.log(`\nINVALID EVENT #${i+1}:`);
      console.log(`  Summary: ${summary || 'MISSING'}`);
      console.log(`  Start: ${startTime || 'MISSING'}`);
      console.log(`  Category: ${e.calendar_category || 'unknown'}`);
      console.log(`  Raw keys: ${Object.keys(e).join(', ')}`);
    }
  });

  console.log(`\nSummary: ${validCount} valid, ${invalidCount} invalid`);

  // 3. Check what frontend would receive
  console.log('\n--- FRONTEND API CHECK ---');
  console.log('Testing: GET /api/calendar/briefings endpoint...');

  const axios = require('axios');
  try {
    const response = await axios.get('http://localhost:3001/api/calendar/briefings', {
      params: { days: 2 }
    });

    const todayBrief = response.data.find(b => b.date === today);
    if (todayBrief) {
      console.log(`API returned ${todayBrief.events?.length || 0} events for today`);

      const apiInvalid = todayBrief.events?.filter(e => !e.summary || !e.start?.dateTime && !e.start?.date) || [];
      if (apiInvalid.length > 0) {
        console.log(`WARNING: API is serving ${apiInvalid.length} invalid events!`);
        apiInvalid.forEach((e, i) => {
          console.log(`  Invalid #${i+1}: ${e.summary || 'NO SUMMARY'} - ${e.start?.dateTime || e.start?.date || 'NO TIME'}`);
        });
      } else {
        console.log('✓ API events appear valid');
      }
    } else {
      console.log('WARNING: API did not return data for today');
    }
  } catch (err) {
    console.log('ERROR calling API:', err.message);
  }

  // 4. Check for concurrent writes
  console.log('\n--- CONCURRENT WRITE CHECK ---');
  const { data: allBriefs } = await supabase
    .from('daily_briefs')
    .select('date, updated_at')
    .order('updated_at', { ascending: false })
    .limit(5);

  console.log('Recent database updates:');
  allBriefs?.forEach(b => {
    console.log(`  ${b.date}: ${b.updated_at}`);
  });

  console.log('\n==========================================');
  console.log('   END FORENSIC ANALYSIS');
  console.log('==========================================\n');

  process.exit(0);
})();
