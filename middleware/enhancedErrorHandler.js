import { logger } from './errorHandler.js';

/**
 * Custom Error Class for Application Errors
 */
export class AppError extends Error {
  constructor(message, statusCode, code = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * MongoDB Error Handlers
 */
export const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new AppError(message, 400, 'INVALID_ID');
};

export const handleDuplicateFieldsDB = (err) => {
  const field = Object.keys(err.keyValue)[0];
  const value = err.keyValue[field];
  const message = `${field.charAt(0).toUpperCase() + field.slice(1)} '${value}' already exists`;
  return new AppError(message, 400, 'DUPLICATE_FIELD', { field, value });
};

export const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map(val => ({
    field: val.path,
    message: val.message,
    value: val.value
  }));
  
  const message = 'Invalid input data';
  return new AppError(message, 400, 'VALIDATION_ERROR', { errors });
};

export const handleJWTError = () => {
  return new AppError('Invalid token. Please log in again!', 401, 'INVALID_TOKEN');
};

export const handleJWTExpiredError = () => {
  return new AppError('Your token has expired! Please log in again.', 401, 'EXPIRED_TOKEN');
};

/**
 * Rate Limiting Error Handler
 */
export const handleRateLimitError = () => {
  return new AppError('Too many requests. Please try again later.', 429, 'RATE_LIMIT_EXCEEDED');
};

/**
 * File Upload Error Handlers
 */
export const handleMulterError = (err) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return new AppError('File too large. Maximum size is 10MB.', 400, 'FILE_TOO_LARGE');
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return new AppError('Too many files. Maximum is 10 files.', 400, 'TOO_MANY_FILES');
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return new AppError('Unexpected file field.', 400, 'UNEXPECTED_FILE');
  }
  return new AppError('File upload error.', 400, 'UPLOAD_ERROR');
};

/**
 * Payment Error Handlers
 */
export const handlePaymentError = (err) => {
  if (err.code === 'PAYMENT_FAILED') {
    return new AppError('Payment processing failed. Please try again.', 400, 'PAYMENT_FAILED');
  }
  if (err.code === 'INSUFFICIENT_FUNDS') {
    return new AppError('Insufficient funds. Please check your payment method.', 400, 'INSUFFICIENT_FUNDS');
  }
  return new AppError('Payment error occurred.', 400, 'PAYMENT_ERROR');
};

/**
 * Send Error Response in Development
 */
const sendErrorDev = (err, req, res) => {
  logger.error('Development Error:', {
    error: err.message,
    stack: err.stack,
    statusCode: err.statusCode,
    code: err.code,
    details: err.details,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(err.statusCode).json({
    success: false,
    error: err,
    message: err.message,
    code: err.code,
    details: err.details,
    stack: err.stack,
    timestamp: err.timestamp
  });
};

/**
 * Send Error Response in Production
 */
const sendErrorProd = (err, req, res) => {
  // Operational, trusted error: send message to client
  if (err.isOperational) {
    logger.error('Operational Error:', {
      message: err.message,
      statusCode: err.statusCode,
      code: err.code,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userId: req.user?.id || 'anonymous'
    });

    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.code,
      details: err.details,
      timestamp: err.timestamp
    });
  } else {
    // Programming or other unknown error: don't leak error details
    logger.error('System Error:', {
      error: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userId: req.user?.id || 'anonymous'
    });

    res.status(500).json({
      success: false,
      message: 'Something went wrong!',
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Global Error Handler Middleware
 */
export const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, req, res);
  } else {
    let error = { ...err };
    error.message = err.message;

    // MongoDB Errors
    if (error.name === 'CastError') error = handleCastErrorDB(error);
    if (error.code === 11000) error = handleDuplicateFieldsDB(error);
    if (error.name === 'ValidationError') error = handleValidationErrorDB(error);
    
    // JWT Errors
    if (error.name === 'JsonWebTokenError') error = handleJWTError();
    if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();
    
    // Multer Errors
    if (error.name === 'MulterError') error = handleMulterError(error);
    
    // Rate Limit Errors
    if (error.statusCode === 429) error = handleRateLimitError();

    sendErrorProd(error, req, res);
  }
};

/**
 * Async Error Handler Wrapper
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Not Found Handler
 */
export const notFound = (req, res, next) => {
  const message = `Route ${req.originalUrl} not found`;
  logger.warn('Route not found', {
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  next(new AppError(message, 404, 'ROUTE_NOT_FOUND'));
};

/**
 * Validation Helper Functions
 */
export const createValidationError = (errors) => {
  const message = 'Validation failed';
  const details = errors.map(err => ({
    field: err.path || err.param,
    message: err.msg || err.message,
    value: err.value,
    location: err.location
  }));
  
  return new AppError(message, 400, 'VALIDATION_ERROR', { errors: details });
};

/**
 * Error Response Helper
 */
export const sendErrorResponse = (res, message, statusCode = 500, code = null, details = null) => {
  const error = new AppError(message, statusCode, code, details);
  
  if (process.env.NODE_ENV === 'development') {
    return res.status(statusCode).json({
      success: false,
      message: error.message,
      code: error.code,
      details: error.details,
      timestamp: error.timestamp,
      stack: error.stack
    });
  }
  
  return res.status(statusCode).json({
    success: false,
    message: error.message,
    code: error.code,
    details: error.details,
    timestamp: error.timestamp
  });
};

export default {
  AppError,
  globalErrorHandler,
  asyncHandler,
  notFound,
  createValidationError,
  sendErrorResponse,
  handleCastErrorDB,
  handleDuplicateFieldsDB,
  handleValidationErrorDB,
  handleJWTError,
  handleJWTExpiredError,
  handleRateLimitError,
  handleMulterError,
  handlePaymentError
};
