import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from './models/User.js';
import connectDB from './config/database.js';
import { logger } from './middleware/errorHandler.js';

// Load environment variables
dotenv.config();

const seedAdmin = async () => {
  try {
    await connectDB();
    
    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin@panditji.com' });
    if (existingAdmin) {
      logger.info('Admin user already exists');
      process.exit(0);
    }

    // Create admin user
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    const adminUser = new User({
      name: 'Admin User',
      email: 'admin@panditji.com',
      password: hashedPassword,
      role: 'admin',
      phone: '9034667768',
      isVerified: true,
      address: {
        street: 'Admin Street',
        city: 'Admin City',
        state: 'Admin State',
        zipCode: '123456',
        country: 'India'
      }
    });

    await adminUser.save();
    logger.info('Admin user created successfully', {
      email: 'admin@panditji.com',
      name: 'Admin User'
    });
    
    process.exit(0);
  } catch (error) {
    logger.error('Error creating admin user', { 
      error: error.message, 
      stack: error.stack 
    });
    process.exit(1);
  }
};

seedAdmin();
