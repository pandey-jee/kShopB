import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from './models/User.js';

// Load environment variables
dotenv.config();

const createAdminUser = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Remove existing admin user if exists
    await User.deleteOne({ email: 'kartikpareekak@gmail.com' });
    console.log('Removed existing admin user if any');

    // Create new admin user
    const adminUser = new User({
      name: 'Kartik Pareek',
      email: 'kartikpareekak@gmail.com',
      password: 'Kartik123',
      role: 'admin',
      isVerified: true,
      phone: '9034667768',
      address: {
        street: 'Admin Street',
        city: 'Admin City',
        state: 'Rajasthan',
        zipCode: '123456',
        country: 'India'
      }
    });

    await adminUser.save();
    console.log('✅ Admin user created successfully!');
    console.log('📧 Email: kartikpareekak@gmail.com');
    console.log('🔑 Password: Kartik123');
    console.log('🌐 Admin Portal: http://localhost:8080/admin');

  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
};

createAdminUser();
