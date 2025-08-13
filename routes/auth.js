import express from 'express';
import { body } from 'express-validator';
import { 
  register, 
  login, 
  getProfile, 
  updateProfile, 
  forgotPassword, 
  resetPassword,
  verifyEmail 
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { handleValidationErrors } from '../middleware/validation.js';

const router = express.Router();

// Registration validation
const registerValidation = [
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email').isEmail().withMessage('Please enter a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('phone').optional({ checkFalsy: true }).matches(/^\d{10}$/).withMessage('Please enter a valid 10-digit phone number'),
  handleValidationErrors
];

// Login validation
const loginValidation = [
  body('email').isEmail().withMessage('Please enter a valid email'),
  body('password').notEmpty().withMessage('Password is required'),
  handleValidationErrors
];

// Profile update validation
const profileUpdateValidation = [
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email').optional().isEmail().withMessage('Please enter a valid email'),
  body('phone').optional().matches(/^\d{10}$/).withMessage('Please enter a valid 10-digit phone number'),
  handleValidationErrors
];

// Password reset validation
const resetPasswordValidation = [
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  handleValidationErrors
];

// Routes
router.get('/test', (req, res) => {
  res.json({ message: 'Auth routes working!', timestamp: new Date() });
});
router.post('/register', register);  // Temporarily remove validation
router.post('/login', loginValidation, login);
router.get('/profile', protect, getProfile);
router.put('/profile', protect, profileUpdateValidation, updateProfile);
router.post('/forgot-password', [
  body('email').isEmail().withMessage('Please enter a valid email'),
  handleValidationErrors
], forgotPassword);
router.post('/reset-password/:token', resetPasswordValidation, resetPassword);
router.get('/verify-email/:token', verifyEmail);

export default router;
