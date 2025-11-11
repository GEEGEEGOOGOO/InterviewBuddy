import express from 'express';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import { generateToken, authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, email, password, role } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({ email });

      if (existingUser) {
        return res.status(400).json({
          error: 'User already exists',
          message: 'An account with this email already exists'
        });
      }

      // Create user (password will be hashed by pre-save hook in model)
      const user = new User({
        name,
        email,
        password,
        role: role || 'candidate'
      });
      await user.save();

      // Generate JWT token
      const token = generateToken({
        id: user._id,
        email: user.email,
        role: user.role
      });

      res.status(201).json({
        message: 'User registered successfully',
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        },
        token
      });

    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to register user'
      });
    }
  }
);

/**
 * POST /api/auth/login
 * Login user
 */
router.post('/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      // Find user
      const user = await User.findOne({ email });

      if (!user) {
        return res.status(401).json({
          error: 'Invalid credentials',
          message: 'Email or password is incorrect'
        });
      }

      // Verify password
      const isValidPassword = await user.comparePassword(password);

      if (!isValidPassword) {
        return res.status(401).json({
          error: 'Invalid credentials',
          message: 'Email or password is incorrect'
        });
      }

      // Generate JWT token
      const token = generateToken({
        id: user._id,
        email: user.email,
        role: user.role
      });

      res.json({
        message: 'Login successful',
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        },
        token
      });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to login'
      });
    }
  }
);

/**
 * GET /api/auth/me
 * Get current user info (requires authentication)
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get user info'
    });
  }
});

export default router;

