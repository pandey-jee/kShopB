import { validationResult } from 'express-validator';
import { logger } from './errorHandler.js';
import { createValidationError } from './enhancedErrorHandler.js';

export const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    logger.warn('Request validation failed', { 
      errors: errors.array(),
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id || 'anonymous'
    });
    
    const validationError = createValidationError(errors.array());
    return next(validationError);
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
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id || 'anonymous'
    });
    
    const validationError = createValidationError(errors.array());
    return next(validationError);
  }
  
  logger.debug('Validation passed', { 
    path: req.path,
    method: req.method 
  });
  next();
};

// Advanced validation with custom error messages
export const createCustomValidation = (validations) => {
  return async (req, res, next) => {
    // Run all validations
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      const customErrors = errors.array().map(error => ({
        field: error.path || error.param,
        message: error.msg,
        value: error.value,
        location: error.location,
        code: `INVALID_${(error.path || error.param).toUpperCase()}`
      }));

      logger.warn('Custom validation errors', {
        errors: customErrors,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userId: req.user?.id || 'anonymous'
      });

      const validationError = createValidationError(customErrors);
      return next(validationError);
    }

    next();
  };
};

// Sanitization helper
export const sanitizeRequest = (req, res, next) => {
  // Remove any null prototype pollution attempts
  if (req.body && typeof req.body === 'object') {
    const sanitized = JSON.parse(JSON.stringify(req.body));
    req.body = sanitized;
  }

  if (req.query && typeof req.query === 'object') {
    const sanitized = JSON.parse(JSON.stringify(req.query));
    req.query = sanitized;
  }

  if (req.params && typeof req.params === 'object') {
    const sanitized = JSON.parse(JSON.stringify(req.params));
    req.params = sanitized;
  }

  next();
};
