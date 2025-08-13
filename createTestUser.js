import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from './models/User.js';

// Load environment variables
dotenv.config();

const createTestUser = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if test user exists
    const existingUser = await User.findOne({ email: 'test@test.com' });
    if (existingUser) {
      console.log('Test user already exists');
      await mongoose.disconnect();
      return;
    }

    // Create test user
    const testUser = new User({
      name: 'Test User',
      email: 'test@test.com',
      password: 'test123',
      role: 'user',
      isVerified: true
    });

    await testUser.save();
    console.log('Test user created successfully!');
    console.log('Email: test@test.com');
    console.log('Password: test123');

  } catch (error) {
    console.error('Error creating test user:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
};

createTestUser();
