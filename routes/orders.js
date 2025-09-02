import express from 'express';
import { body } from 'express-validator';
import { 
  createOrder, 
  getOrders, 
  getOrder, 
  updateOrderStatus, 
  getUserOrders,
  cancelOrder,
  createCODOrder,
  getOrderTracking,
  updateOrderTracking
} from '../controllers/orderController.js';
import { protect, admin } from '../middleware/auth.js';
import { handleValidationErrors } from '../middleware/validation.js';

const router = express.Router();

// Order validation
const orderValidation = [
  body('orderItems').isArray({ min: 1 }).withMessage('Order must contain at least one item'),
  body('shippingAddress.fullName').trim().notEmpty().withMessage('Full name is required'),
  body('shippingAddress.phone').matches(/^\d{10}$/).withMessage('Please enter a valid 10-digit phone number'),
  body('shippingAddress.email').isEmail().withMessage('Please enter a valid email address'),
  body('shippingAddress.street').trim().notEmpty().withMessage('Street address is required'),
  body('shippingAddress.city').trim().notEmpty().withMessage('City is required'),
  body('shippingAddress.state').trim().notEmpty().withMessage('State is required'),
  body('shippingAddress.zipCode').trim().notEmpty().withMessage('Zip code is required'),
  body('paymentMethod').isIn(['cash_on_delivery', 'card', 'upi', 'net_banking']).withMessage('Invalid payment method'),
  handleValidationErrors
];

// COD order validation
const codOrderValidation = [
  body('items').isArray({ min: 1 }).withMessage('Order must contain at least one item'),
  body('shippingAddress.fullName').trim().notEmpty().withMessage('Full name is required'),
  body('shippingAddress.phone').matches(/^\d{10}$/).withMessage('Please enter a valid 10-digit phone number'),
  body('shippingAddress.email').isEmail().withMessage('Please enter a valid email address'),
  body('shippingAddress.street').trim().notEmpty().withMessage('Street address is required'),
  body('shippingAddress.city').trim().notEmpty().withMessage('City is required'),
  body('shippingAddress.state').trim().notEmpty().withMessage('State is required'),
  body('shippingAddress.zipCode').trim().notEmpty().withMessage('Zip code is required'),
  handleValidationErrors
];

// Protected routes
router.post('/', protect, orderValidation, createOrder);
router.post('/cod', protect, codOrderValidation, createCODOrder);
router.get('/my-orders', protect, getUserOrders);
router.get('/:id', protect, getOrder);
router.get('/:id/tracking', protect, getOrderTracking);
router.put('/:id/cancel', protect, cancelOrder);

// Admin routes
router.get('/', protect, admin, getOrders);
router.put('/:id/status', protect, admin, [
  body('status').isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']).withMessage('Invalid order status'),
  handleValidationErrors
], updateOrderStatus);
router.put('/:id/tracking', protect, admin, updateOrderTracking);

export default router;
