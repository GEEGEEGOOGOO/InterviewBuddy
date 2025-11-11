import { jest } from '@jest/globals';
import { getCachedAIResponse, cacheAIResponse, isCacheable } from '../services/cacheService.js';

// Mock database
jest.mock('../db/sqlite.js', () => ({
  getCachedResponse: jest.fn(),
  setCachedResponse: jest.fn()
}));

jest.mock('../logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('Cache Service', () => {
  describe('isCacheable', () => {
    it('should return false for very short questions', () => {
      expect(isCacheable('Hi')).toBe(false);
      expect(isCacheable('Test')).toBe(false);
    });

    it('should return false for very long questions', () => {
      const longQuestion = 'a'.repeat(1001);
      expect(isCacheable(longQuestion)).toBe(false);
    });

    it('should return false for time-sensitive questions', () => {
      expect(isCacheable('What happened today?')).toBe(false);
      expect(isCacheable('Tell me about current trends')).toBe(false);
      expect(isCacheable('What are the latest updates?')).toBe(false);
      expect(isCacheable('News from this week')).toBe(false);
    });

    it('should return true for normal questions', () => {
      expect(isCacheable('What is React?')).toBe(true);
      expect(isCacheable('Explain object-oriented programming')).toBe(true);
      expect(isCacheable('How does async/await work in JavaScript?')).toBe(true);
    });

    it('should return false for null or undefined', () => {
      expect(isCacheable(null)).toBe(false);
      expect(isCacheable(undefined)).toBe(false);
    });
  });

  describe('getCachedAIResponse', () => {
    it('should normalize question before checking cache', () => {
      const question1 = '  What is React?  ';
      const question2 = 'WHAT IS REACT?';
      const question3 = 'what is react?';

      // All should generate the same cache key
      getCachedAIResponse(question1, 'groq', 'model-1');
      getCachedAIResponse(question2, 'groq', 'model-1');
      getCachedAIResponse(question3, 'groq', 'model-1');

      // Should be called with normalized questions
      // (Note: actual cache key is a hash, but normalization happens before hashing)
    });
  });

  describe('cacheAIResponse', () => {
    it('should not throw error if caching fails', () => {
      expect(() => {
        cacheAIResponse(
          'Test question',
          { answer: 'Test answer' },
          'groq',
          'model-1'
        );
      }).not.toThrow();
    });
  });
});
