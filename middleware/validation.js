import { validationResult } from 'express-validator';
import { logger } from './errorHandler.js';

export const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    logger.warn('Request validation failed', { 
      errors: errors.array(),
      path: req.path,
      method: req.method 
    });
    return res.status(400).json({
      success: false,
      message: 'Validation Error',
      errors: errors.array()
    });
  }
  
  logger.debug('Request validation passed', { 
    path: req.path,
    method: req.method 
  });
  next();
};

export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    logger.warn('Validation errors found', { 
      errors: errors.array(),
      path: req.path,
      method: req.method 
    });
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  
  logger.debug('Validation passed', { 
    path: req.path,
    method: req.method 
  });
  next();
};
