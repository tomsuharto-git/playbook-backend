/**
 * Unified Email Processing Handler
 *
 * Single entry point for all email processing (Gmail and Outlook)
 * Uses the central processor to create appropriate entities
 *
 * Created: October 28, 2025
 * Part of the Three-Entity Architecture refactoring
 */

const centralProcessor = require('./central-processor');
const { supabase } = require('../db/supabase-client');

class UnifiedEmailHandler {
  constructor() {
    this.processedCache = new Map();
    this.cacheExpiry = 60 * 60 * 1000; // 1 hour
  }

  /**
   * Process an email from any source
   */
  async processEmail(emailData, source = 'gmail') {
    try {
      console.log(`\n📧 [EMAIL HANDLER] Processing ${source} email`);
      console.log(`   Subject: ${emailData.subject}`);
      console.log(`   From: ${emailData.from}`);

      // Step 1: Check if already processed (deduplication)
      const isDuplicate = await this.checkDuplicate(emailData, source);
      if (isDuplicate) {
        console.log(`   ⏭️  Email already processed, skipping`);
        return { skipped: true, reason: 'duplicate' };
      }

      // Step 2: Normalize email data for central processor
      const normalizedInput = this.normalizeEmail(emailData, source);

      // Step 3: Send to central processor
      const results = await centralProcessor.process(normalizedInput);

      // Step 4: Record as processed
      await this.markAsProcessed(emailData, source, results);

      // Step 5: Create email-specific relationships
      await this.createEmailRelationships(emailData, results);

      console.log(`\n✅ [EMAIL HANDLER] Processing complete`);
      console.log(`   Created: ${results.tasks.length} tasks, ${results.events.length} events, ${results.narratives.length} narratives`);

      return {
        success: true,
        results,
        source
      };

    } catch (error) {
      console.error(`❌ [EMAIL HANDLER] Error:`, error);
      return {
        success: false,
        error: error.message,
        source
      };
    }
  }

  /**
   * Check if email has already been processed
   */
  async checkDuplicate(emailData, source) {
    // Check cache first
    const cacheKey = `${source}:${emailData.id || emailData.email_id}`;
    if (this.processedCache.has(cacheKey)) {
      const cached = this.processedCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheExpiry) {
        return true;
      }
    }

    // Check database
    const { data: existing } = await supabase
      .from('processed_emails')
      .select('id')
      .eq('email_id', emailData.id || emailData.email_id)
      .eq('source', source)
      .single();

    if (existing) {
      // Add to cache
      this.processedCache.set(cacheKey, {
        timestamp: Date.now()
      });
      return true;
    }

    return false;
  }

  /**
   * Normalize email data for central processor
   */
  normalizeEmail(emailData, source) {
    // Extract key information
    const normalized = {
      source: 'email',
      email_source: source,
      email_id: emailData.id || emailData.email_id || emailData.messageId,
      from: this.extractEmailAddress(emailData.from),
      to: this.extractEmailAddresses(emailData.to),
      cc: this.extractEmailAddresses(emailData.cc),
      subject: emailData.subject || '(no subject)',
      body: this.extractBody(emailData),
      received_date: this.extractDate(emailData),
      attachments: emailData.attachments || [],
      labels: emailData.labels || emailData.categories || [],
      thread_id: emailData.threadId || emailData.conversationId,
      importance: this.extractImportance(emailData),

      // Metadata for processor
      metadata: {
        source_system: source,
        has_attachments: (emailData.attachments?.length || 0) > 0,
        is_reply: this.isReply(emailData),
        is_forward: this.isForward(emailData),
        mentions_task: this.containsTaskKeywords(emailData),
        mentions_meeting: this.containsMeetingKeywords(emailData)
      }
    };

    return normalized;
  }

  /**
   * Extract email address from various formats
   */
  extractEmailAddress(fromField) {
    if (!fromField) return null;

    if (typeof fromField === 'string') {
      // Extract email from "Name <email@domain.com>" format
      const match = fromField.match(/<(.+?)>/);
      return match ? match[1] : fromField;
    }

    if (fromField.emailAddress) {
      return fromField.emailAddress.address || fromField.emailAddress;
    }

    return fromField.address || fromField;
  }

  /**
   * Extract multiple email addresses
   */
  extractEmailAddresses(field) {
    if (!field) return [];

    if (typeof field === 'string') {
      return field.split(/[,;]/).map(e => this.extractEmailAddress(e.trim())).filter(Boolean);
    }

    if (Array.isArray(field)) {
      return field.map(e => this.extractEmailAddress(e)).filter(Boolean);
    }

    return [];
  }

  /**
   * Extract body text from various email formats
   */
  extractBody(emailData) {
    // Try different body fields
    const bodyFields = [
      emailData.body,
      emailData.bodyText,
      emailData.textBody,
      emailData.body?.content,
      emailData.snippet
    ];

    for (const field of bodyFields) {
      if (field) {
        // Clean HTML if present
        if (typeof field === 'string' && field.includes('<')) {
          return this.stripHtml(field);
        }
        return field;
      }
    }

    return '';
  }

  /**
   * Strip HTML tags from text
   */
  stripHtml(html) {
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extract date from email data
   */
  extractDate(emailData) {
    const dateFields = [
      emailData.received_date,
      emailData.receivedDateTime,
      emailData.date,
      emailData.internalDate
    ];

    for (const field of dateFields) {
      if (field) {
        if (typeof field === 'number') {
          // Unix timestamp
          return new Date(field);
        }
        return new Date(field);
      }
    }

    return new Date();
  }

  /**
   * Extract importance/priority
   */
  extractImportance(emailData) {
    // Check various importance indicators
    if (emailData.importance === 'high' || emailData.priority === 'high') {
      return 'high';
    }

    if (emailData.isImportant || emailData.isFlagged) {
      return 'high';
    }

    // Check for importance keywords in subject
    const subject = (emailData.subject || '').toLowerCase();
    if (subject.includes('urgent') || subject.includes('asap') || subject.includes('important')) {
      return 'high';
    }

    return 'normal';
  }

  /**
   * Check if email is a reply
   */
  isReply(emailData) {
    const subject = (emailData.subject || '').toLowerCase();
    return subject.startsWith('re:') || subject.includes('re:');
  }

  /**
   * Check if email is a forward
   */
  isForward(emailData) {
    const subject = (emailData.subject || '').toLowerCase();
    return subject.startsWith('fwd:') || subject.includes('fwd:') ||
           subject.startsWith('fw:') || subject.includes('fw:');
  }

  /**
   * Check for task-related keywords
   */
  containsTaskKeywords(emailData) {
    const text = `${emailData.subject || ''} ${this.extractBody(emailData)}`.toLowerCase();
    const taskKeywords = [
      'action item', 'todo', 'to do', 'to-do',
      'please', 'could you', 'can you', 'will you',
      'by tomorrow', 'by monday', 'by friday', 'deadline',
      'asap', 'urgent', 'priority', 'deliverable'
    ];

    return taskKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Check for meeting-related keywords
   */
  containsMeetingKeywords(emailData) {
    const text = `${emailData.subject || ''} ${this.extractBody(emailData)}`.toLowerCase();
    const meetingKeywords = [
      'meeting', 'call', 'sync', 'standup', 'stand-up',
      'discussion', 'review', 'presentation', 'demo',
      'agenda', 'minutes', 'invite', 'calendar',
      'zoom', 'teams', 'webex', 'hangout'
    ];

    return meetingKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Mark email as processed in database
   */
  async markAsProcessed(emailData, source, results) {
    const processedEntry = {
      email_id: emailData.id || emailData.email_id || emailData.messageId,
      source,
      subject: emailData.subject,
      from_email: this.extractEmailAddress(emailData.from),
      received_date: this.extractDate(emailData),
      processed_at: new Date(),
      entities_created: {
        tasks: results.tasks.length,
        events: results.events.length,
        narratives: results.narratives.length
      },
      thread_id: emailData.threadId || emailData.conversationId
    };

    const { error } = await supabase
      .from('processed_emails')
      .upsert(processedEntry, {
        onConflict: 'email_id,source'
      });

    if (error) {
      console.error('Failed to mark email as processed:', error);
    } else {
      // Add to cache
      const cacheKey = `${source}:${emailData.id || emailData.email_id}`;
      this.processedCache.set(cacheKey, {
        timestamp: Date.now()
      });
    }
  }

  /**
   * Create email-specific entity relationships
   */
  async createEmailRelationships(emailData, results) {
    // Future implementation:
    // - Link all entities to the same email thread
    // - Create conversation chains
    // - Track email-to-task conversions

    if (emailData.threadId && results.tasks.length > 0) {
      console.log(`   🔗 Would link ${results.tasks.length} tasks to thread ${emailData.threadId}`);
    }
  }

  /**
   * Process multiple emails in batch
   */
  async processBatch(emails, source = 'gmail') {
    console.log(`\n📧 [EMAIL HANDLER] Processing batch of ${emails.length} ${source} emails`);

    const results = {
      processed: 0,
      skipped: 0,
      errors: 0,
      entities: {
        tasks: 0,
        events: 0,
        narratives: 0
      }
    };

    for (const email of emails) {
      try {
        const result = await this.processEmail(email, source);

        if (result.skipped) {
          results.skipped++;
        } else if (result.success) {
          results.processed++;
          results.entities.tasks += result.results.tasks.length;
          results.entities.events += result.results.events.length;
          results.entities.narratives += result.results.narratives.length;
        } else {
          results.errors++;
        }
      } catch (error) {
        console.error(`Error processing email:`, error);
        results.errors++;
      }
    }

    console.log(`\n📊 [EMAIL HANDLER] Batch complete:`);
    console.log(`   Processed: ${results.processed}`);
    console.log(`   Skipped: ${results.skipped}`);
    console.log(`   Errors: ${results.errors}`);
    console.log(`   Created: ${results.entities.tasks} tasks, ${results.entities.events} events, ${results.entities.narratives} narratives`);

    return results;
  }

  /**
   * Clean up old processed email records
   */
  async cleanupOldRecords(daysToKeep = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const { error } = await supabase
      .from('processed_emails')
      .delete()
      .lt('processed_at', cutoffDate.toISOString());

    if (!error) {
      console.log(`🧹 Cleaned up processed email records older than ${daysToKeep} days`);
    }

    // Clear cache
    this.processedCache.clear();
  }
}

// Export singleton instance
module.exports = new UnifiedEmailHandler();