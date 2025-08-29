import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from './models/User.js';
import Category from './models/Category.js';
import { CATEGORY_IMAGES } from './utils/imageAssets.js';

// Load environment variables
dotenv.config();

const seedData = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing admin users
    await User.deleteMany({ role: 'admin' });
    console.log('Cleared existing admin users');

    // Create admin user
    const adminPassword = await bcrypt.hash('admin123', 12);
    const adminUser = new User({
      name: 'Admin',
      email: 'admin@panditji.com',
      password: adminPassword,
      role: 'admin',
      isVerified: true,
      phone: '9034667768',
      address: {
        street: 'Admin Street',
        city: 'Admin City',
        state: 'Admin State',
        zipCode: '123456',
        country: 'India'
      }
    });

    await adminUser.save();
    console.log('Admin user created successfully');
    console.log('Email: admin@panditji.com');
    console.log('Password: admin123');

    // Create some sample categories with real automotive images
    const categories = [
      {
        name: 'Engine Parts',
        description: 'Air filters, oil filters, spark plugs and engine components',
        image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop',
        isActive: true
      },
      {
        name: 'Electrical',
        description: 'Headlights, tail lights, batteries and electrical components',
        image: 'https://images.unsplash.com/photo-1544829099-b9a0c5303bea?w=400&h=400&fit=crop',
        isActive: true
      },
      {
        name: 'Suspension',
        description: 'Shock absorbers, springs, struts and suspension parts',
        image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop',
        isActive: true
      },
      {
        name: 'Accessories',
        description: 'Car covers, floor mats, seat covers and organizers',
        image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop',
        isActive: true
      },
      {
        name: 'Tires & Wheels',
        description: 'Alloy wheels, steel wheels, wheel covers and tires',
        image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop',
        isActive: true
      },
      {
        name: 'Brake System',
        description: 'Brake pads, brake discs, brake fluid and brake components',
        image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop',
        isActive: true
      }
    ];

    // Clear existing categories
    await Category.deleteMany({});
    console.log('Cleared existing categories');

    // Insert new categories
    await Category.insertMany(categories);
    console.log('Sample categories created successfully');

    console.log('\n✅ Database seeded successfully!');
    console.log('\nYou can now login to the admin panel with:');
    console.log('Email: admin@panditji.com');
    console.log('Password: admin123');
    console.log('\nAdmin panel URL: http://localhost:8080/admin');

  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
};

seedData();
