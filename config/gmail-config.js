/**
 * Gmail Config Helper
 * Loads credentials from file (local) or environment variable (Railway)
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

function getGmailCredentials() {
  // Railway: use environment variable
  if (process.env.GMAIL_CREDENTIALS) {
    try {
      return JSON.parse(process.env.GMAIL_CREDENTIALS);
    } catch (error) {
      logger.error('Failed to parse GMAIL_CREDENTIALS:', { arg0: error.message });
      throw error;
    }
  }
  
  // Local: use file
  const credPath = path.join(__dirname, '..', 'gmail-credentials.json');
  try {
    return JSON.parse(fs.readFileSync(credPath, 'utf8'));
  } catch (error) {
    logger.error('gmail-credentials.json not found. Run: node scripts/authorize-gmail.js');
    throw error;
  }
}

function getGmailToken() {
  // Railway: use environment variable
  if (process.env.GMAIL_TOKEN) {
    try {
      return JSON.parse(process.env.GMAIL_TOKEN);
    } catch (error) {
      logger.error('Failed to parse GMAIL_TOKEN:', { arg0: error.message });
      throw error;
    }
  }
  
  // Local: use file
  const tokenPath = path.join(__dirname, '..', 'gmail-token.json');
  try {
    return JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  } catch (error) {
    logger.error('gmail-token.json not found. Run: node scripts/authorize-gmail.js');
    throw error;
  }
}

function saveGmailToken(token) {
  // Railway: can't save to environment, just use existing
  if (process.env.GMAIL_TOKEN) {
    logger.warn('⚠️  Running on Railway - token updates require manual refresh');
    return;
  }
  
  // Local: save to file
  const tokenPath = path.join(__dirname, '..', 'gmail-token.json');
  fs.writeFileSync(tokenPath, JSON.stringify(token, null, 2));
}

module.exports = { 
  getGmailCredentials, 
  getGmailToken,
  saveGmailToken
};
