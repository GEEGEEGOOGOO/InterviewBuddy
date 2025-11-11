import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

// Redis client for short-term memory and caching
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => {
  // Only log Redis errors once, and make it less alarming
  if (!redisClient._errorLogged) {
    console.log('ℹ️  Redis not available (optional - app will work without it)');
    console.log('   To enable Redis caching, install and start Redis server');
    redisClient._errorLogged = true;
  }
});

redisClient.on('connect', () => {
  console.log('✅ Connected to Redis');
  redisClient._errorLogged = false; // Reset if reconnected
});

// Lazy connection handling
let isConnected = false;
let connectionPromise = null;

const connectRedis = async () => {
  if (isConnected) {
    return;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = redisClient.connect()
    .then(() => {
      isConnected = true;
      connectionPromise = null;
      console.log('✅ Connected to Redis');
    })
    .catch((error) => {
      // Silently fail - Redis is optional
      connectionPromise = null;
      // Don't log error here - it's already handled by the error event listener
    });

  return connectionPromise;
};

// Don't connect automatically - connect only when needed
// This prevents connection errors on startup if Redis is not available

/**
 * Store recent messages in Redis for quick access
 * @param {string} sessionId - Session ID
 * @param {Array} messages - Array of message objects
 * @param {number} ttl - Time to live in seconds (default: 1 hour)
 */
export const storeRecentMessages = async (sessionId, messages, ttl = 3600) => {
  try {
    await connectRedis();
    if (!isConnected) {
      return; // Graceful degradation
    }
    const key = `session:${sessionId}:messages`;
    await redisClient.setEx(key, ttl, JSON.stringify(messages));
  } catch (error) {
    console.error('Error storing messages in Redis:', error);
    // Don't throw error, just log it (graceful degradation)
  }
};

/**
 * Get recent messages from Redis
 * @param {string} sessionId - Session ID
 * @returns {Array} Array of message objects
 */
export const getRecentMessages = async (sessionId) => {
  try {
    await connectRedis();
    if (!isConnected) {
      return []; // Graceful degradation
    }
    const key = `session:${sessionId}:messages`;
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error getting messages from Redis:', error);
    return [];
  }
};

/**
 * Add a new message to the Redis cache
 * @param {string} sessionId - Session ID
 * @param {Object} message - Message object
 */
export const addMessageToCache = async (sessionId, message) => {
  try {
    await connectRedis();
    if (!isConnected) {
      return; // Graceful degradation
    }
    const messages = await getRecentMessages(sessionId);
    messages.push(message);
    // Keep only last 50 messages in cache
    const recentMessages = messages.slice(-50);
    await storeRecentMessages(sessionId, recentMessages);
  } catch (error) {
    console.error('Error adding message to Redis:', error);
  }
};

/**
 * Clear messages from Redis cache
 * @param {string} sessionId - Session ID
 */
export const clearSessionCache = async (sessionId) => {
  try {
    await connectRedis();
    if (!isConnected) {
      return; // Graceful degradation
    }
    const key = `session:${sessionId}:messages`;
    await redisClient.del(key);
  } catch (error) {
    console.error('Error clearing Redis cache:', error);
  }
};

/**
 * Store user context in Redis
 * @param {string} userId - User ID
 * @param {Object} context - Context object
 * @param {number} ttl - Time to live in seconds
 */
export const storeUserContext = async (userId, context, ttl = 7200) => {
  try {
    await connectRedis();
    if (!isConnected) {
      return; // Graceful degradation
    }
    const key = `user:${userId}:context`;
    await redisClient.setEx(key, ttl, JSON.stringify(context));
  } catch (error) {
    console.error('Error storing user context:', error);
  }
};

/**
 * Get user context from Redis
 * @param {string} userId - User ID
 * @returns {Object} Context object
 */
export const getUserContext = async (userId) => {
  try {
    await connectRedis();
    if (!isConnected) {
      return null; // Graceful degradation
    }
    const key = `user:${userId}:context`;
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error getting user context:', error);
    return null;
  }
};

export default redisClient;
