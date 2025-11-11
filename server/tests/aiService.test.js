import { jest } from '@jest/globals';
import { generateInterviewResponse, validateProvider, getAvailableModels } from '../services/aiService.js';
import * as cacheService from '../services/cacheService.js';
import * as rateLimiter from '../services/rateLimiter.js';

// Mock dependencies
jest.mock('../services/cacheService.js');
jest.mock('../services/rateLimiter.js');
jest.mock('../services/geminiClient.js');
jest.mock('../services/geminiService.js');
jest.mock('../logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('AI Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementations
    cacheService.isCacheable.mockReturnValue(true);
    cacheService.getCachedAIResponse.mockReturnValue(null);
    cacheService.cacheAIResponse.mockImplementation(() => {});
    
    rateLimiter.checkRateLimit.mockReturnValue({ allowed: true });
  });

  describe('generateInterviewResponse', () => {
    it('should return cached response if available', async () => {
      const cachedResponse = {
        answer: 'Cached answer',
        provider: 'groq',
        model: 'test-model'
      };

      cacheService.getCachedAIResponse.mockReturnValue(cachedResponse);

      const result = await generateInterviewResponse(
        'What is React?',
        'groq',
        'test-model'
      );

      expect(result).toEqual(cachedResponse);
      expect(cacheService.getCachedAIResponse).toHaveBeenCalledWith(
        'What is React?',
        'groq',
        'test-model',
        null
      );
    });

    it('should check rate limits before generating response', async () => {
      rateLimiter.checkRateLimit.mockReturnValue({
        allowed: false,
        reason: 'Rate limit exceeded',
        retryAfter: 60
      });

      const result = await generateInterviewResponse(
        'What is React?',
        'groq'
      );

      expect(result.error).toContain('Rate limit exceeded');
      expect(rateLimiter.checkRateLimit).toHaveBeenCalledWith('groq');
    });

    it('should not cache non-cacheable questions', async () => {
      cacheService.isCacheable.mockReturnValue(false);

      const result = await generateInterviewResponse(
        'What happened today?',
        'groq'
      );

      expect(cacheService.cacheAIResponse).not.toHaveBeenCalled();
    });

    it('should return error response on failure', async () => {
      const result = await generateInterviewResponse(
        'Test question',
        'invalid-provider'
      );

      expect(result.error).toBeDefined();
      expect(result.provider).toBe('invalid-provider');
    });
  });

  describe('validateProvider', () => {
    it('should return false for unknown provider', async () => {
      const result = await validateProvider('unknown', 'test-key');
      expect(result).toBe(false);
    });
  });

  describe('getAvailableModels', () => {
    it('should return models for groq provider', () => {
      const models = getAvailableModels('groq');
      expect(models).toBeInstanceOf(Array);
      expect(models.length).toBeGreaterThan(0);
      expect(models[0]).toHaveProperty('id');
      expect(models[0]).toHaveProperty('name');
      expect(models[0]).toHaveProperty('provider', 'groq');
    });

    it('should return models for gemini provider', () => {
      const models = getAvailableModels('gemini');
      expect(models).toBeInstanceOf(Array);
      expect(models.length).toBeGreaterThan(0);
      expect(models[0]).toHaveProperty('provider', 'gemini');
    });

    it('should return empty array for unknown provider', () => {
      const models = getAvailableModels('unknown');
      expect(models).toEqual([]);
    });
  });
});
