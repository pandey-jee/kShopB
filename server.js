import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import connectDB from './config/database.js';
import { validateEnvironment, getEnvironmentSummary } from './config/validateEnv.js';
import { globalErrorHandler, notFound, asyncHandler } from './middleware/enhancedErrorHandler.js';
import { sanitizeRequest } from './middleware/validation.js';

// Import services
import notificationService from './services/notificationService.js';

// Import routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import productRoutes from './routes/products.js';
import categoryRoutes from './routes/categories.js';
import orderRoutes from './routes/orders.js';
import uploadRoutes from './routes/upload.js';
import customerRoutes from './routes/customers.js';
import paymentRoutes from './routes/payment.js';
import webhookRoutes from './routes/webhooks.js';
import settingsRoutes from './routes/settings.js';
import wishlistRoutes from './routes/wishlist.js';
import reviewRoutes from './routes/reviews.js';
import searchRoutes from './routes/search.js';
import recommendationRoutes from './routes/recommendationRoutes.js';
import contactRoutes from './routes/contact.js';
import userDashboardRoutes from './routes/userDashboard.js';
import enhancedCartRoutes from './routes/enhancedCart.js';
import logger from './config/logger.js';
// import paymentMonitoringService from './services/paymentMonitoring.js';

// Load environment variables
dotenv.config();

// Validate environment variables
try {
  validateEnvironment();
  const envSummary = getEnvironmentSummary();
  logger.info('Environment configuration loaded', envSummary);
} catch (error) {
  logger.error('Environment validation failed', { error: error.message });
  process.exit(1);
}

// Connect to database
connectDB();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 5004;

// Initialize Socket.IO
notificationService.initializeSocket(server);
logger.info('Socket.IO notification service initialized');

// Security middleware with production configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      scriptSrc: ["'self'", "https:"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https:"],
      fontSrc: ["'self'", "https:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "https:"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: parseInt(process.env.HELMET_HSTS_MAX_AGE) || 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Rate limiting with environment configuration
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes default
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000) / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// CORS configuration with environment variables
const allowedOrigins = [
  // Development origins
  'http://localhost:5173',
  'http://localhost:8080',
  'http://localhost:8081',
  'http://localhost:3000',
  // Production origins from environment
  process.env.FRONTEND_URL,
  process.env.ADMIN_FRONTEND_URL,
  process.env.CORS_ORIGIN
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests) in development
    if (!origin && process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked request', { origin, allowedOrigins });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
}));

// Body parsing middleware with environment limits
app.use(express.json({ 
  limit: process.env.MAX_FILE_SIZE || '10mb'
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: process.env.MAX_FILE_SIZE || '10mb'
}));

// Request sanitization middleware
app.use(sanitizeRequest);

// HTTP request logging with Morgan
const morganFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
const morganStream = {
  write: (message) => {
    logger.info(message.trim(), { source: 'http-request' });
  }
};

app.use(morgan(morganFormat, { 
  stream: process.env.NODE_ENV === 'production' ? morganStream : process.stdout,
  skip: (req, res) => {
    // Skip logging for health checks and static files in production
    return process.env.NODE_ENV === 'production' && 
           (req.url === '/health' || req.url.startsWith('/uploads/'));
  }
}));

// Static files with proper headers
app.use('/uploads', express.static('uploads', {
  maxAge: process.env.CACHE_TTL || 3600000, // 1 hour default
  etag: true,
  lastModified: true
}));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/admin/customers', customerRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/admin/settings', settingsRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/contact', contactRoutes);

// Phase 2.3 Enhanced Routes
app.use('/api/user/dashboard', userDashboardRoutes);
app.use('/api/cart', enhancedCartRoutes);

// Health check endpoint with comprehensive status
app.get(process.env.HEALTH_CHECK_ENDPOINT || '/health', async (req, res) => {
  try {
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      database: 'connected' // We'll enhance this below
    };

    // Check database connection
    try {
      const mongoose = await import('mongoose');
      if (mongoose.default.connection.readyState === 1) {
        healthData.database = 'connected';
      } else {
        healthData.database = 'disconnected';
        healthData.status = 'degraded';
      }
    } catch (error) {
      healthData.database = 'error';
      healthData.status = 'unhealthy';
    }

    const statusCode = healthData.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(healthData);
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
});

// API info endpoint
app.get('/api/info', (req, res) => {
  res.json({
    name: 'Panditji Auto Connect API',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV,
    apiVersion: process.env.API_VERSION || 'v1',
    endpoints: {
      health: process.env.HEALTH_CHECK_ENDPOINT || '/health',
      api: `/api/${process.env.API_VERSION || 'v1'}`
    }
  });
});

// 404 handler for undefined routes
app.use('*', notFound);

// Global error handling middleware
app.use(globalErrorHandler);

app.listen = function() {
  return server.listen.apply(server, arguments);
};

server.listen(PORT, () => {
  logger.info(`Server started successfully`, {
    port: PORT,
    environment: process.env.NODE_ENV,
    apiUrl: `http://localhost:${PORT}/api`,
    socketEnabled: true,
    connectedUsers: notificationService.getConnectedUsersCount(),
    timestamp: new Date().toISOString()
  });
  
  // Start payment monitoring service in production
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_PAYMENT_MONITORING === 'true') {
    setTimeout(() => {
      // paymentMonitoringService.start();
      logger.info('Payment monitoring disabled in development');
    }, 5000); // Start after 5 seconds to ensure server is ready
  }
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`${signal} signal received: closing HTTP server`);
  
  // Close Socket.IO connections
  notificationService.cleanup();
  
  // paymentMonitoringService.stop();
  server.close(() => {
    logger.info('HTTP server closed');
    if (signal === 'SIGINT') {
      process.exit(0);
    }
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
