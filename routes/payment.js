import express from 'express';
import {
  createOrder,
  verifyPayment,
  getPaymentDetails,
  refundPayment,
  getTransactionHistory,
  getPaymentAnalytics,
} from '../controllers/enhancedPaymentController.js';
import { protect, admin } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/payment/create-order
// @desc    Create Razorpay order with transaction tracking
// @access  Private
router.post('/create-order', protect, createOrder);

// @route   POST /api/payment/verify
// @desc    Verify payment and create order with enhanced validation
// @access  Private
router.post('/verify', protect, verifyPayment);

// @route   GET /api/payment/:paymentId
// @desc    Get payment details with transaction context
// @access  Private
router.get('/:paymentId', protect, getPaymentDetails);

// @route   POST /api/payment/refund
// @desc    Process refund with transaction tracking
// @access  Private/Admin
router.post('/refund', protect, admin, refundPayment);

// @route   GET /api/payment/transactions/history
// @desc    Get user transaction history
// @access  Private
router.get('/transactions/history', protect, getTransactionHistory);

// @route   GET /api/payment/analytics
// @desc    Get payment analytics (admin only)
// @access  Private/Admin
router.get('/analytics', protect, admin, getPaymentAnalytics);

export default router;
