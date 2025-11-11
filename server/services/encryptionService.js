import crypto from 'crypto';
import os from 'os';
import logger from '../logger.js';

// Encryption algorithm
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;

// Generate encryption key from password + salt
const deriveKey = (password, salt) => {
  return crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha512');
};

// Get or create master password from environment
const getMasterPassword = () => {
  // In production, this should come from secure key management
  // For now, use environment variable or generate unique machine-based key
  let masterPassword = process.env.ENCRYPTION_KEY;
  
  if (!masterPassword) {
    // Generate machine-specific key based on hostname
    const machineId = os.hostname();
    masterPassword = crypto.createHash('sha256').update(machineId + 'interviewbuddy').digest('hex');
    logger.warn('⚠️ Using machine-specific encryption key. Set ENCRYPTION_KEY env var for production.');
  }
  
  return masterPassword;
};

/**
 * Encrypt a string value
 * @param {string} text - Plain text to encrypt
 * @returns {string} Encrypted text (base64 encoded: salt:iv:encrypted:tag)
 */
export const encrypt = (text) => {
  try {
    if (!text) return null;

    const masterPassword = getMasterPassword();
    
    // Generate random salt and IV
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Derive key from password + salt
    const key = deriveKey(masterPassword, salt);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Encrypt
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get authentication tag
    const tag = cipher.getAuthTag();
    
    // Combine salt:iv:encrypted:tag
    const result = Buffer.concat([salt, iv, Buffer.from(encrypted, 'hex'), tag]).toString('base64');
    
    logger.debug('🔐 Data encrypted successfully');
    return result;
  } catch (error) {
    logger.error('❌ Encryption failed', { error: error.message });
    throw new Error('Encryption failed');
  }
};

/**
 * Decrypt an encrypted string
 * @param {string} encryptedData - Encrypted text (base64 encoded)
 * @returns {string} Decrypted plain text
 */
export const decrypt = (encryptedData) => {
  try {
    if (!encryptedData) return null;

    const masterPassword = getMasterPassword();
    
    // Decode base64
    const buffer = Buffer.from(encryptedData, 'base64');
    
    // Extract components
    const salt = buffer.subarray(0, SALT_LENGTH);
    const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = buffer.subarray(buffer.length - TAG_LENGTH);
    const encrypted = buffer.subarray(SALT_LENGTH + IV_LENGTH, buffer.length - TAG_LENGTH);
    
    // Derive key
    const key = deriveKey(masterPassword, salt);
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    // Decrypt
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    logger.debug('🔓 Data decrypted successfully');
    return decrypted;
  } catch (error) {
    logger.error('❌ Decryption failed', { error: error.message });
    throw new Error('Decryption failed - data may be corrupted');
  }
};

/**
 * Hash a value (one-way, for verification only)
 * @param {string} text - Text to hash
 * @returns {string} Hash (hex)
 */
export const hash = (text) => {
  return crypto.createHash('sha256').update(text).digest('hex');
};

/**
 * Verify a hash
 * @param {string} text - Original text
 * @param {string} hashedValue - Hash to compare
 * @returns {boolean} True if match
 */
export const verifyHash = (text, hashedValue) => {
  return hash(text) === hashedValue;
};

export default {
  encrypt,
  decrypt,
  hash,
  verifyHash
};
