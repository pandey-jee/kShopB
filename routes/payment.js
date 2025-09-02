import express from 'express';
import {
  createOrder,
  verifyPayment,
  getPaymentStatus,
  handleWebhook
} from '../controllers/paymentController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/payment/create-order
// @desc    Create Cashfree order
// @access  Private
router.post('/create-order', protect, createOrder);

// @route   POST /api/payment/verify
// @desc    Verify Cashfree payment and create order
// @access  Private
router.post('/verify', protect, verifyPayment);

// @route   GET /api/payment/status/:orderId
// @desc    Get payment status
// @access  Private
router.get('/status/:orderId', protect, getPaymentStatus);

// @route   POST /api/payment/webhook
// @desc    Handle Cashfree webhook
// @access  Public
router.post('/webhook', handleWebhook);

export default router;
