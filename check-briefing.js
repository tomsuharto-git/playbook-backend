const https = require('http');

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/calendar/brief?days=2',
  method: 'GET'
};

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    const parsed = JSON.parse(data);
    const events = parsed.eventsByDate['2025-10-18'];
    const f1Event = events.find(e => e.summary.includes('Qualifying'));

    console.log('F1 Qualifying Event Briefing Check:');
    console.log('Summary:', f1Event?.summary);
    console.log('Has ai_briefing?', f1Event?.ai_briefing ? 'YES' : 'NO');
    console.log('AI Briefing content:', f1Event?.ai_briefing || 'NO BRIEFING');
    console.log('');
    console.log('Has vault_context?', f1Event?.vault_context ? 'YES' : 'NO');
    console.log('Vault Context:', f1Event?.vault_context || 'NO VAULT CONTEXT');
    console.log('');
    console.log('Relevant tasks:', f1Event?.relevant_tasks?.length || 0);
    console.log('');
    console.log('All event keys:', Object.keys(f1Event || {}));
  });
});

req.on('error', (error) => {
  console.error('Error:', error);
});

req.end();
