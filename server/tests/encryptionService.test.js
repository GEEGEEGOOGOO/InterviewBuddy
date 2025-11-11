import { jest } from '@jest/globals';
import { encrypt, decrypt, hash, verifyHash } from '../services/encryptionService.js';

jest.mock('../logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('Encryption Service', () => {
  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt text correctly', () => {
      const plainText = 'my-secret-api-key-12345';
      
      const encrypted = encrypt(plainText);
      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toBe(plainText);

      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plainText);
    });

    it('should produce different ciphertext for same plaintext', () => {
      const plainText = 'test-secret';
      
      const encrypted1 = encrypt(plainText);
      const encrypted2 = encrypt(plainText);

      // Different ciphertext due to random IV/salt
      expect(encrypted1).not.toBe(encrypted2);

      // But both decrypt to same plaintext
      expect(decrypt(encrypted1)).toBe(plainText);
      expect(decrypt(encrypted2)).toBe(plainText);
    });

    it('should handle null values', () => {
      expect(encrypt(null)).toBeNull();
      expect(decrypt(null)).toBeNull();
    });

    it('should throw error for corrupted data', () => {
      expect(() => {
        decrypt('corrupted-base64-data');
      }).toThrow();
    });

    it('should handle Unicode characters', () => {
      const plainText = '你好世界 🎉 مرحبا';
      
      const encrypted = encrypt(plainText);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plainText);
    });

    it('should handle long strings', () => {
      const plainText = 'a'.repeat(10000);
      
      const encrypted = encrypt(plainText);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plainText);
      expect(decrypted.length).toBe(10000);
    });
  });

  describe('hash and verifyHash', () => {
    it('should hash text consistently', () => {
      const text = 'test-value';
      
      const hash1 = hash(text);
      const hash2 = hash(text);

      // Same input = same hash
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different text', () => {
      const hash1 = hash('value1');
      const hash2 = hash('value2');

      expect(hash1).not.toBe(hash2);
    });

    it('should verify hash correctly', () => {
      const text = 'test-value';
      const hashedValue = hash(text);

      expect(verifyHash(text, hashedValue)).toBe(true);
      expect(verifyHash('wrong-value', hashedValue)).toBe(false);
    });

    it('should produce fixed-length hashes', () => {
      const hash1 = hash('a');
      const hash2 = hash('a'.repeat(1000));

      // SHA-256 produces 64 character hex string
      expect(hash1.length).toBe(64);
      expect(hash2.length).toBe(64);
    });
  });
});
