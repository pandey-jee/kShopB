import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { AppError, asyncHandler } from './enhancedErrorHandler.js';
import { logger } from './errorHandler.js';

export const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    // Get token from header
    token = req.headers.authorization.split(' ')[1];

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from the token
    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      logger.warn('Token valid but user not found', { userId: decoded.id });
      return next(new AppError('User no longer exists', 401, 'USER_NOT_FOUND'));
    }

    logger.info('User authenticated successfully', { 
      userId: req.user._id, 
      userEmail: req.user.email 
    });

    return next();
  }

  if (!token) {
    logger.warn('Authentication attempted without token', { 
      ip: req.ip, 
      userAgent: req.get('User-Agent'),
      url: req.originalUrl 
    });
    return next(new AppError('Not authorized, no token provided', 401, 'NO_TOKEN'));
  }
});

export const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    logger.info('Admin access granted', { 
      userId: req.user._id, 
      userEmail: req.user.email,
      url: req.originalUrl 
    });
    next();
  } else {
    logger.warn('Admin access denied', { 
      userId: req.user?.id || 'unknown', 
      userRole: req.user?.role || 'none',
      url: req.originalUrl 
    });
    next(new AppError('Not authorized as an admin', 403, 'ADMIN_ACCESS_DENIED'));
  }
};

// Generate JWT Token
export const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};
