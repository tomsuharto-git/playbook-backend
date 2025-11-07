/**
 * Unified Duplicate Detection Service
 *
 * Single source of truth for detecting duplicate tasks/events/narratives.
 * Consolidates 3+ different duplicate detection implementations into one service.
 *
 * Features:
 * - Levenshtein similarity matching (80% threshold)
 * - Action synonym matching for semantic understanding
 * - In-memory caching for performance
 * - Configurable similarity thresholds
 * - Database query optimization
 */

const levenshtein = require('fast-levenshtein');
const { supabase } = require('../db/supabase-client');
const logger = require('../utils/logger').service('duplicate-detector');

// Action synonyms for semantic matching
const ACTION_SYNONYMS = {
  'setup': ['set up', 'configure', 'establish', 'initialize'],
  'complete': ['finish', 'finalize', 'wrap up'],
  'review': ['check', 'examine', 'look at', 'assess'],
  'create': ['make', 'build', 'develop', 'generate'],
  'update': ['modify', 'change', 'edit', 'revise'],
  'send': ['email', 'forward', 'share'],
  'schedule': ['set up', 'arrange', 'plan'],
  'prepare': ['get ready', 'draft', 'outline']
};

class DuplicateDetector {
  constructor(config = {}) {
    this.similarityThreshold = config.similarityThreshold || 0.80; // 80% default
    this.enableSynonymMatching = config.enableSynonymMatching !== false;
    this.cache = new Map(); // In-memory cache for recent checks
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Check if a task/event/narrative is a duplicate
   *
   * @param {Object} item - The item to check (must have 'title' or 'description')
   * @param {string} item.title - Title or summary of the item
   * @param {string} item.description - Description or body of the item
   * @param {string} entityType - 'task', 'event', or 'narrative'
   * @param {Object} options - Additional filtering options
   * @param {number} options.timeWindow - Days to look back (default: 7)
   * @param {string} options.projectId - Filter by project
   * @returns {Promise<Object>} { isDuplicate: boolean, matchedItem: object|null, similarity: number }
   */
  async checkDuplicate(item, entityType, options = {}) {
    const cacheKey = this._getCacheKey(item, entityType);

    // Check cache first
    const cached = this._getFromCache(cacheKey);
    if (cached !== null) {
      const cacheAge = Date.now() - cached.timestamp;
      logger.debug('Cache hit for duplicate check', { entityType, cacheAge });
      return cached.value;
    }

    // Query existing items from database
    const existingItems = await this._fetchExistingItems(entityType, options);
    logger.debug('Fetched existing items for duplicate check', {
      entityType,
      itemCount: existingItems.length
    });

    // Find matches
    for (const existingItem of existingItems) {
      const similarity = this._calculateSimilarity(item, existingItem);

      if (similarity >= this.similarityThreshold) {
        const result = {
          isDuplicate: true,
          matchedItem: existingItem,
          similarity: parseFloat(similarity.toFixed(2))
        };
        this._saveToCache(cacheKey, result);

        logger.info('Duplicate detected', {
          entityType,
          similarity: result.similarity,
          itemTitle: this._extractText(item).substring(0, 50),
          matchedTitle: this._extractText(existingItem).substring(0, 50)
        });

        return result;
      }
    }

    const result = { isDuplicate: false, matchedItem: null };
    this._saveToCache(cacheKey, result);
    return result;
  }

  /**
   * Calculate similarity between two items
   *
   * @param {Object} item1 - First item
   * @param {Object} item2 - Second item
   * @returns {number} Similarity score (0-1)
   */
  _calculateSimilarity(item1, item2) {
    const text1 = this._extractText(item1).toLowerCase();
    const text2 = this._extractText(item2).toLowerCase();

    // Exact match
    if (text1 === text2) {
      logger.debug('Exact match found');
      return 1.0;
    }

    // Levenshtein distance similarity
    const distance = levenshtein.get(text1, text2);
    const maxLength = Math.max(text1.length, text2.length);
    let similarity = 1 - (distance / maxLength);

    // Boost similarity if action synonyms match
    if (this.enableSynonymMatching && this._hasSynonymMatch(text1, text2)) {
      similarity = Math.min(1.0, similarity + 0.15); // Boost by 15%
      logger.debug('Synonym match boost applied', {
        originalSimilarity: (similarity - 0.15).toFixed(2),
        boostedSimilarity: similarity.toFixed(2)
      });
    }

    return similarity;
  }

  /**
   * Check if two texts have synonym matches
   *
   * @param {string} text1 - First text
   * @param {string} text2 - Second text
   * @returns {boolean} True if synonym match found
   */
  _hasSynonymMatch(text1, text2) {
    for (const [action, synonyms] of Object.entries(ACTION_SYNONYMS)) {
      const hasInText1 = [action, ...synonyms].some(word => text1.includes(word));
      const hasInText2 = [action, ...synonyms].some(word => text2.includes(word));
      if (hasInText1 && hasInText2) {
        logger.debug('Synonym match found', { action, text1Sample: text1.substring(0, 30) });
        return true;
      }
    }
    return false;
  }

  /**
   * Extract searchable text from item
   *
   * @param {Object} item - Item to extract text from
   * @returns {string} Searchable text
   */
  _extractText(item) {
    return item.title || item.summary || item.description || item.subject || '';
  }

  /**
   * Fetch existing items from database
   *
   * @param {string} entityType - 'task', 'event', or 'narrative'
   * @param {Object} options - Filtering options
   * @returns {Promise<Array>} Array of existing items
   */
  async _fetchExistingItems(entityType, options = {}) {
    const table = entityType + 's'; // tasks, events, narratives
    const timeWindow = options.timeWindow || 7; // days
    const cutoffDate = new Date(Date.now() - timeWindow * 24 * 60 * 60 * 1000);

    let query = supabase
      .from(table)
      .select('*')
      .gte('created_at', cutoffDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(100);

    // Optional project filter
    if (options.projectId) {
      query = query.eq('project_id', options.projectId);
    }

    // Optional status filter (skip completed tasks)
    if (entityType === 'task' && !options.includeCompleted) {
      query = query.neq('status', 'completed');
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Error fetching items for duplicate check', {
        entityType,
        error: error.message
      });
      return [];
    }

    return data || [];
  }

  /**
   * Generate cache key
   *
   * @param {Object} item - Item to cache
   * @param {string} entityType - Entity type
   * @returns {string} Cache key
   */
  _getCacheKey(item, entityType) {
    const text = this._extractText(item);
    return `${entityType}:${text.substring(0, 50)}`;
  }

  /**
   * Get from cache
   *
   * @param {string} key - Cache key
   * @returns {Object|null} Cached value or null
   */
  _getFromCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.cacheExpiry) {
      this.cache.delete(key);
      return null;
    }

    return cached;
  }

  /**
   * Save to cache
   *
   * @param {string} key - Cache key
   * @param {Object} value - Value to cache
   */
  _saveToCache(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });

    // Cleanup old cache entries (keep max 1000)
    if (this.cache.size > 1000) {
      const oldestKeys = Array.from(this.cache.keys()).slice(0, 100);
      oldestKeys.forEach(k => this.cache.delete(k));
      logger.debug('Cache cleanup performed', { removedEntries: 100 });
    }
  }

  /**
   * Clear cache (useful for testing)
   */
  clearCache() {
    const size = this.cache.size;
    this.cache.clear();
    logger.info('Cache cleared', { previousSize: size });
  }

  /**
   * Get cache stats
   *
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      expiryMs: this.cacheExpiry,
      threshold: this.similarityThreshold,
      synonymMatchingEnabled: this.enableSynonymMatching
    };
  }
}

// Export singleton instance
module.exports = new DuplicateDetector();

// Also export class for testing with custom config
module.exports.DuplicateDetector = DuplicateDetector;
