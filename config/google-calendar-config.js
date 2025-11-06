/**
 * Google Calendar Config Helper
 * Loads credentials from file (local) or environment variable (Railway)
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Paths to credentials (in vault root)
// From config/ -> backend/ -> ai-task-manager/ -> Obsidian Vault/
const VAULT_ROOT = path.join(__dirname, '../../..');
const CREDENTIALS_PATH = path.join(VAULT_ROOT, 'credentials.json');
const TOKEN_PATH = path.join(VAULT_ROOT, 'token.json');

function getGoogleCalendarCredentials() {
  // Railway: use environment variable
  if (process.env.GOOGLE_CALENDAR_CREDENTIALS) {
    try {
      return JSON.parse(process.env.GOOGLE_CALENDAR_CREDENTIALS);
    } catch (error) {
      logger.error('Failed to parse GOOGLE_CALENDAR_CREDENTIALS:', { arg0: error.message });
      throw error;
    }
  }

  // Local: use file
  try {
    return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  } catch (error) {
    logger.error('credentials.json not found. Please authorize Google Calendar access.');
    throw error;
  }
}

function getGoogleCalendarToken() {
  // Railway: use environment variable
  if (process.env.GOOGLE_CALENDAR_TOKEN) {
    try {
      return JSON.parse(process.env.GOOGLE_CALENDAR_TOKEN);
    } catch (error) {
      logger.error('Failed to parse GOOGLE_CALENDAR_TOKEN:', { arg0: error.message });
      throw error;
    }
  }

  // Local: use file
  try {
    return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  } catch (error) {
    logger.error('token.json not found. Please authorize Google Calendar access.');
    throw error;
  }
}

function saveGoogleCalendarToken(token) {
  // Railway: can't save to environment, just use existing
  if (process.env.GOOGLE_CALENDAR_TOKEN) {
    logger.warn('⚠️  Running on Railway - token updates require manual refresh');
    return;
  }

  // Local: save to file
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
}

module.exports = {
  getGoogleCalendarCredentials,
  getGoogleCalendarToken,
  saveGoogleCalendarToken
};
