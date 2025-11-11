import crypto from 'crypto';
import { getCachedResponse, setCachedResponse } from '../db/sqlite.js';
import logger from '../logger.js';

// Default cache TTL: 1 hour
const DEFAULT_TTL = 3600000;

/**
 * Generate cache key from question + provider + model + persona
 * @param {string} question - User question
 * @param {string} provider - AI provider
 * @param {string} model - Model name
 * @param {string} persona - Custom persona (optional)
 * @returns {string} Cache key (hash)
 */
const generateCacheKey = (question, provider, model, persona = null) => {
  const normalizedQuestion = question.toLowerCase().trim();
  const key = `${normalizedQuestion}|${provider}|${model}|${persona || 'default'}`;
  return crypto.createHash('sha256').update(key).digest('hex');
};

/**
 * Get cached AI response
 * @param {string} question - User question
 * @param {string} provider - AI provider
 * @param {string} model - Model name
 * @param {string} persona - Custom persona (optional)
 * @returns {Object|null} Cached response or null
 */
export const getCachedAIResponse = (question, provider, model, persona = null) => {
  try {
    const key = generateCacheKey(question, provider, model, persona);
    const cached = getCachedResponse(key);
    
    if (cached) {
      logger.info('✅ Cache HIT', { provider, model, question: question.substring(0, 50) });
      return cached;
    }
    
    logger.debug('❌ Cache MISS', { provider, model, question: question.substring(0, 50) });
    return null;
  } catch (error) {
    logger.error('❌ Cache retrieval failed', { error: error.message });
    return null;
  }
};

/**
 * Cache AI response
 * @param {string} question - User question
 * @param {Object} response - AI response to cache
 * @param {string} provider - AI provider
 * @param {string} model - Model name
 * @param {string} persona - Custom persona (optional)
 * @param {number} ttl - Time to live in milliseconds (default: 1 hour)
 */
export const cacheAIResponse = (question, response, provider, model, persona = null, ttl = DEFAULT_TTL) => {
  try {
    const key = generateCacheKey(question, provider, model, persona);
    setCachedResponse(key, response, provider, model, ttl);
    logger.info('💾 Response cached', { 
      provider, 
      model, 
      question: question.substring(0, 50),
      ttl: `${ttl / 1000}s`
    });
  } catch (error) {
    logger.error('❌ Cache storage failed', { error: error.message });
    // Don't throw - caching failure shouldn't break the app
  }
};

/**
 * Check if a question is likely to have a cached response
 * @param {string} question - User question
 * @returns {boolean} True if question is cacheable
 */
export const isCacheable = (question) => {
  // Don't cache very short or very long questions
  if (!question || question.length < 10 || question.length > 1000) {
    return false;
  }

  // Don't cache questions with time-sensitive keywords
  const timeSensitiveKeywords = [
    'today', 'now', 'current', 'latest', 'recent', 'yesterday',
    'this week', 'this month', 'this year', '2024', '2025'
  ];

  const lowerQuestion = question.toLowerCase();
  const hasTimeSensitiveKeyword = timeSensitiveKeywords.some(keyword => 
    lowerQuestion.includes(keyword)
  );

  if (hasTimeSensitiveKeyword) {
    logger.debug('⏰ Question contains time-sensitive keyword, skipping cache', { question });
    return false;
  }

  return true;
};

export default {
  getCachedAIResponse,
  cacheAIResponse,
  isCacheable
};
