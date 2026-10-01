import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';

const JWT_SECRET = process.env.JWT_SECRET || 'digital-project-secret-key-2026';

export const authenticateUser = async (req, res, next) => {
  try {
    let token = null;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.stakelab_token) {
      token = req.cookies.stakelab_token;
    }

    let userId = null;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.id;
      } catch (err) {
        // Token invalid or expired
      }
    }

    // Fallback if userId passed in query or headers
    if (!userId) {
      userId = req.headers['x-user-id'] || req.query.userId;
    }

    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });
      if (user) {
        req.user = user;
        return next();
      }
    }

    // Optional auth - let route handler decide if login required
    req.user = null;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    next();
  }
};

export const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  next();
};
