import { logger } from '../middleware/errorHandler.js';

/**
 * Validates required environment variables for production deployment
 */
export const validateEnvironment = () => {
  const requiredVars = [
    'NODE_ENV',
    'PORT',
    'MONGODB_URI',
    'JWT_SECRET'
  ];

  const productionVars = [
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'EMAIL_USER',
    'EMAIL_PASS',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'FRONTEND_URL'
  ];

  const missing = [];
  const warnings = [];

  // Check required variables
  requiredVars.forEach(varName => {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  });

  // Check production-specific variables
  if (process.env.NODE_ENV === 'production') {
    productionVars.forEach(varName => {
      if (!process.env[varName]) {
        missing.push(varName);
      }
    });
  }

  // Check for placeholder values
  const placeholders = [
    { var: 'JWT_SECRET', placeholder: 'your-jwt-secret' },
    { var: 'MONGODB_URI', placeholder: 'mongodb://localhost' },
    { var: 'EMAIL_USER', placeholder: 'your-email' },
    { var: 'EMAIL_PASS', placeholder: 'your-password' },
    { var: 'CLOUDINARY_CLOUD_NAME', placeholder: 'your-cloud-name' },
    { var: 'RAZORPAY_KEY_ID', placeholder: 'your-key-id' },
    { var: 'FRONTEND_URL', placeholder: 'your-domain' }
  ];

  placeholders.forEach(({ var: varName, placeholder }) => {
    const value = process.env[varName];
    if (value && (value.includes(placeholder) || value.includes('placeholder') || value.includes('your-'))) {
      warnings.push(`${varName} appears to contain placeholder value`);
    }
  });

  // Security checks
  const securityChecks = [];

  // JWT Secret length
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    securityChecks.push('JWT_SECRET should be at least 32 characters long');
  }

  // MongoDB URI protocol check
  if (process.env.MONGODB_URI && !process.env.MONGODB_URI.startsWith('mongodb')) {
    securityChecks.push('MONGODB_URI should start with mongodb:// or mongodb+srv://');
  }

  // Production environment checks
  if (process.env.NODE_ENV === 'production') {
    // Check for development values in production
    if (process.env.MONGODB_URI && process.env.MONGODB_URI.includes('localhost')) {
      securityChecks.push('Using localhost database in production');
    }

    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_ID.includes('test')) {
      securityChecks.push('Using test Razorpay keys in production');
    }

    if (process.env.FRONTEND_URL && process.env.FRONTEND_URL.includes('localhost')) {
      securityChecks.push('Using localhost frontend URL in production');
    }
  }

  // Log results
  if (missing.length > 0) {
    logger.error('Missing required environment variables', { missing });
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (warnings.length > 0) {
    logger.warn('Environment variable warnings', { warnings });
  }

  if (securityChecks.length > 0) {
    logger.warn('Security configuration warnings', { securityChecks });
    if (process.env.NODE_ENV === 'production') {
      logger.error('Critical security issues in production', { securityChecks });
      throw new Error('Security configuration issues detected in production');
    }
  }

  logger.info('Environment validation passed', {
    environment: process.env.NODE_ENV,
    requiredVarsCount: requiredVars.length,
    warningsCount: warnings.length,
    securityChecksCount: securityChecks.length
  });

  return {
    valid: true,
    warnings,
    securityChecks
  };
};

/**
 * Gets environment configuration summary
 */
export const getEnvironmentSummary = () => {
  return {
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    databaseType: process.env.MONGODB_URI ? 'MongoDB' : 'Unknown',
    hasCloudinary: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY),
    hasEmail: !!(process.env.EMAIL_USER && process.env.EMAIL_PASS),
    hasPayment: !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    frontendUrl: process.env.FRONTEND_URL || 'Not configured',
    logLevel: process.env.LOG_LEVEL || 'info',
    rateLimit: {
      windowMs: process.env.RATE_LIMIT_WINDOW_MS || '900000',
      maxRequests: process.env.RATE_LIMIT_MAX_REQUESTS || '100'
    }
  };
};
