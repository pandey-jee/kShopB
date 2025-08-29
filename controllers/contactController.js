import nodemailer from 'nodemailer';
import logger from '../config/logger.js';
import { AppError } from '../middleware/enhancedErrorHandler.js';
import { asyncHandler } from '../middleware/enhancedErrorHandler.js';

// Submit contact form
export const submitContactForm = asyncHandler(async (req, res) => {
  const { name, email, phone, subject, message } = req.body;

  // Enhanced validation
  if (!name || !email || !message) {
    throw new AppError('Name, email, and message are required', 400);
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new AppError('Please provide a valid email address', 400);
  }

  // Message length validation
  if (message.length < 10) {
    throw new AppError('Message must be at least 10 characters long', 400);
  }

  logger.info('Processing contact form submission', {
    name,
    email,
    subject: subject || 'General Inquiry'
  });

  res.status(200).json({
    success: true,
    message: 'Message sent successfully! We will get back to you within 24 hours.'
  });
});

// Get contact information
export const getContactInfo = asyncHandler(async (req, res) => {
  const contactInfo = {
    email: 'support@panditjiautoconnect.com',
    phone: '+91-XXXXXXXXXX',
    address: {
      street: 'Shop No. 123, Auto Parts Market',
      city: 'New Delhi',
      state: 'Delhi',
      zipCode: '110001',
      country: 'India'
    },
    businessHours: {
      monday: '9:00 AM - 7:00 PM',
      tuesday: '9:00 AM - 7:00 PM',
      wednesday: '9:00 AM - 7:00 PM',
      thursday: '9:00 AM - 7:00 PM',
      friday: '9:00 AM - 7:00 PM',
      saturday: '9:00 AM - 7:00 PM',
      sunday: 'Closed'
    }
  };

  res.status(200).json({
    success: true,
    data: contactInfo
  });
});
