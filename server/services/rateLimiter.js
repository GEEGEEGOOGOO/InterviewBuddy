import logger from '../logger.js';

// Rate limit configuration
const RATE_LIMITS = {
  groq: {
    requestsPerMinute: 30,
    requestsPerHour: 500
  },
  gemini: {
    requestsPerMinute: 15,
    requestsPerHour: 300
  }
};

// In-memory tracking (resets on server restart)
const requestTracker = {
  groq: { minute: [], hour: [] },
  gemini: { minute: [], hour: [] }
};

/**
 * Check if request is within rate limits
 * @param {string} provider - AI provider (groq or gemini)
 * @returns {Object} { allowed: boolean, reason: string, retryAfter: number }
 */
export const checkRateLimit = (provider = 'groq') => {
  try {
    const now = Date.now();
    const limits = RATE_LIMITS[provider];
    
    if (!limits) {
      logger.warn('⚠️ Unknown provider for rate limiting', { provider });
      return { allowed: true };
    }

    // Clean up old timestamps
    const tracker = requestTracker[provider];
    tracker.minute = tracker.minute.filter(ts => now - ts < 60000); // Last 1 minute
    tracker.hour = tracker.hour.filter(ts => now - ts < 3600000); // Last 1 hour

    // Check minute limit
    if (tracker.minute.length >= limits.requestsPerMinute) {
      const oldestInMinute = Math.min(...tracker.minute);
      const retryAfter = Math.ceil((oldestInMinute + 60000 - now) / 1000);
      
      logger.warn('🚫 Rate limit exceeded (per minute)', {
        provider,
        limit: limits.requestsPerMinute,
        current: tracker.minute.length,
        retryAfter
      });
      
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${limits.requestsPerMinute} requests per minute`,
        retryAfter
      };
    }

    // Check hour limit
    if (tracker.hour.length >= limits.requestsPerHour) {
      const oldestInHour = Math.min(...tracker.hour);
      const retryAfter = Math.ceil((oldestInHour + 3600000 - now) / 1000);
      
      logger.warn('🚫 Rate limit exceeded (per hour)', {
        provider,
        limit: limits.requestsPerHour,
        current: tracker.hour.length,
        retryAfter
      });
      
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${limits.requestsPerHour} requests per hour`,
        retryAfter
      };
    }

    // Record this request
    tracker.minute.push(now);
    tracker.hour.push(now);

    logger.debug('✅ Rate limit check passed', {
      provider,
      perMinute: `${tracker.minute.length}/${limits.requestsPerMinute}`,
      perHour: `${tracker.hour.length}/${limits.requestsPerHour}`
    });

    return { allowed: true };
  } catch (error) {
    logger.error('❌ Rate limit check failed', { error: error.message });
    // Fail open - allow request if rate limiting fails
    return { allowed: true };
  }
};

/**
 * Get current rate limit status
 * @param {string} provider - AI provider
 * @returns {Object} Status with remaining requests
 */
export const getRateLimitStatus = (provider = 'groq') => {
  const now = Date.now();
  const limits = RATE_LIMITS[provider];
  const tracker = requestTracker[provider];

  if (!limits || !tracker) {
    return null;
  }

  // Clean up old timestamps
  tracker.minute = tracker.minute.filter(ts => now - ts < 60000);
  tracker.hour = tracker.hour.filter(ts => now - ts < 3600000);

  return {
    provider,
    limits: {
      perMinute: {
        limit: limits.requestsPerMinute,
        used: tracker.minute.length,
        remaining: limits.requestsPerMinute - tracker.minute.length
      },
      perHour: {
        limit: limits.requestsPerHour,
        used: tracker.hour.length,
        remaining: limits.requestsPerHour - tracker.hour.length
      }
    }
  };
};

/**
 * Reset rate limits for a provider (useful for testing)
 * @param {string} provider - AI provider
 */
export const resetRateLimit = (provider = 'groq') => {
  if (requestTracker[provider]) {
    requestTracker[provider] = { minute: [], hour: [] };
    logger.info('🔄 Rate limit reset', { provider });
  }
};

export default {
  checkRateLimit,
  getRateLimitStatus,
  resetRateLimit
};
