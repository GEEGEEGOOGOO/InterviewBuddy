import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * JWT Authentication Middleware
 * Verifies JWT token from Authorization header
 */
export const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No token provided'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded; // Attach user info to request
      next();
    } catch (error) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token'
      });
    }

  } catch (error) {
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error authenticating request'
    });
  }
};

/**
 * Generate JWT token
 * @param {Object} user - User object with id and email
 * @returns {string} JWT token
 */
export const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role || 'candidate'
    },
    JWT_SECRET,
    {
      expiresIn: '7d' // Token expires in 7 days
    }
  );
};

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
export const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
      } catch (error) {
        // Token invalid, but continue without authentication
        req.user = null;
      }
    }

    next();
  } catch (error) {
    next();
  }
};

export default { authenticate, generateToken, optionalAuth };

