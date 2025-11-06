const axios = require('axios');
const logger = require('../utils/logger').service('gmail-gdrive-sync');
const { processCalendarData, processEmailData } = require('./data-processor');

/**
 * Gmail MCP Integration for Google Drive Links
 * This service checks Gmail for Power Automate notifications
 * containing Google Drive links, downloads files, and processes them.
 */

class GmailGDriveSync {
  constructor(gmailMCP) {
    this.gmailMCP = gmailMCP; // Gmail MCP client (pass from server)
  }

  /**
   * Search Gmail for recent Playbook notification emails
   */
  async findPlaybookEmails() {
    try {
      // Search for emails from last 2 hours with our specific subject
      const query = 'subject:"Playbook-GDrive-Link" newer_than:2h';
      
      const results = await this.gmailMCP.search({
        query,
        maxResults: 10
      });

      logger.info('📧 Found  Playbook emails', { length: results.length });
      return results;
    } catch (error) {
      logger.error('Failed to search Gmail:', { arg0: error });
      return [];
    }
  }

  /**
   * Parse email body to extract file info
   */
  parseEmailBody(emailBody) {
    // Expected format:
    // Type: calendar
    // Date: 2025-10-08
    // Link: https://drive.google.com/file/d/...
    
    const typeMatch = emailBody.match(/Type:\s*(\w+)/);
    const dateMatch = emailBody.match(/Date:\s*(\d{4}-\d{2}-\d{2})/);
    const linkMatch = emailBody.match(/Link:\s*(https:\/\/drive\.google\.com[^\s]+)/);

    if (!typeMatch || !dateMatch || !linkMatch) {
      return null;
    }

    return {
      type: typeMatch[1],
      date: dateMatch[1],
      link: linkMatch[1]
    };
  }

  /**
   * Download file from Google Drive share link
   */
  async downloadFromGDrive(shareUrl) {
    try {
      // Extract file ID from share URL
      const fileId = shareUrl.match(/\/d\/([^/]+)/)?.[1] || 
                     shareUrl.match(/id=([^&]+)/)?.[1];
      
      if (!fileId) {
        throw new Error('Could not extract file ID from link');
      }

      // Convert to direct download URL
      const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
      
      logger.info('📥 Downloading from Google Drive:', { fileId: fileId });
      
      const response = await axios.get(downloadUrl, {
        responseType: 'json',
        timeout: 30000
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to download from Google Drive:', { arg0: error.message });
      
      // Try alternate download method (for larger files)
      if (error.response?.status === 302) {
        const confirmUrl = error.response.headers.location;
        const retryResponse = await axios.get(confirmUrl, { responseType: 'json' });
        return retryResponse.data;
      }
      
      throw error;
    }
  }

  /**
   * Process a single Playbook email
   */
  async processEmail(email) {
    try {
      const emailBody = email.snippet || email.body;
      const fileInfo = this.parseEmailBody(emailBody);

      if (!fileInfo) {
        logger.warn('⚠️  Could not parse email body');
        return false;
      }

      logger.info('📋 Processing  for', { type: fileInfo.type, date: fileInfo.date });

      // Download file from Google Drive
      const fileData = await this.downloadFromGDrive(fileInfo.link);
      
      if (!fileData) {
        logger.error('❌ Failed to download file');
        return false;
      }

      // Process based on type
      if (fileInfo.type === 'calendar') {
        await processCalendarData(fileData, fileInfo.date);
      } else if (fileInfo.type === 'emails') {
        await processEmailData(fileData, fileInfo.date);
      }

      logger.info('✅ Processed', { type: fileInfo.type });

      // Archive the email (move to processed folder)
      await this.archiveEmail(email.id);

      return true;
    } catch (error) {
      logger.error('Error processing email:', { arg0: error });
      return false;
    }
  }

  /**
   * Archive email after processing
   */
  async archiveEmail(emailId) {
    try {
      // Move to archive label (or delete if preferred)
      await this.gmailMCP.modifyLabels(emailId, {
        addLabelIds: ['PROCESSED'], // Create this label in Gmail
        removeLabelIds: ['INBOX']
      });
      
      logger.info('📁 Archived email:', { emailId: emailId });
    } catch (error) {
      logger.error('Failed to archive email:', { arg0: error });
    }
  }

  /**
   * Main sync function - call this on cron schedule
   */
  async sync() {
    logger.info('🔄 Starting Gmail → Google Drive sync...');

    try {
      // Find unprocessed emails
      const emails = await this.findPlaybookEmails();

      if (emails.length === 0) {
        logger.info('📭 No new Playbook emails found');
        return;
      }

      // Process each email
      let successCount = 0;
      for (const email of emails) {
        const success = await this.processEmail(email);
        if (success) successCount++;
      }

      logger.info('✅ Sync complete: / processed', { successCount: successCount, length: emails.length });

    } catch (error) {
      logger.error('❌ Sync failed:', { arg0: error });
    }
  }
}

module.exports = GmailGDriveSync;
