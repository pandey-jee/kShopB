import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from './models/User.js';
import connectDB from './config/database.js';

// Load environment variables
dotenv.config();

const seedAdmin = async () => {
  try {
    await connectDB();
    
    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin@panditji.com' });
    if (existingAdmin) {
      console.log('Admin user already exists');
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
    console.log('Admin user created successfully!');
    console.log('Email: admin@panditji.com');
    console.log('Password: admin123');
    
    process.exit(0);
  } catch (error) {
    console.error('Error creating admin user:', error);
    process.exit(1);
  }
};

seedAdmin();
