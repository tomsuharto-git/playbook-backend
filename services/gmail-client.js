const logger = require('../utils/logger').service('gmail-client');

/**
 * Gmail API Client
 * Uses official Gmail API (not MCP)
 */

const { google } = require('googleapis');
const { getGmailCredentials, getGmailToken, saveGmailToken } = require('../config/gmail-config');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.labels'
];

class GmailClient {
  constructor() {
    this.gmail = null;
    this.auth = null;
  }

  async initialize() {
    if (this.gmail) return; // Already initialized

    try {
      // Load credentials (from file or env)
      const credentials = getGmailCredentials();
      const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

      const oAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
      );

      // Load token (from file or env)
      const token = getGmailToken();
      oAuth2Client.setCredentials(token);

      // Set up token refresh handler
      oAuth2Client.on('tokens', (tokens) => {
        if (tokens.refresh_token) {
          const currentToken = getGmailToken();
          currentToken.refresh_token = tokens.refresh_token;
          saveGmailToken(currentToken);
        }
        if (tokens.access_token) {
          logger.info('🔄 Access token refreshed');
        }
      });

      this.auth = oAuth2Client;
      this.gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
      
      logger.info('✅ Gmail API client initialized');
    } catch (error) {
      logger.error('❌ Gmail API initialization error:', { arg0: error.message });
      throw error;
    }
  }

  async search(query, maxResults = 50) {
    await this.initialize();

    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: maxResults
      });

      const messages = response.data.messages || [];
      
      // Fetch full message details
      const fullMessages = await Promise.all(
        messages.map(msg => this.read(msg.id))
      );

      return fullMessages.filter(m => m !== null);
    } catch (error) {
      logger.error('Gmail search error:', { arg0: error.message });
      return [];
    }
  }

  async read(messageId) {
    await this.initialize();

    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      const message = response.data;
      const headers = message.payload.headers;

      // Extract email data
      const getHeader = (name) => {
        const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
        return header ? header.value : '';
      };

      // Get email body
      let body = '';
      if (message.payload.body.size > 0) {
        body = Buffer.from(message.payload.body.data, 'base64').toString('utf8');
      } else if (message.payload.parts) {
        // Multi-part email
        const textPart = message.payload.parts.find(p => p.mimeType === 'text/plain') ||
                        message.payload.parts.find(p => p.mimeType === 'text/html');
        if (textPart && textPart.body.data) {
          body = Buffer.from(textPart.body.data, 'base64').toString('utf8');
        }
      }

      // Strip HTML tags if HTML email
      body = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

      return {
        id: message.id,
        threadId: message.threadId,
        subject: getHeader('Subject'),
        from: getHeader('From'),
        to: getHeader('To'),
        date: getHeader('Date'),
        body: body,
        snippet: message.snippet,
        labelIds: message.labelIds || [],
        hasAttachments: message.payload.parts?.some(p => p.filename) || false
      };
    } catch (error) {
      logger.error('Gmail read error ():', { messageId: messageId });
      return null;
    }
  }

  async getProfile() {
    await this.initialize();

    try {
      const response = await this.gmail.users.getProfile({ userId: 'me' });
      return response.data;
    } catch (error) {
      logger.error('Gmail profile error:', { arg0: error.message });
      return null;
    }
  }

  async listLabels() {
    await this.initialize();

    try {
      const response = await this.gmail.users.labels.list({ userId: 'me' });
      return response.data.labels || [];
    } catch (error) {
      logger.error('Gmail labels error:', { arg0: error.message });
      return [];
    }
  }
}

module.exports = new GmailClient();
