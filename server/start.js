// Separate entrypoint to load environment variables BEFORE any imports
import dotenv from 'dotenv';

// Clear any cached environment variables and force .env file to override
delete process.env.GROQ_API_KEY;
delete process.env.GROQ_MODEL;
delete process.env.GEMINI_API_KEY;
delete process.env.GEMINI_MODEL;

// Load from .env file with override
dotenv.config({ override: true });

// Now import and start the server
import './server.js';
