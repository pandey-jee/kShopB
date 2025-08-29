import express from 'express';
import {
  createOrder,
  verifyPayment,
  getPaymentDetails,
  refundPayment,
} from '../controllers/paymentController.js';
import { protect, admin } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/payment/create-order
// @desc    Create Razorpay order
// @access  Private
router.post('/create-order', protect, createOrder);

// @route   POST /api/payment/verify
// @desc    Verify payment and create order
// @access  Private
router.post('/verify', protect, verifyPayment);

// @route   GET /api/payment/:paymentId
// @desc    Get payment details
// @access  Private
router.get('/:paymentId', protect, getPaymentDetails);

// @route   POST /api/payment/refund
// @desc    Refund payment
// @access  Private/Admin
router.post('/refund', protect, admin, refundPayment);

export default router;
