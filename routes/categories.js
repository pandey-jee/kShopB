import express from 'express';
import { body } from 'express-validator';
import { 
  getCategories, 
  getCategory, 
  createCategory, 
  updateCategory, 
  deleteCategory 
} from '../controllers/categoryController.js';
import { protect, admin } from '../middleware/auth.js';
import { handleValidationErrors } from '../middleware/validation.js';

const router = express.Router();

// Category validation
const categoryValidation = [
  body('name').trim().isLength({ min: 2 }).withMessage('Category name must be at least 2 characters'),
  body('description').optional().trim().isLength({ max: 500 }).withMessage('Description cannot be more than 500 characters'),
  handleValidationErrors
];

// Public routes
router.get('/', getCategories);
router.get('/:id', getCategory);

// Admin routes
router.post('/', protect, admin, categoryValidation, createCategory);
router.put('/:id', protect, admin, categoryValidation, updateCategory);
router.delete('/:id', protect, admin, deleteCategory);

export default router;
