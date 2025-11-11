import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import logger from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file path
const dbPath = path.join(__dirname, '..', 'data', 'interviewbuddy.db');

// Initialize database
let db = null;

export const initDatabase = () => {
  try {
    // Create data directory if it doesn't exist
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    db = new Database(dbPath, { verbose: (msg) => logger.debug(msg) });
    
    // Enable WAL mode for better concurrency
    db.pragma('journal_mode = WAL');
    
    // Create tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        persona TEXT,
        timestamp INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_conversations_question ON conversations(question);

      CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache(expires_at);
      CREATE INDEX IF NOT EXISTS idx_cache_key ON cache(key);

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    logger.info('✅ SQLite database initialized', { path: dbPath });
    return db;
  } catch (error) {
    logger.error('❌ Failed to initialize SQLite database', { error: error.message });
    throw error;
  }
};

// Conversation storage
export const saveConversation = (conversation) => {
  try {
    const stmt = db.prepare(`
      INSERT INTO conversations (id, question, answer, provider, model, persona, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      conversation.id,
      conversation.question,
      conversation.answer,
      conversation.provider,
      conversation.model,
      conversation.persona || null,
      conversation.timestamp
    );

    logger.info('💾 Conversation saved', { id: conversation.id });
  } catch (error) {
    logger.error('❌ Failed to save conversation', { error: error.message });
    throw error;
  }
};

export const getConversations = (limit = 10) => {
  try {
    const stmt = db.prepare(`
      SELECT * FROM conversations 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
    
    return stmt.all(limit);
  } catch (error) {
    logger.error('❌ Failed to get conversations', { error: error.message });
    return [];
  }
};

export const clearConversations = () => {
  try {
    db.prepare('DELETE FROM conversations').run();
    logger.info('🗑️ All conversations cleared');
  } catch (error) {
    logger.error('❌ Failed to clear conversations', { error: error.message });
    throw error;
  }
};

// Cache management
export const getCachedResponse = (key) => {
  try {
    const stmt = db.prepare(`
      SELECT value FROM cache 
      WHERE key = ? AND expires_at > ?
    `);
    
    const row = stmt.get(key, Date.now());
    return row ? JSON.parse(row.value) : null;
  } catch (error) {
    logger.error('❌ Failed to get cached response', { error: error.message });
    return null;
  }
};

export const setCachedResponse = (key, value, provider, model, ttl = 3600000) => {
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO cache (key, value, provider, model, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      key,
      JSON.stringify(value),
      provider,
      model,
      Date.now() + ttl
    );

    logger.debug('💾 Response cached', { key, provider, model, ttl });
  } catch (error) {
    logger.error('❌ Failed to cache response', { error: error.message });
  }
};

export const clearExpiredCache = () => {
  try {
    const result = db.prepare('DELETE FROM cache WHERE expires_at <= ?').run(Date.now());
    logger.info('🗑️ Expired cache cleared', { deleted: result.changes });
  } catch (error) {
    logger.error('❌ Failed to clear expired cache', { error: error.message });
  }
};

// Settings management
export const getSetting = (key) => {
  try {
    const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
    const row = stmt.get(key);
    return row ? row.value : null;
  } catch (error) {
    logger.error('❌ Failed to get setting', { key, error: error.message });
    return null;
  }
};

export const setSetting = (key, value) => {
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `);
    
    stmt.run(key, value);
    logger.debug('⚙️ Setting updated', { key });
  } catch (error) {
    logger.error('❌ Failed to set setting', { key, error: error.message });
    throw error;
  }
};

// Cleanup old data periodically
export const cleanupOldData = () => {
  try {
    // Keep only last 100 conversations
    db.exec(`
      DELETE FROM conversations 
      WHERE id NOT IN (
        SELECT id FROM conversations 
        ORDER BY timestamp DESC 
        LIMIT 100
      )
    `);

    // Clear expired cache
    clearExpiredCache();

    logger.info('🧹 Database cleanup completed');
  } catch (error) {
    logger.error('❌ Database cleanup failed', { error: error.message });
  }
};

// Close database connection
export const closeDatabase = () => {
  if (db) {
    db.close();
    logger.info('🔌 SQLite database closed');
  }
};

export default {
  initDatabase,
  saveConversation,
  getConversations,
  clearConversations,
  getCachedResponse,
  setCachedResponse,
  clearExpiredCache,
  getSetting,
  setSetting,
  cleanupOldData,
  closeDatabase
};
