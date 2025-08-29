import express from 'express';
import {
  getCustomers,
  getCustomerById,
  getCustomerOrders,
  updateCustomerStatus,
  getCustomerAnalytics
} from '../controllers/customerController.js';
import { protect, admin } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication and admin privileges
router.use(protect);
router.use(admin);

// @route   GET /api/admin/customers
// @desc    Get all customers
// @access  Private/Admin
router.get('/', getCustomers);

// @route   GET /api/admin/customers/analytics
// @desc    Get customer analytics
// @access  Private/Admin
router.get('/analytics', getCustomerAnalytics);

// @route   GET /api/admin/customers/:customerId
// @desc    Get customer by ID
// @access  Private/Admin
router.get('/:customerId', getCustomerById);

// @route   GET /api/admin/customers/:customerId/orders
// @desc    Get customer orders
// @access  Private/Admin
router.get('/:customerId/orders', getCustomerOrders);

// @route   PUT /api/admin/customers/:customerId/status
// @desc    Update customer status
// @access  Private/Admin
router.put('/:customerId/status', updateCustomerStatus);

export default router;
