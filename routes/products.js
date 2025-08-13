import express from 'express';
import { body } from 'express-validator';
import { 
  getProducts, 
  getProduct, 
  createProduct, 
  updateProduct, 
  deleteProduct,
  getProductsByCategory,
  searchProducts,
  getFeaturedProducts,
  addProductReview,
  getProductReviews
} from '../controllers/productController.js';
import { protect, admin } from '../middleware/auth.js';
import { handleValidationErrors } from '../middleware/validation.js';

const router = express.Router();

// Product validation
const productValidation = [
  body('name').trim().isLength({ min: 2 }).withMessage('Product name must be at least 2 characters'),
  body('description').trim().isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
  body('price').isNumeric().withMessage('Price must be a number').isFloat({ min: 0 }).withMessage('Price cannot be negative'),
  body('category').notEmpty().withMessage('Category is required'),
  handleValidationErrors
];

// Review validation
const reviewValidation = [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('comment').optional().trim().isLength({ max: 500 }).withMessage('Comment cannot be more than 500 characters'),
  handleValidationErrors
];

// Public routes
router.get('/', getProducts);
router.get('/search', searchProducts);
router.get('/featured', getFeaturedProducts);
router.get('/category/:categoryId', getProductsByCategory);
router.get('/:id', getProduct);
router.get('/:id/reviews', getProductReviews);

// Protected routes
router.post('/:id/reviews', protect, reviewValidation, addProductReview);

// Admin routes
router.post('/', protect, admin, productValidation, createProduct);
router.put('/:id', protect, admin, productValidation, updateProduct);
router.delete('/:id', protect, admin, deleteProduct);

export default router;
