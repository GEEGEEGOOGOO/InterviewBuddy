import express from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import Session from '../models/Session.js';
import Message from '../models/Message.js';
import { generateInterviewResponse, generateSessionSummary } from '../services/geminiClient.js';
import { composeContext } from '../services/contextMemory.js';
import { addMessageToCache, getRecentMessages } from '../services/redisClient.js';

const router = express.Router();

/**
 * POST /api/chat
 * Send a message and get AI interview response
 */
router.post('/',
  authenticate,
  [
    body('message').trim().notEmpty().withMessage('Message is required'),
    body('sessionId').optional().isMongoId().withMessage('Invalid session ID'),
    body('roleType').optional().isString().withMessage('Role type must be a string')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { message, sessionId, roleType = 'general' } = req.body;
      const userId = req.user.id;

      let currentSession;

      // Create new session if no sessionId provided
      if (!sessionId) {
        currentSession = new Session({ userId, roleType, status: 'active' });
        await currentSession.save();
      } else {
        // Verify session belongs to user
        currentSession = await Session.findOne({ _id: sessionId, userId });

        if (!currentSession) {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'Session does not belong to user'
          });
        }
      }

      const currentSessionId = currentSession._id;

      // Store user message
      const userMessage = new Message({
        sessionId: currentSessionId,
        role: 'user',
        content: message
      });
      await userMessage.save();

      // Add user message to Redis cache
      await addMessageToCache(currentSessionId.toString(), userMessage.toObject());

      // Compose context
      const context = await composeContext(currentSessionId.toString(), userId, roleType, message);
      const conversationHistory = context.conversationHistory || [];
      const retrievedContext = {
        resume: context.longTermMemory.resume,
        previousAnswers: context.longTermMemory.previousAnswers,
        relevantContext: context.relevantContext
      };

      // Generate AI response
      const aiResponse = await generateInterviewResponse(
        message,
        conversationHistory,
        roleType,
        retrievedContext
      );

      // Store assistant message
      const assistantMessage = new Message({
        sessionId: currentSessionId,
        role: 'assistant',
        content: aiResponse.next_question,
        score: aiResponse.score,
        strengths: aiResponse.strengths,
        weaknesses: aiResponse.weaknesses,
        suggestion: aiResponse.suggestion,
        modelAnswer: aiResponse.model_answer,
        metadata: { roleType }
      });
      await assistantMessage.save();

      // Add assistant message to Redis cache
      await addMessageToCache(currentSessionId.toString(), assistantMessage.toObject());

      // Update user message with feedback
      await Message.findByIdAndUpdate(userMessage._id, {
        score: aiResponse.score,
        strengths: aiResponse.strengths,
        weaknesses: aiResponse.weaknesses,
        suggestion: aiResponse.suggestion,
      });

      // Session summary logic is omitted for now

      res.json({
        sessionId: currentSessionId,
        message: assistantMessage,
        feedback: {
          score: aiResponse.score,
          strengths: aiResponse.strengths,
          weaknesses: aiResponse.weaknesses,
          suggestion: aiResponse.suggestion,
          modelAnswer: aiResponse.model_answer
        },
        sessionSummary: null // Omitted for now
      });

    } catch (error) {
      console.error('Chat error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to process chat message',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * GET /api/chat/history/:sessionId
 * Get chat history for a session
 */
router.get('/history/:sessionId', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    // Verify session belongs to user
    const session = await Session.findOne({ _id: sessionId, userId });

    if (!session) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Session does not belong to user'
      });
    }

    // Get messages from database
    const messages = await Message.find({ sessionId }).sort({ createdAt: 'asc' });

    res.json({
      sessionId,
      messages
    });

  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get chat history'
    });
  }
});

export default router;

