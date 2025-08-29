import express from 'express';
import crypto from 'crypto';
import Transaction from '../models/Transaction.js';
import Order from '../models/Order.js';
import { AppError } from '../middleware/enhancedErrorHandler.js';
import { asyncHandler } from '../middleware/enhancedErrorHandler.js';
import logger from '../config/logger.js';

const router = express.Router();

// Webhook endpoint for Razorpay
router.post('/razorpay', asyncHandler(async (req, res) => {
  const webhookSignature = req.get('X-Razorpay-Signature');
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    logger.error('Razorpay webhook secret not configured');
    return res.status(500).json({ error: 'Webhook not configured' });
  }
  
  // Verify webhook signature
  const body = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(body)
    .digest('hex');
  
  if (webhookSignature !== expectedSignature) {
    logger.error('Invalid webhook signature', {
      provided: webhookSignature,
      expected: expectedSignature,
      event: req.body.event
    });
    return res.status(400).json({ error: 'Invalid signature' });
  }
  
  const { event, payload } = req.body;
  
  try {
    await processWebhookEvent(event, payload, req.ip);
    
    logger.info('Webhook processed successfully', {
      event,
      entityId: payload?.payment?.entity?.id || payload?.order?.entity?.id,
      ipAddress: req.ip
    });
    
    res.json({ status: 'success' });
    
  } catch (error) {
    logger.error('Webhook processing failed', {
      error: error.message,
      stack: error.stack,
      event,
      entityId: payload?.payment?.entity?.id || payload?.order?.entity?.id
    });
    
    // Return success to prevent webhook retries for non-critical errors
    res.json({ status: 'acknowledged', error: error.message });
  }
}));

// Process different webhook events
const processWebhookEvent = async (event, payload, ipAddress) => {
  const { entity } = payload.payment || payload.order || payload.refund || {};
  
  if (!entity) {
    throw new AppError('Invalid webhook payload', 400);
  }
  
  logger.info('Processing webhook event', {
    event,
    entityId: entity.id,
    status: entity.status,
    amount: entity.amount
  });
  
  switch (event) {
    case 'payment.authorized':
      await handlePaymentAuthorized(entity, ipAddress);
      break;
      
    case 'payment.captured':
      await handlePaymentCaptured(entity, ipAddress);
      break;
      
    case 'payment.failed':
      await handlePaymentFailed(entity, ipAddress);
      break;
      
    case 'order.paid':
      await handleOrderPaid(entity, ipAddress);
      break;
      
    case 'refund.created':
      await handleRefundCreated(entity, ipAddress);
      break;
      
    case 'refund.processed':
      await handleRefundProcessed(entity, ipAddress);
      break;
      
    case 'refund.failed':
      await handleRefundFailed(entity, ipAddress);
      break;
      
    case 'payment.dispute.created':
      await handleDisputeCreated(entity, ipAddress);
      break;
      
    case 'settlement.processed':
      await handleSettlementProcessed(entity, ipAddress);
      break;
      
    default:
      logger.warn('Unhandled webhook event', { event, entityId: entity.id });
      break;
  }
};

// Payment authorized handler
const handlePaymentAuthorized = async (payment, ipAddress) => {
  const transaction = await Transaction.findOne({
    gatewayPaymentId: payment.id
  });
  
  if (!transaction) {
    logger.warn('Transaction not found for authorized payment', {
      paymentId: payment.id
    });
    return;
  }
  
  await transaction.addStatusUpdate('authorized', 'Payment authorized by gateway', {
    webhook_event: 'payment.authorized',
    gateway_status: payment.status,
    webhook_ip: ipAddress,
    payment_method: payment.method,
    bank: payment.bank,
    wallet: payment.wallet
  });
  
  // Update payment method and details if not already set
  if (!transaction.method || transaction.method === 'card') {
    transaction.method = getPaymentMethod(payment.method);
    transaction.paymentDetails = {
      ...transaction.paymentDetails,
      ...extractPaymentDetails(payment)
    };
    await transaction.save();
  }
  
  logger.info('Payment authorized via webhook', {
    transactionId: transaction.transactionId,
    paymentId: payment.id,
    method: payment.method
  });
};

// Payment captured handler
const handlePaymentCaptured = async (payment, ipAddress) => {
  const transaction = await Transaction.findOne({
    gatewayPaymentId: payment.id
  });
  
  if (!transaction) {
    logger.warn('Transaction not found for captured payment', {
      paymentId: payment.id
    });
    return;
  }
  
  // Update transaction status
  await transaction.addStatusUpdate('captured', 'Payment captured by gateway', {
    webhook_event: 'payment.captured',
    gateway_status: payment.status,
    webhook_ip: ipAddress,
    captured_amount: payment.amount / 100,
    fee: payment.fee / 100,
    tax: payment.tax / 100
  });
  
  // Update fees if available
  if (payment.fee || payment.tax) {
    transaction.fees = {
      gatewayFee: (payment.fee || 0) / 100,
      serviceTax: (payment.tax || 0) / 100,
      totalFee: ((payment.fee || 0) + (payment.tax || 0)) / 100
    };
    transaction.netAmount = transaction.amount - transaction.fees.totalFee;
    await transaction.save();
  }
  
  logger.info('Payment captured via webhook', {
    transactionId: transaction.transactionId,
    paymentId: payment.id,
    amount: payment.amount / 100,
    fee: payment.fee / 100
  });
};

// Payment failed handler
const handlePaymentFailed = async (payment, ipAddress) => {
  const transaction = await Transaction.findOne({
    $or: [
      { gatewayPaymentId: payment.id },
      { gatewayOrderId: payment.order_id }
    ]
  });
  
  if (!transaction) {
    logger.warn('Transaction not found for failed payment', {
      paymentId: payment.id,
      orderId: payment.order_id
    });
    return;
  }
  
  // Extract failure details
  const failureReason = {
    code: payment.error_code,
    message: payment.error_description || 'Payment failed',
    category: categorizeFailureReason(payment.error_code)
  };
  
  transaction.failureReason = failureReason;
  
  await transaction.addStatusUpdate('failed', 'Payment failed at gateway', {
    webhook_event: 'payment.failed',
    gateway_status: payment.status,
    webhook_ip: ipAddress,
    error_code: payment.error_code,
    error_description: payment.error_description,
    failure_reason: payment.error_reason
  });
  
  // Update associated order status
  if (transaction.orderId) {
    const order = await Order.findById(transaction.orderId);
    if (order && order.status !== 'cancelled') {
      order.status = 'cancelled';
      order.notes = `Payment failed: ${payment.error_description}`;
      await order.save();
    }
  }
  
  logger.error('Payment failed via webhook', {
    transactionId: transaction.transactionId,
    paymentId: payment.id,
    errorCode: payment.error_code,
    errorDescription: payment.error_description
  });
};

// Order paid handler
const handleOrderPaid = async (order, ipAddress) => {
  const transaction = await Transaction.findOne({
    gatewayOrderId: order.id
  });
  
  if (!transaction) {
    logger.warn('Transaction not found for paid order', {
      orderId: order.id
    });
    return;
  }
  
  await transaction.addStatusUpdate('success', 'Order marked as paid', {
    webhook_event: 'order.paid',
    gateway_status: order.status,
    webhook_ip: ipAddress,
    amount_paid: order.amount_paid / 100
  });
  
  logger.info('Order paid via webhook', {
    transactionId: transaction.transactionId,
    orderId: order.id,
    amountPaid: order.amount_paid / 100
  });
};

// Refund created handler
const handleRefundCreated = async (refund, ipAddress) => {
  const transaction = await Transaction.findOne({
    gatewayPaymentId: refund.payment_id
  });
  
  if (!transaction) {
    logger.warn('Transaction not found for refund', {
      refundId: refund.id,
      paymentId: refund.payment_id
    });
    return;
  }
  
  // Update refund details
  if (!transaction.refund) {
    transaction.refund = {};
  }
  
  transaction.refund = {
    ...transaction.refund,
    refundId: refund.id,
    amount: refund.amount / 100,
    status: 'processing',
    initiatedAt: new Date(refund.created_at * 1000)
  };
  
  const refundStatus = refund.amount === (transaction.amount * 100) ? 'refunded' : 'partially_refunded';
  
  await transaction.addStatusUpdate(refundStatus, 'Refund created by gateway', {
    webhook_event: 'refund.created',
    refund_id: refund.id,
    refund_amount: refund.amount / 100,
    webhook_ip: ipAddress
  });
  
  await transaction.save();
  
  logger.info('Refund created via webhook', {
    transactionId: transaction.transactionId,
    refundId: refund.id,
    amount: refund.amount / 100
  });
};

// Refund processed handler
const handleRefundProcessed = async (refund, ipAddress) => {
  const transaction = await Transaction.findOne({
    'refund.refundId': refund.id
  });
  
  if (!transaction) {
    logger.warn('Transaction not found for processed refund', {
      refundId: refund.id
    });
    return;
  }
  
  // Update refund status
  transaction.refund.status = 'completed';
  transaction.refund.processedAt = new Date();
  transaction.refund.arn = refund.acquirer_data?.arn;
  
  await transaction.addStatusUpdate(transaction.status, 'Refund processed successfully', {
    webhook_event: 'refund.processed',
    refund_id: refund.id,
    arn: refund.acquirer_data?.arn,
    webhook_ip: ipAddress
  });
  
  await transaction.save();
  
  logger.info('Refund processed via webhook', {
    transactionId: transaction.transactionId,
    refundId: refund.id,
    arn: refund.acquirer_data?.arn
  });
};

// Refund failed handler
const handleRefundFailed = async (refund, ipAddress) => {
  const transaction = await Transaction.findOne({
    'refund.refundId': refund.id
  });
  
  if (!transaction) {
    logger.warn('Transaction not found for failed refund', {
      refundId: refund.id
    });
    return;
  }
  
  // Update refund status
  transaction.refund.status = 'failed';
  
  await transaction.addStatusUpdate(transaction.status, 'Refund failed', {
    webhook_event: 'refund.failed',
    refund_id: refund.id,
    error_code: refund.error_code,
    error_description: refund.error_description,
    webhook_ip: ipAddress
  });
  
  await transaction.save();
  
  logger.error('Refund failed via webhook', {
    transactionId: transaction.transactionId,
    refundId: refund.id,
    errorCode: refund.error_code,
    errorDescription: refund.error_description
  });
};

// Dispute created handler
const handleDisputeCreated = async (dispute, ipAddress) => {
  const transaction = await Transaction.findOne({
    gatewayPaymentId: dispute.payment_id
  });
  
  if (!transaction) {
    logger.warn('Transaction not found for dispute', {
      disputeId: dispute.id,
      paymentId: dispute.payment_id
    });
    return;
  }
  
  // Update dispute details
  transaction.dispute = {
    disputeId: dispute.id,
    reason: dispute.reason_code,
    amount: dispute.amount / 100,
    status: dispute.status,
    raisedAt: new Date(dispute.created_at * 1000),
    respondBy: new Date(dispute.respond_by * 1000)
  };
  
  await transaction.addStatusUpdate('disputed', 'Payment disputed', {
    webhook_event: 'payment.dispute.created',
    dispute_id: dispute.id,
    reason: dispute.reason_code,
    amount: dispute.amount / 100,
    webhook_ip: ipAddress
  });
  
  await transaction.save();
  
  logger.error('Payment dispute created via webhook', {
    transactionId: transaction.transactionId,
    disputeId: dispute.id,
    reason: dispute.reason_code,
    amount: dispute.amount / 100
  });
};

// Settlement processed handler
const handleSettlementProcessed = async (settlement, ipAddress) => {
  // Find all transactions in this settlement
  const transactions = await Transaction.find({
    gatewayPaymentId: { $in: settlement.entity_ids }
  });
  
  if (transactions.length === 0) {
    logger.warn('No transactions found for settlement', {
      settlementId: settlement.id
    });
    return;
  }
  
  // Update settlement details for each transaction
  for (const transaction of transactions) {
    transaction.settlement = {
      batchId: settlement.id,
      settledAmount: transaction.netAmount,
      settledAt: new Date(settlement.created_at * 1000),
      settlementUtr: settlement.utr
    };
    
    await transaction.addStatusUpdate(transaction.status, 'Payment settled', {
      webhook_event: 'settlement.processed',
      settlement_id: settlement.id,
      utr: settlement.utr,
      webhook_ip: ipAddress
    });
    
    await transaction.save();
  }
  
  logger.info('Settlement processed via webhook', {
    settlementId: settlement.id,
    transactionCount: transactions.length,
    utr: settlement.utr
  });
};

// Helper functions
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

const extractPaymentDetails = (payment) => {
  const details = {};
  
  if (payment.method === 'card' && payment.card) {
    details.cardLast4 = payment.card.last4;
    details.cardNetwork = payment.card.network;
    details.cardType = payment.card.type;
    details.cardIssuer = payment.card.issuer;
  }
  
  if (payment.method === 'netbanking') {
    details.bankName = payment.bank;
  }
  
  if (payment.method === 'upi') {
    details.upiId = payment.vpa;
  }
  
  if (payment.method === 'wallet') {
    details.walletName = payment.wallet;
  }
  
  if (payment.acquirer_data) {
    details.authCode = payment.acquirer_data.auth_code;
    details.rrn = payment.acquirer_data.rrn;
  }
  
  return details;
};

const categorizeFailureReason = (errorCode) => {
  const technicalErrors = ['GATEWAY_ERROR', 'BAD_REQUEST_ERROR', 'SERVER_ERROR'];
  const businessErrors = ['PAYMENT_CAPTURE_FAILED', 'PAYMENT_ALREADY_REFUNDED'];
  const userErrors = ['INVALID_CARD_NUMBER', 'CARD_EXPIRED', 'INSUFFICIENT_FUNDS'];
  
  if (technicalErrors.includes(errorCode)) return 'technical';
  if (businessErrors.includes(errorCode)) return 'business';
  if (userErrors.includes(errorCode)) return 'user_error';
  
  return 'unknown';
};

export default router;
