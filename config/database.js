import mongoose from 'mongoose';
import { logger } from '../middleware/errorHandler.js';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    logger.info('MongoDB connected successfully', { 
      host: conn.connection.host,
      database: conn.connection.name,
      port: conn.connection.port
    });
  } catch (error) {
    logger.error('MongoDB connection failed', { 
      error: error.message,
      stack: error.stack 
    });
    process.exit(1);
  }
};

export default connectDB;
