const axios = require('axios');
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

      console.log(`📧 Found ${results.length} Playbook emails`);
      return results;
    } catch (error) {
      console.error('Failed to search Gmail:', error);
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
      
      console.log(`📥 Downloading from Google Drive: ${fileId}`);
      
      const response = await axios.get(downloadUrl, {
        responseType: 'json',
        timeout: 30000
      });

      return response.data;
    } catch (error) {
      console.error('Failed to download from Google Drive:', error.message);
      
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
        console.log('⚠️  Could not parse email body');
        return false;
      }

      console.log(`📋 Processing ${fileInfo.type} for ${fileInfo.date}`);

      // Download file from Google Drive
      const fileData = await this.downloadFromGDrive(fileInfo.link);
      
      if (!fileData) {
        console.log('❌ Failed to download file');
        return false;
      }

      // Process based on type
      if (fileInfo.type === 'calendar') {
        await processCalendarData(fileData, fileInfo.date);
      } else if (fileInfo.type === 'emails') {
        await processEmailData(fileData, fileInfo.date);
      }

      console.log(`✅ Processed ${fileInfo.type}`);

      // Archive the email (move to processed folder)
      await this.archiveEmail(email.id);

      return true;
    } catch (error) {
      console.error('Error processing email:', error);
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
      
      console.log(`📁 Archived email: ${emailId}`);
    } catch (error) {
      console.error('Failed to archive email:', error);
    }
  }

  /**
   * Main sync function - call this on cron schedule
   */
  async sync() {
    console.log('🔄 Starting Gmail → Google Drive sync...');

    try {
      // Find unprocessed emails
      const emails = await this.findPlaybookEmails();

      if (emails.length === 0) {
        console.log('📭 No new Playbook emails found');
        return;
      }

      // Process each email
      let successCount = 0;
      for (const email of emails) {
        const success = await this.processEmail(email);
        if (success) successCount++;
      }

      console.log(`✅ Sync complete: ${successCount}/${emails.length} processed`);

    } catch (error) {
      console.error('❌ Sync failed:', error);
    }
  }
}

module.exports = GmailGDriveSync;
