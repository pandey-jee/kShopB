import express from 'express';
import { submitContactForm, getContactInfo } from '../controllers/contactController.js';
import { body } from 'express-validator';
import { validationResult } from 'express-validator';

const router = express.Router();

// Validation middleware
const contactValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('phone')
    .optional()
    .isMobilePhone('en-IN')
    .withMessage('Please provide a valid Indian phone number'),
  body('subject')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Subject must be less than 100 characters'),
  body('message')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Message must be between 10 and 1000 characters')
];

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// @route   POST /api/contact/submit
// @desc    Submit contact form
// @access  Public
router.post('/submit', contactValidation, handleValidationErrors, submitContactForm);

// @route   GET /api/contact/info
// @desc    Get contact information
// @access  Public
router.get('/info', getContactInfo);

export default router;
