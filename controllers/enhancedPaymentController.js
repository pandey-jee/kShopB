import Razorpay from 'razorpay';
import crypto from 'crypto';
import Order from '../models/Order.js';
import Transaction from '../models/Transaction.js';
import { AppError } from '../middleware/enhancedErrorHandler.js';
import { asyncHandler } from '../middleware/enhancedErrorHandler.js';
import logger from '../config/logger.js';

// Initialize Razorpay with validation (lazy initialization)
let razorpay = null;

const initializeRazorpay = () => {
  if (razorpay) return razorpay;
  
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  
  if (!keyId || !keySecret || keyId.includes('YOUR_') || keySecret.includes('YOUR_')) {
    logger.warn('Razorpay credentials not configured. Payment features will be disabled.');
    return null;
  }
  
  try {
    razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
    logger.info('Razorpay initialized successfully');
    return razorpay;
  } catch (error) {
    logger.error('Failed to initialize Razorpay', { error: error.message });
    return null;
  }
};

// Helper function to get Razorpay instance
const getRazorpayInstance = () => {
  const instance = initializeRazorpay();
  if (!instance) {
    throw new AppError('Payment service is not available. Please contact support.', 503);
  }
  return instance;
};

// Payment retry configuration
const RETRY_CONFIG = {
  maxAttempts: 3,
  backoffMultiplier: 2,
  initialDelay: 1000, // 1 second
  maxDelay: 10000,    // 10 seconds
};

// Helper function for exponential backoff
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const calculateRetryDelay = (attempt) => {
  const delay = RETRY_CONFIG.initialDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt - 1);
  return Math.min(delay, RETRY_CONFIG.maxDelay);
};

// Enhanced payment creation with transaction tracking
export const createOrder = asyncHandler(async (req, res) => {
  const { amount, currency = 'INR', items, shippingAddress } = req.body;
  
  // Validate request
  if (!amount || amount <= 0) {
    throw new AppError('Invalid amount specified', 400);
  }
  
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new AppError('Order items are required', 400);
  }
  
  const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Create Razorpay order with retry mechanism
    const razorpayOrder = await createRazorpayOrderWithRetry({
      amount: amount * 100, // Convert to paise
      currency,
      receipt: transactionId,
      notes: {
        user_id: req.user._id.toString(),
        transaction_id: transactionId,
        items_count: items.length.toString()
      }
    });
    
    // Create initial transaction record
    const transaction = new Transaction({
      transactionId,
      orderId: null, // Will be updated after order creation
      userId: req.user._id,
      gateway: 'razorpay',
      gatewayTransactionId: razorpayOrder.id,
      gatewayOrderId: razorpayOrder.id,
      amount: amount,
      currency,
      type: 'payment',
      method: 'card', // Will be updated during verification
      status: 'initiated',
      netAmount: amount,
      customerInfo: {
        email: req.user.email,
        phone: req.user.phone,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      },
      metadata: {
        source: 'web',
        sessionId: req.sessionID || 'unknown',
        correlationId: transactionId,
        additionalData: {
          itemsCount: items.length,
          shippingRequired: !!shippingAddress
        }
      }
    });
    
    await transaction.save();
    
    logger.info('Payment order created successfully', {
      transactionId,
      orderId: razorpayOrder.id,
      amount,
      userId: req.user._id,
      userAgent: req.get('User-Agent'),
      ipAddress: req.ip
    });
    
    res.json({
      success: true,
      order: {
        id: razorpayOrder.id,
        currency: razorpayOrder.currency,
        amount: razorpayOrder.amount,
        transactionId,
        key_id: process.env.RAZORPAY_KEY_ID
      },
      transaction: {
        id: transaction._id,
        transactionId: transaction.transactionId,
        status: transaction.status
      }
    });
    
  } catch (error) {
    logger.error('Payment order creation failed', {
      error: error.message,
      stack: error.stack,
      transactionId,
      userId: req.user._id,
      amount
    });
    
    throw new AppError(
      error.message.includes('API') ? 'Payment gateway unavailable. Please try again.' : error.message,
      500
    );
  }
});

// Enhanced payment verification with comprehensive validation
export const verifyPayment = asyncHandler(async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    orderData,
    transactionId
  } = req.body;
  
  // Validate required fields
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw new AppError('Missing payment verification data', 400);
  }
  
  if (!orderData || !transactionId) {
    throw new AppError('Missing order or transaction data', 400);
  }
  
  try {
    // Find existing transaction
    const transaction = await Transaction.findOne({ transactionId });
    if (!transaction) {
      throw new AppError('Transaction not found', 404);
    }
    
    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');
    
    if (expectedSignature !== razorpay_signature) {
      // Update transaction with failure
      await transaction.addStatusUpdate('failed', 'Invalid payment signature', {
        razorpay_order_id,
        razorpay_payment_id,
        provided_signature: razorpay_signature,
        expected_signature: expectedSignature
      });
      
      logger.error('Payment signature verification failed', {
        transactionId,
        razorpay_order_id,
        razorpay_payment_id,
        userId: req.user._id
      });
      
      throw new AppError('Payment verification failed', 400);
    }
    
    // Fetch payment details from Razorpay for additional validation
    const paymentDetails = await fetchPaymentDetailsWithRetry(razorpay_payment_id);
    
    // Validate payment amount and status
    if (paymentDetails.amount !== transaction.amount * 100) {
      throw new AppError('Payment amount mismatch', 400);
    }
    
    if (paymentDetails.status !== 'captured') {
      throw new AppError('Payment not captured successfully', 400);
    }
    
    // Create order
    const order = new Order({
      user: req.user._id,
      items: orderData.items,
      shippingAddress: orderData.shippingAddress,
      paymentMethod: 'ONLINE',
      paymentInfo: {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
      },
      itemsPrice: orderData.itemsPrice,
      shippingPrice: orderData.shippingPrice,
      total: orderData.totalPrice,
      status: 'confirmed',
      isPaid: true,
      paidAt: new Date()
    });
    
    const savedOrder = await order.save();
    await savedOrder.populate('items.product user');
    
    // Update transaction with success details
    transaction.orderId = savedOrder._id;
    transaction.gatewayPaymentId = razorpay_payment_id;
    transaction.method = getPaymentMethod(paymentDetails.method);
    transaction.paymentDetails = extractPaymentDetails(paymentDetails);
    transaction.fees = calculateFees(paymentDetails);
    
    await transaction.addStatusUpdate('success', 'Payment verified and captured', {
      order_id: savedOrder._id,
      payment_details: paymentDetails
    });
    
    logger.info('Payment verified successfully', {
      transactionId,
      orderId: savedOrder._id,
      paymentId: razorpay_payment_id,
      amount: transaction.amount,
      userId: req.user._id
    });
    
    // Send success response
    res.json({
      success: true,
      order: savedOrder,
      transaction: {
        id: transaction._id,
        transactionId: transaction.transactionId,
        status: transaction.status,
        amount: transaction.amount,
        fees: transaction.fees
      },
      payment: {
        id: razorpay_payment_id,
        method: transaction.method,
        status: 'success'
      }
    });
    
  } catch (error) {
    // Update transaction with failure if it exists
    try {
      const transaction = await Transaction.findOne({ transactionId });
      if (transaction) {
        await transaction.addStatusUpdate('failed', error.message, {
          error_code: error.statusCode || 'VERIFICATION_FAILED',
          razorpay_order_id,
          razorpay_payment_id
        });
      }
    } catch (updateError) {
      logger.error('Failed to update transaction status', { 
        error: updateError.message,
        transactionId 
      });
    }
    
    logger.error('Payment verification failed', {
      error: error.message,
      stack: error.stack,
      transactionId,
      razorpay_order_id,
      razorpay_payment_id,
      userId: req.user._id
    });
    
    throw error;
  }
});

// Enhanced payment details with transaction context
export const getPaymentDetails = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;
  
  try {
    // Fetch from Razorpay
    const payment = await fetchPaymentDetailsWithRetry(paymentId);
    
    // Find associated transaction
    const transaction = await Transaction.findOne({ 
      gatewayPaymentId: paymentId 
    }).populate('orderId');
    
    if (!transaction) {
      throw new AppError('Transaction not found', 404);
    }
    
    // Verify user access
    if (transaction.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      throw new AppError('Access denied', 403);
    }
    
    logger.info('Payment details retrieved', {
      paymentId,
      transactionId: transaction.transactionId,
      userId: req.user._id
    });
    
    res.json({
      success: true,
      payment,
      transaction: {
        id: transaction._id,
        transactionId: transaction.transactionId,
        status: transaction.status,
        statusHistory: transaction.statusHistory,
        createdAt: transaction.createdAt,
        fees: transaction.fees
      }
    });
    
  } catch (error) {
    logger.error('Failed to fetch payment details', {
      error: error.message,
      paymentId,
      userId: req.user._id
    });
    
    throw new AppError('Failed to fetch payment details', 500);
  }
});

// Enhanced refund with transaction tracking
export const refundPayment = asyncHandler(async (req, res) => {
  const { paymentId, amount, reason, transactionId } = req.body;
  
  if (!paymentId && !transactionId) {
    throw new AppError('Payment ID or Transaction ID is required', 400);
  }
  
  try {
    // Find transaction
    const query = paymentId 
      ? { gatewayPaymentId: paymentId }
      : { transactionId };
    
    const transaction = await Transaction.findOne(query).populate('orderId');
    
    if (!transaction) {
      throw new AppError('Transaction not found', 404);
    }
    
    // Validate refund amount
    const refundAmount = amount || transaction.amount;
    if (refundAmount > transaction.amount) {
      throw new AppError('Refund amount cannot exceed transaction amount', 400);
    }
    
    // Create refund with Razorpay
    const razorpayInstance = getRazorpayInstance();
    const refund = await razorpayInstance.payments.refund(transaction.gatewayPaymentId, {
      amount: refundAmount * 100, // Convert to paise
      notes: {
        reason: reason || 'Customer requested refund',
        refunded_by: req.user._id.toString(),
        transaction_id: transaction.transactionId
      },
    });
    
    // Update transaction
    const refundStatus = refundAmount === transaction.amount ? 'refunded' : 'partially_refunded';
    transaction.refund = {
      refundId: refund.id,
      amount: refundAmount,
      reason: reason || 'Customer requested refund',
      initiatedBy: req.user._id,
      initiatedAt: new Date(),
      status: 'processing'
    };
    
    await transaction.addStatusUpdate(refundStatus, 'Refund initiated', {
      refund_id: refund.id,
      refund_amount: refundAmount,
      reason,
      initiated_by: req.user._id
    });
    
    // Update order status if needed
    if (transaction.orderId) {
      const order = await Order.findById(transaction.orderId);
      if (order && refundAmount === transaction.amount) {
        order.status = 'cancelled';
        await order.save();
      }
    }
    
    logger.info('Refund initiated successfully', {
      transactionId: transaction.transactionId,
      refundId: refund.id,
      amount: refundAmount,
      initiatedBy: req.user._id
    });
    
    res.json({
      success: true,
      refund,
      transaction: {
        id: transaction._id,
        transactionId: transaction.transactionId,
        status: transaction.status,
        refundDetails: transaction.refund
      }
    });
    
  } catch (error) {
    logger.error('Refund failed', {
      error: error.message,
      paymentId,
      transactionId,
      amount,
      userId: req.user._id
    });
    
    throw new AppError('Failed to process refund', 500);
  }
});

// New: Get transaction history
export const getTransactionHistory = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status, type, startDate, endDate } = req.query;
  
  // Build query
  const query = { userId: req.user._id };
  
  if (status) query.status = status;
  if (type) query.type = type;
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }
  
  try {
    const transactions = await Transaction.find(query)
      .populate('orderId', 'items total status')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Transaction.countDocuments(query);
    
    logger.info('Transaction history retrieved', {
      userId: req.user._id,
      count: transactions.length,
      page,
      limit
    });
    
    res.json({
      success: true,
      transactions,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
    
  } catch (error) {
    logger.error('Failed to fetch transaction history', {
      error: error.message,
      userId: req.user._id
    });
    
    throw new AppError('Failed to fetch transaction history', 500);
  }
});

// New: Payment analytics for admin
export const getPaymentAnalytics = asyncHandler(async (req, res) => {
  const { startDate, endDate, groupBy = 'day' } = req.query;
  
  try {
    const dateRange = {};
    if (startDate) dateRange.$gte = new Date(startDate);
    if (endDate) dateRange.$lte = new Date(endDate);
    
    const matchStage = dateRange.createdAt ? { createdAt: dateRange } : {};
    
    // Transaction statistics
    const stats = await Transaction.getTransactionStats(matchStage);
    
    // Failure analysis
    const failureAnalysis = await Transaction.getFailureAnalysis(matchStage);
    
    // Revenue trends
    const revenueTrends = await Transaction.aggregate([
      { $match: { ...matchStage, status: 'success' } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: groupBy === 'month' ? '%Y-%m' : '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          revenue: { $sum: '$amount' },
          fees: { $sum: '$fees.totalFee' },
          netRevenue: { $sum: '$netAmount' },
          transactionCount: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Payment method distribution
    const methodDistribution = await Transaction.aggregate([
      { $match: { ...matchStage, status: 'success' } },
      {
        $group: {
          _id: '$method',
          count: { $sum: 1 },
          revenue: { $sum: '$amount' }
        }
      }
    ]);
    
    logger.info('Payment analytics retrieved', {
      userId: req.user._id,
      dateRange: matchStage.createdAt,
      groupBy
    });
    
    res.json({
      success: true,
      analytics: {
        overview: stats,
        revenueTrends,
        methodDistribution,
        failureAnalysis
      }
    });
    
  } catch (error) {
    logger.error('Failed to fetch payment analytics', {
      error: error.message,
      userId: req.user._id
    });
    
    throw new AppError('Failed to fetch payment analytics', 500);
  }
});

// Helper functions
const createRazorpayOrderWithRetry = async (orderData, attempt = 1) => {
  try {
    const razorpayInstance = getRazorpayInstance();
    return await razorpayInstance.orders.create(orderData);
  } catch (error) {
    if (attempt < RETRY_CONFIG.maxAttempts && isRetryableError(error)) {
      const delayMs = calculateRetryDelay(attempt);
      logger.warn(`Razorpay order creation failed, retrying in ${delayMs}ms`, {
        attempt,
        error: error.message,
        receipt: orderData.receipt
      });
      
      await delay(delayMs);
      return createRazorpayOrderWithRetry(orderData, attempt + 1);
    }
    throw error;
  }
};

const fetchPaymentDetailsWithRetry = async (paymentId, attempt = 1) => {
  try {
    const razorpayInstance = getRazorpayInstance();
    return await razorpayInstance.payments.fetch(paymentId);
  } catch (error) {
    if (attempt < RETRY_CONFIG.maxAttempts && isRetryableError(error)) {
      const delayMs = calculateRetryDelay(attempt);
      await delay(delayMs);
      return fetchPaymentDetailsWithRetry(paymentId, attempt + 1);
    }
    throw error;
  }
};

const isRetryableError = (error) => {
  const retryableStatusCodes = [429, 500, 502, 503, 504];
  const retryableMessages = ['timeout', 'network', 'connection'];
  
  return retryableStatusCodes.includes(error.statusCode) ||
         retryableMessages.some(msg => error.message.toLowerCase().includes(msg));
};

const getPaymentMethod = (razorpayMethod) => {
  const methodMap = {
    'card': 'card',
    'netbanking': 'netbanking',
    'upi': 'upi',
    'wallet': 'wallet',
    'emi': 'emi'
  };
  return methodMap[razorpayMethod] || 'card';
};

const extractPaymentDetails = (paymentData) => {
  const details = {};
  
  if (paymentData.method === 'card') {
    details.cardLast4 = paymentData.card?.last4;
    details.cardNetwork = paymentData.card?.network;
    details.cardType = paymentData.card?.type;
    details.cardIssuer = paymentData.card?.issuer;
  }
  
  if (paymentData.method === 'netbanking') {
    details.bankName = paymentData.bank;
  }
  
  if (paymentData.method === 'upi') {
    details.upiId = paymentData.vpa;
  }
  
  if (paymentData.method === 'wallet') {
    details.walletName = paymentData.wallet;
  }
  
  details.authCode = paymentData.acquirer_data?.auth_code;
  details.rrn = paymentData.acquirer_data?.rrn;
  
  return details;
};

const calculateFees = (paymentData) => {
  const fee = paymentData.fee || 0;
  const tax = paymentData.tax || 0;
  
  return {
    gatewayFee: fee / 100, // Convert from paise
    serviceTax: tax / 100,
    totalFee: (fee + tax) / 100
  };
};
