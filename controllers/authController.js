import User from '../models/User.js';
import { generateToken } from '../middleware/auth.js';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { logger } from '../middleware/errorHandler.js';

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
export const register = async (req, res) => {
  try {
    logger.info('User registration attempt', { email: req.body.email });
    const { name, email, password, phone } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      logger.warn('Registration failed - missing required fields', { 
        name: !!name, 
        email: !!email, 
        password: !!password 
      });
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required'
      });
    }

    // Check if user already exists
    const userExists = await User.findOne({ email });
    logger.debug('User existence check', { email, exists: !!userExists });
    
    if (userExists) {
      logger.warn('Registration failed - user already exists', { email });
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Create user
    logger.debug('Creating new user', { name, email, phone });
    const user = await User.create({
      name,
      email,
      password,
      phone: phone && phone.trim() !== '' ? phone : undefined
    });

    logger.info('User created successfully', { userId: user._id, email });

    const token = generateToken(user._id);
    const responseData = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: token
    };

    logger.info('Registration successful', { userId: user._id });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: responseData
    });
  } catch (error) {
    logger.error('Registration error', { 
      error: error.message, 
      stack: error.stack,
      email: req.body.email,
      errorName: error.name,
      errorCode: error.code 
    });
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(val => val.message);
      logger.warn('Registration validation errors', { errors });
      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: errors
      });
    }
    
    // Handle duplicate key error
    if (error.code === 11000) {
      logger.warn('Registration failed - duplicate email', { email: req.body.email });
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }
    
    logger.error('Server error during registration', { 
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({
      success: false,
      message: 'Server error during registration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res) => {
  try {
    logger.info('User login attempt', { email: req.body.email });
    const { email, password } = req.body;

    if (!email || !password) {
      logger.warn('Login failed - missing credentials');
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Check for user
    const user = await User.findOne({ email }).select('+password');
    logger.debug('User lookup result', { email, found: !!user });
    
    if (!user) {
      logger.warn('Login failed - user not found', { email });
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isPasswordValid = await user.matchPassword(password);
    logger.debug('Password validation result', { email, valid: isPasswordValid });

    if (!isPasswordValid) {
      logger.warn('Login failed - invalid password', { email });
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    logger.info('Login successful', { userId: user._id, email });
    
    const token = generateToken(user._id);
    const responseData = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: token
    };

    logger.debug('Login response prepared', { userId: user._id });

    res.json({
      success: true,
      message: 'Login successful',
      data: responseData
    });
  } catch (error) {
    logger.error('Login error', { 
      error: error.message, 
      stack: error.stack,
      email: req.body.email 
    });
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching profile'
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
export const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (user) {
      user.name = req.body.name || user.name;
      user.email = req.body.email || user.email;
      user.phone = req.body.phone || user.phone;
      
      if (req.body.address) {
        user.address = { ...user.address, ...req.body.address };
      }

      const updatedUser = await user.save();

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          _id: updatedUser._id,
          name: updatedUser.name,
          email: updatedUser.email,
          phone: updatedUser.phone,
          address: updatedUser.address,
          role: updatedUser.role
        }
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating profile'
    });
  }
};

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found with this email'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(20).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

    await user.save();

    // Send email (simplified for demo)
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    res.json({
      success: true,
      message: 'Password reset email sent',
      resetUrl // In production, this should be sent via email
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during password reset'
    });
  }
};

// @desc    Reset password
// @route   POST /api/auth/reset-password/:token
// @access  Public
export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Set new password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    res.json({
      success: true,
      message: 'Password reset successful',
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: generateToken(user._id)
      }
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during password reset'
    });
  }
};

// @desc    Verify email
// @route   GET /api/auth/verify-email/:token
// @access  Public
export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token'
      });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpire = undefined;

    await user.save();

    res.json({
      success: true,
      message: 'Email verified successfully'
    });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during email verification'
    });
  }
};
