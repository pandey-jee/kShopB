import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from './models/User.js';
import Category from './models/Category.js';

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

    // Create some sample categories
    const categories = [
      {
        name: 'Horns & Sounds',
        description: 'Various types of horns and sound systems for vehicles',
        image: '/placeholder.svg',
        isActive: true
      },
      {
        name: 'Auxiliary Lights',
        description: 'LED bars, fog lights, work lights and spotlights',
        image: '/placeholder.svg',
        isActive: true
      },
      {
        name: 'Modifications',
        description: 'Body kits, spoilers, side skirts and grilles',
        image: '/placeholder.svg',
        isActive: true
      },
      {
        name: 'Accessories',
        description: 'Car covers, floor mats, seat covers and organizers',
        image: '/placeholder.svg',
        isActive: true
      },
      {
        name: 'Wheels',
        description: 'Alloy wheels, steel wheels, wheel covers and tires',
        image: '/placeholder.svg',
        isActive: true
      },
      {
        name: 'Switches',
        description: 'Toggle switches, push buttons, rocker switches',
        image: '/placeholder.svg',
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
