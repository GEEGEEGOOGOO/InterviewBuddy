// Load environment variables FIRST (before any other imports)
import dotenv from 'dotenv';
dotenv.config({ override: true }); // Force .env file to override system environment variables

// Now import everything else
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createServer } from 'http';
import chatRoutes from './routes/chat.js';
import authRoutes from './routes/auth.js';
import sessionRoutes from './routes/sessions.js';
import { initializeWebSocket } from './services/websocketServer.js';
import { initDatabase, cleanupOldData, closeDatabase } from './db/sqlite.js';
import logger from './logger.js';

// Log environment configuration at startup
logger.info('🔐 Server Startup - Environment loaded');
logger.info('🔑 API Keys configured', {
  groq: process.env.GROQ_API_KEY ? `${process.env.GROQ_API_KEY.substring(0, 4)}...` : 'NOT SET',
  gemini: process.env.GEMINI_API_KEY ? `${process.env.GEMINI_API_KEY.substring(0, 4)}...` : 'NOT SET',
  groqModel: process.env.GROQ_MODEL,
  geminiModel: process.env.GEMINI_MODEL
});
logger.info('⚙️ Server Configuration', {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3000,
  cwd: process.cwd()
});

const app = express();
const PORT = process.env.PORT || 3000;

// Create HTTP server for WebSocket support
const httpServer = createServer(app);

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use('/api/', limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/sessions', sessionRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: err.message
    });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing token'
    });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize database and start server
(async () => {
  try {
    // Initialize SQLite database
    logger.info('📦 Initializing SQLite database...');
    initDatabase();
    logger.info('✅ SQLite database ready');

    // Cleanup old data on startup
    logger.info('🧹 Cleaning up old data...');
    cleanupOldData();
    logger.info('✅ Cleanup complete');

    // Initialize WebSocket server
    const io = initializeWebSocket(httpServer);
    logger.info('🔌 WebSocket server initialized');

    // Graceful shutdown
    const gracefulShutdown = (signal) => {
      logger.info(`📴 ${signal} received, shutting down gracefully...`);
      
      httpServer.close(() => {
        logger.info('🔌 HTTP server closed');
        
        // Close database connection
        closeDatabase();
        
        logger.info('✅ Graceful shutdown complete');
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('❌ Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Start server
    httpServer.listen(PORT, () => {
      logger.info('🚀 InterviewBuddy server started successfully', {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        websocket: 'enabled'
      });
      logger.info('✅ Server ready to accept connections');
    });
  } catch (error) {
    logger.error('❌ Failed to start server', { error: error.message, stack: error.stack });
    process.exit(1);
  }
})();
// For now, we will remove the exports as they are not used in the current project structure.
// export { io };
// export default app;

