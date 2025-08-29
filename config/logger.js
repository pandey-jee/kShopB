import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...(stack && { stack }),
      ...meta
    });
  })
);

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

// Create logger configuration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format: logFormat,
  defaultMeta: { service: 'panditji-auto-connect' },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.simple(),
        winston.format.printf(
          ({ timestamp, level, message, ...meta }) =>
            `${timestamp} [${level}]: ${message} ${
              Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
            }`
        )
      ),
    }),
  ],
});

// Add file transports for production
if (process.env.NODE_ENV === 'production') {
  const logDir = path.join(__dirname, '../logs');
  
  // Ensure log directory exists
  import('fs').then(fs => {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  });

  // Add file transports
  logger.add(
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: parseInt(process.env.LOG_FILE_MAX_SIZE) || 5242880, // 5MB
      maxFiles: parseInt(process.env.LOG_FILE_MAX_FILES) || 5,
      format: logFormat,
    })
  );

  logger.add(
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: parseInt(process.env.LOG_FILE_MAX_SIZE) || 5242880, // 5MB
      maxFiles: parseInt(process.env.LOG_FILE_MAX_FILES) || 5,
      format: logFormat,
    })
  );
}

// Create request logger middleware
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.http('HTTP Request', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      userId: req.user?.id
    });
  });
  
  next();
};

// Error logger
export const errorLogger = (error, req, res, next) => {
  logger.error('Request Error', {
    error: error.message,
    stack: error.stack,
    method: req.method,
    url: req.url,
    body: req.body,
    params: req.params,
    query: req.query,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: req.user?.id
  });
  
  next(error);
};

// Search logger utilities
export const searchLogger = {
  logQuery: (query, results, metadata = {}) => {
    logger.info('Search Query', {
      query,
      resultCount: results?.length || 0,
      ...metadata
    });
  },
  
  logError: (query, error, metadata = {}) => {
    logger.error('Search Error', {
      query,
      error: error.message,
      stack: error.stack,
      ...metadata
    });
  },
  
  logPerformance: (operation, duration, metadata = {}) => {
    logger.info('Search Performance', {
      operation,
      duration: `${duration}ms`,
      ...metadata
    });
  }
};

// Payment logger utilities
export const paymentLogger = {
  logTransaction: (transactionId, status, amount, metadata = {}) => {
    logger.info('Payment Transaction', {
      transactionId,
      status,
      amount,
      ...metadata
    });
  },
  
  logWebhook: (event, data, metadata = {}) => {
    logger.info('Payment Webhook', {
      event,
      data,
      ...metadata
    });
  },
  
  logError: (operation, error, metadata = {}) => {
    logger.error('Payment Error', {
      operation,
      error: error.message,
      stack: error.stack,
      ...metadata
    });
  }
};

export default logger;
