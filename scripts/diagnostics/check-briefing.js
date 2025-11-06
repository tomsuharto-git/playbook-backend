const https = require('http');
const logger = require('../../utils/logger');

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

    logger.info('F1 Qualifying Event Briefing Check:');
    logger.info('Summary:');
    logger.info('Has ai_briefing?');
    logger.info('AI Briefing content:');
    logger.info('');
    logger.info('Has vault_context?');
    logger.info('Vault Context:');
    logger.info('');
    logger.info('Relevant tasks:');
    logger.info('');
    logger.info('All event keys:');
  });
});

req.on('error', (error) => {
  logger.error('Error:', { arg0: error });
});

req.end();
