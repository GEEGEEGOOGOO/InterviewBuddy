import { generateInterviewResponse as generateGroqResponse } from './geminiClient.js';
import { generateGeminiResponse, validateGeminiKey } from './geminiService.js';
import { getCachedAIResponse, cacheAIResponse, isCacheable } from './cacheService.js';
import { checkRateLimit } from './rateLimiter.js';
import logger from '../logger.js';
import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2
};

/**
 * Sleep utility for retry delays
 * @param {number} ms - Milliseconds to sleep
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry logic with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} retries - Number of retries remaining
 * @param {number} delay - Current delay in ms
 * @returns {Promise<any>} Result of function
 */
const retryWithBackoff = async (fn, retries = RETRY_CONFIG.maxRetries, delay = RETRY_CONFIG.initialDelay) => {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) {
      logger.error('❌ Max retries exceeded', { error: error.message });
      throw error;
    }

    // Check if error is retryable
    const isRetryable = 
      error.message.includes('timeout') ||
      error.message.includes('ECONNRESET') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('429') || // Rate limit
      error.message.includes('503') || // Service unavailable
      error.message.includes('500');   // Internal server error

    if (!isRetryable) {
      logger.error('❌ Non-retryable error', { error: error.message });
      throw error;
    }

    const nextDelay = Math.min(delay * RETRY_CONFIG.backoffMultiplier, RETRY_CONFIG.maxDelay);
    logger.warn(`⚠️ Retrying in ${delay}ms (${retries} retries left)`, { error: error.message });
    
    await sleep(delay);
    return retryWithBackoff(fn, retries - 1, nextDelay);
  }
};

// Model definitions with descriptions
export const MODELS = {
  groq: [
    {
      id: 'llama-3.3-70b-versatile',
      name: 'Llama 3.3 70B Versatile',
      description: 'Best for technical interviews, system design, and behavioral questions',
      strengths: ['General Technical', 'System Design', 'Behavioral', 'Code Review'],
      maxTokens: 8000,
      speed: 'Fast',
      provider: 'groq'
    },
    {
      id: 'mixtral-8x7b-32768',
      name: 'Mixtral 8x7B (Long Context)',
      description: 'Excellent for complex scenarios with long context (32k tokens)',
      strengths: ['Long Context', 'Complex Scenarios', 'Detailed Examples', 'Architecture'],
      maxTokens: 32768,
      speed: 'Fast',
      provider: 'groq'
    },
    {
      id: 'llama-3.1-8b-instant',
      name: 'Llama 3.1 8B Instant',
      description: 'Ultra-fast responses for simple questions and quick practice',
      strengths: ['Speed', 'Simple Questions', 'Quick Practice', 'Rapid Iteration'],
      maxTokens: 8000,
      speed: 'Ultra Fast',
      provider: 'groq'
    }
  ],
  gemini: [
    {
      id: 'gemini-2.0-flash-exp',
      name: 'Gemini 2.0 Flash (Experimental)',
      description: 'Google\'s latest model with advanced reasoning and multimodal support',
      strengths: ['Advanced Reasoning', 'Code Generation', 'Multimodal', 'Latest Tech'],
      maxTokens: 8000,
      speed: 'Very Fast',
      provider: 'gemini'
    }
  ]
};

/**
 * Get available models for a provider
 * @param {string} provider - Provider name (groq or gemini)
 * @returns {Array} Array of model objects
 */
export const getAvailableModels = (provider) => {
  return MODELS[provider] || [];
};

/**
 * Get all models
 * @returns {Object} All models grouped by provider
 */
export const getAllModels = () => {
  return MODELS;
};

/**
 * Validate API key for a provider
 * @param {string} provider - Provider name
 * @param {string} apiKey - API key to validate
 * @returns {Promise<boolean>} True if valid
 */
export const validateProvider = async (provider, apiKey) => {
  try {
    logger.info('🔍 Validating provider', { provider });
    
    if (provider === 'groq') {
      const groq = new Groq({ apiKey });
      // Test with simple completion
      await groq.chat.completions.create({
        messages: [{ role: 'user', content: 'test' }],
        model: 'llama-3.1-8b-instant',
        max_tokens: 5
      });
      logger.info('✅ Provider validation successful', { provider });
      return true;
    } else if (provider === 'gemini') {
      const isValid = await validateGeminiKey(apiKey);
      logger.info(isValid ? '✅ Provider validation successful' : '❌ Provider validation failed', { provider });
      return isValid;
    }
    
    logger.warn('⚠️ Unknown provider', { provider });
    return false;
  } catch (error) {
    logger.error('❌ Provider validation failed', { provider, error: error.message });
    return false;
  }
};

/**
 * Generate interview response using specified provider and model
 * @param {string} question - Interview question
 * @param {string} provider - AI provider (groq or gemini)
 * @param {string} model - Model ID
 * @param {Array} conversationHistory - Previous conversation
 * @param {string} roleType - Role type
 * @param {Object} retrievedContext - Additional context
 * @param {string} customPersona - Custom system prompt/persona
 * @returns {Promise<Object>} Interview response
 */
export const generateInterviewResponse = async (
  question,
  provider = 'groq',
  model = null,
  conversationHistory = [],
  roleType = 'general',
  retrievedContext = null,
  customPersona = null
) => {
  const startTime = Date.now();
  
  try {
    logger.info('🤖 Starting AI response generation', { 
      provider, 
      model: model || 'default',
      questionLength: question.length 
    });

    // Step 1: Check rate limits
    const rateLimitCheck = checkRateLimit(provider);
    if (!rateLimitCheck.allowed) {
      logger.warn('🚫 Rate limit exceeded', { 
        provider, 
        reason: rateLimitCheck.reason,
        retryAfter: rateLimitCheck.retryAfter 
      });
      
      throw new Error(
        `${rateLimitCheck.reason}. Please wait ${rateLimitCheck.retryAfter} seconds and try again.`
      );
    }

    // Step 2: Check cache (only for cacheable questions)
    if (isCacheable(question)) {
      const cachedResponse = getCachedAIResponse(question, provider, model, customPersona);
      if (cachedResponse) {
        const elapsed = Date.now() - startTime;
        logger.info('✅ Response served from cache', { provider, elapsed: `${elapsed}ms` });
        return cachedResponse;
      }
    }

    // Step 3: Generate response with retry logic
    const response = await retryWithBackoff(async () => {
      if (provider === 'groq') {
        const result = await generateGroqResponse(
          question,
          conversationHistory,
          roleType,
          retrievedContext,
          customPersona
        );
        
        result.provider = 'groq';
        result.model = model || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
        return result;
        
      } else if (provider === 'gemini') {
        return await generateGeminiResponse(
          question,
          model || process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp',
          conversationHistory,
          roleType,
          retrievedContext,
          customPersona
        );
        
      } else {
        throw new Error(`Unknown provider: ${provider}`);
      }
    });

    // Step 4: Cache the response
    if (isCacheable(question)) {
      cacheAIResponse(question, response, provider, model, customPersona);
    }

    const elapsed = Date.now() - startTime;
    logger.info('✅ AI response generated successfully', { 
      provider, 
      model: response.model,
      elapsed: `${elapsed}ms`,
      answerLength: response.answer?.length || 0
    });

    return response;
    
  } catch (error) {
    const elapsed = Date.now() - startTime;
    logger.error('❌ AI response generation failed', { 
      provider, 
      model,
      error: error.message,
      elapsed: `${elapsed}ms`
    });
    
    // Return graceful fallback response
    return {
      answer: `I apologize, but I'm having trouble generating a response right now. ${error.message}. Please try again in a moment.`,
      experience_mentioned: [],
      key_technologies: [],
      follow_up_topics: [],
      score: 0,
      strengths: [],
      weaknesses: [`Error with ${provider}: ${error.message}`],
      suggestion: 'Please try your question again or switch to a different AI provider.',
      next_question: 'Could you rephrase your question?',
      error: error.message,
      provider: provider,
      model: model || 'unknown'
    };
  }
};

export default {
  generateInterviewResponse,
  validateProvider,
  getAvailableModels,
  getAllModels,
  MODELS
};
