import express from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth.js';
import Session from '../models/Session.js';
import Message from '../models/Message.js';

const router = express.Router();

/**
 * GET /api/sessions
 * Get all sessions for the authenticated user
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const sessions = await Session.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      {
        $lookup: {
          from: 'messages',
          localField: '_id',
          foreignField: 'sessionId',
          as: 'messages'
        }
      },
      {
        $project: {
          _id: 1,
          roleType: 1,
          status: 1,
          createdAt: 1,
          updatedAt: 1,
          messageCount: {
            $size: {
              $filter: {
                input: '$messages',
                as: 'msg',
                cond: { $eq: ['$$msg.role', 'user'] }
              }
            }
          },
          averageScore: { $avg: '$messages.score' }
        }
      },
      { $sort: { createdAt: -1 } }
    ]);

    res.json({ sessions });

  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get sessions'
    });
  }
});

/**
 * GET /api/sessions/:sessionId
 * Get a specific session (summary part is omitted for now)
 */
router.get('/:sessionId', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    const session = await Session.findOne({ _id: sessionId, userId });

    if (!session) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Session not found'
      });
    }

    // Summary logic is omitted for now
    const summary = null;

    res.json({
      session,
      summary
    });

  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get session'
    });
  }
});

/**
 * PUT /api/sessions/:sessionId
 * Update session status
 */
router.put('/:sessionId', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { status } = req.body;
    const userId = req.user.id;

    if (!['active', 'completed', 'paused'].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status',
        message: 'Status must be one of: active, completed, paused'
      });
    }

    const updatedSession = await Session.findOneAndUpdate(
      { _id: sessionId, userId },
      { status },
      { new: true }
    );

    if (!updatedSession) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Session not found'
      });
    }

    res.json({
      message: 'Session updated successfully',
      session: updatedSession
    });

  } catch (error) {
    console.error('Update session error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update session'
    });
  }
});

/**
 * DELETE /api/sessions/:sessionId
 * Delete a session and its messages
 */
router.delete('/:sessionId', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    const deletedSession = await Session.findOneAndDelete({ _id: sessionId, userId });

    if (!deletedSession) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Session not found'
      });
    }

    // Delete associated messages
    await Message.deleteMany({ sessionId });

    res.json({
      message: 'Session deleted successfully'
    });

  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete session'
    });
  }
});

export default router;

