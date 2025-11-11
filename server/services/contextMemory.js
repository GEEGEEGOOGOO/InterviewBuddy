import { getRecentMessages } from './redisClient.js';

/**
 * Retrieve short-term memory from Redis (recent messages)
 */
export const getShortTermMemory = async (sessionId, limit = 20) => {
  try {
    const messages = await getRecentMessages(sessionId);
    return messages.slice(-limit);
  } catch (error) {
    console.error('Error retrieving short-term memory:', error);
    return [];
  }
};

/**
 * (Temporarily Disabled) Retrieve long-term memory from database
 */
export const getLongTermMemory = async (userId, sessionId, roleType) => {
  console.log('Long-term memory retrieval is temporarily disabled during MongoDB migration.');
  return {
    resume: null,
    previousAnswers: [],
    previousScores: [],
    stats: { averageScore: 0, totalAnswers: 0 }
  };
};

/**
 * (Temporarily Disabled) Retrieve relevant context using vector search
 */
export const retrieveRelevantContext = async (userMessage, userId, roleType) => {
  console.log('Relevant context retrieval is temporarily disabled during MongoDB migration.');
  return [];
};

/**
 * Compose context for Gemini prompt
 */
export const composeContext = async (sessionId, userId, roleType, userMessage) => {
  try {
    const shortTermMemory = await getShortTermMemory(sessionId, 20);
    const longTermMemory = await getLongTermMemory(userId, sessionId, roleType);
    const relevantContext = await retrieveRelevantContext(userMessage, userId, roleType);

    return {
      shortTermMemory,
      longTermMemory,
      relevantContext,
      conversationHistory: shortTermMemory
    };
  } catch (error) {
    console.error('Error composing context:', error);
    return {
      shortTermMemory: [],
      longTermMemory: {},
      relevantContext: [],
      conversationHistory: []
    };
  }
};

export default {
  getShortTermMemory,
  getLongTermMemory,
  vectorSimilaritySearch: async () => [], // Mocked
  retrieveRelevantContext,
  composeContext
};

