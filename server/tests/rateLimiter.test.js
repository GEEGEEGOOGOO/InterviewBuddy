import { jest } from '@jest/globals';
import { checkRateLimit, getRateLimitStatus, resetRateLimit } from '../services/rateLimiter.js';

jest.mock('../logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('Rate Limiter Service', () => {
  beforeEach(() => {
    // Reset rate limits before each test
    resetRateLimit('groq');
    resetRateLimit('gemini');
  });

  describe('checkRateLimit', () => {
    it('should allow requests within per-minute limit', () => {
      // Groq has 30 requests per minute limit
      for (let i = 0; i < 30; i++) {
        const result = checkRateLimit('groq');
        expect(result.allowed).toBe(true);
      }
    });

    it('should block requests exceeding per-minute limit', () => {
      // Groq has 30 requests per minute limit
      for (let i = 0; i < 30; i++) {
        checkRateLimit('groq');
      }

      const result = checkRateLimit('groq');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Rate limit exceeded');
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should allow requests within per-hour limit', () => {
      // Groq has 500 requests per hour limit
      resetRateLimit('groq');
      
      for (let i = 0; i < 30; i++) {
        const result = checkRateLimit('groq');
        expect(result.allowed).toBe(true);
      }
    });

    it('should handle unknown provider gracefully', () => {
      const result = checkRateLimit('unknown-provider');
      expect(result.allowed).toBe(true); // Fail open
    });

    it('should have different limits for different providers', () => {
      // Groq: 30/min, Gemini: 15/min
      
      // Test Groq
      for (let i = 0; i < 30; i++) {
        expect(checkRateLimit('groq').allowed).toBe(true);
      }
      expect(checkRateLimit('groq').allowed).toBe(false);

      // Test Gemini
      for (let i = 0; i < 15; i++) {
        expect(checkRateLimit('gemini').allowed).toBe(true);
      }
      expect(checkRateLimit('gemini').allowed).toBe(false);
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return status with remaining requests', () => {
      checkRateLimit('groq'); // Use 1 request
      
      const status = getRateLimitStatus('groq');
      expect(status).toHaveProperty('provider', 'groq');
      expect(status.limits.perMinute.used).toBe(1);
      expect(status.limits.perMinute.remaining).toBe(29);
      expect(status.limits.perHour.used).toBe(1);
      expect(status.limits.perHour.remaining).toBe(499);
    });

    it('should return null for unknown provider', () => {
      const status = getRateLimitStatus('unknown');
      expect(status).toBeNull();
    });
  });

  describe('resetRateLimit', () => {
    it('should reset rate limits for a provider', () => {
      // Max out the limit
      for (let i = 0; i < 30; i++) {
        checkRateLimit('groq');
      }
      expect(checkRateLimit('groq').allowed).toBe(false);

      // Reset
      resetRateLimit('groq');

      // Should work again
      expect(checkRateLimit('groq').allowed).toBe(true);
    });
  });
});
