import cron from 'node-cron';
import Transaction from '../models/Transaction.js';
import Order from '../models/Order.js';
import logger from '../config/logger.js';
import Razorpay from 'razorpay';

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Payment monitoring and retry service
class PaymentMonitoringService {
  constructor() {
    this.isRunning = false;
    this.retryQueue = new Map();
    this.maxRetryAttempts = 5;
    this.retryDelays = [30, 60, 300, 900, 1800]; // seconds: 30s, 1m, 5m, 15m, 30m
  }

  // Start all monitoring services
  start() {
    if (this.isRunning) {
      logger.warn('Payment monitoring service already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting payment monitoring service');

    // Schedule periodic tasks
    this.scheduleTransactionReconciliation();
    this.scheduleFailedPaymentRetry();
    this.scheduleStaleTransactionCleanup();
    this.schedulePaymentAnalytics();
    this.processRetryQueue();

    logger.info('Payment monitoring service started successfully');
  }

  // Stop all monitoring services
  stop() {
    this.isRunning = false;
    this.retryQueue.clear();
    logger.info('Payment monitoring service stopped');
  }

  // Schedule transaction reconciliation every 30 minutes
  scheduleTransactionReconciliation() {
    cron.schedule('*/30 * * * *', async () => {
      if (!this.isRunning) return;
      
      try {
        await this.reconcileTransactions();
      } catch (error) {
        logger.error('Transaction reconciliation failed', {
          error: error.message,
          stack: error.stack
        });
      }
    });
  }

  // Schedule failed payment retry every 5 minutes
  scheduleFailedPaymentRetry() {
    cron.schedule('*/5 * * * *', async () => {
      if (!this.isRunning) return;
      
      try {
        await this.retryFailedPayments();
      } catch (error) {
        logger.error('Failed payment retry failed', {
          error: error.message,
          stack: error.stack
        });
      }
    });
  }

  // Schedule stale transaction cleanup daily at 2 AM
  scheduleStaleTransactionCleanup() {
    cron.schedule('0 2 * * *', async () => {
      if (!this.isRunning) return;
      
      try {
        await this.cleanupStaleTransactions();
      } catch (error) {
        logger.error('Stale transaction cleanup failed', {
          error: error.message,
          stack: error.stack
        });
      }
    });
  }

  // Schedule payment analytics generation daily at 3 AM
  schedulePaymentAnalytics() {
    cron.schedule('0 3 * * *', async () => {
      if (!this.isRunning) return;
      
      try {
        await this.generateDailyAnalytics();
      } catch (error) {
        logger.error('Payment analytics generation failed', {
          error: error.message,
          stack: error.stack
        });
      }
    });
  }

  // Reconcile transactions with payment gateway
  async reconcileTransactions() {
    logger.info('Starting transaction reconciliation');
    
    const startTime = new Date();
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    
    try {
      // Find transactions that might need reconciliation
      const pendingTransactions = await Transaction.find({
        status: { $in: ['initiated', 'pending', 'processing', 'authorized'] },
        createdAt: { $gte: cutoffTime },
        retryCount: { $lt: this.maxRetryAttempts }
      }).limit(100);

      let reconciledCount = 0;
      let errorCount = 0;

      for (const transaction of pendingTransactions) {
        try {
          await this.reconcileTransaction(transaction);
          reconciledCount++;
        } catch (error) {
          errorCount++;
          logger.error('Transaction reconciliation failed', {
            transactionId: transaction.transactionId,
            error: error.message
          });
        }
        
        // Add small delay to avoid rate limiting
        await this.delay(100);
      }

      const duration = new Date() - startTime;
      logger.info('Transaction reconciliation completed', {
        processed: pendingTransactions.length,
        reconciled: reconciledCount,
        errors: errorCount,
        duration: `${duration}ms`
      });

    } catch (error) {
      logger.error('Transaction reconciliation batch failed', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  // Reconcile individual transaction
  async reconcileTransaction(transaction) {
    try {
      // Fetch payment details from Razorpay
      const paymentDetails = await razorpay.payments.fetch(transaction.gatewayPaymentId);
      
      // Check if status has changed
      const newStatus = this.mapRazorpayStatus(paymentDetails.status);
      
      if (newStatus !== transaction.status) {
        await transaction.addStatusUpdate(newStatus, 'Status updated via reconciliation', {
          reconciliation: true,
          gateway_status: paymentDetails.status,
          gateway_updated_at: paymentDetails.updated_at
        });

        // Update payment details if needed
        if (paymentDetails.method) {
          transaction.method = this.getPaymentMethod(paymentDetails.method);
          transaction.paymentDetails = this.extractPaymentDetails(paymentDetails);
        }

        // Update fees if available
        if (paymentDetails.fee || paymentDetails.tax) {
          transaction.fees = {
            gatewayFee: (paymentDetails.fee || 0) / 100,
            serviceTax: (paymentDetails.tax || 0) / 100,
            totalFee: ((paymentDetails.fee || 0) + (paymentDetails.tax || 0)) / 100
          };
          transaction.netAmount = transaction.amount - transaction.fees.totalFee;
        }

        await transaction.save();

        // Update associated order if payment succeeded
        if (newStatus === 'success' && transaction.orderId) {
          const order = await Order.findById(transaction.orderId);
          if (order && !order.isPaid) {
            order.isPaid = true;
            order.paidAt = new Date();
            order.status = 'confirmed';
            await order.save();
          }
        }

        logger.info('Transaction reconciled', {
          transactionId: transaction.transactionId,
          oldStatus: transaction.previousStatus,
          newStatus: newStatus,
          gatewayStatus: paymentDetails.status
        });
      }

    } catch (error) {
      if (error.statusCode === 404) {
        // Payment not found, mark as failed
        await transaction.addStatusUpdate('failed', 'Payment not found in gateway', {
          reconciliation: true,
          error: 'PAYMENT_NOT_FOUND'
        });
      } else {
        throw error;
      }
    }
  }

  // Retry failed payments that are retryable
  async retryFailedPayments() {
    logger.debug('Checking for failed payments to retry');
    
    try {
      // Find failed transactions that can be retried
      const retryableTransactions = await Transaction.find({
        status: 'failed',
        retryCount: { $lt: this.maxRetryAttempts },
        'failureReason.category': { $in: ['technical', 'network'] },
        createdAt: { $gte: new Date(Date.now() - 6 * 60 * 60 * 1000) } // Last 6 hours
      }).limit(50);

      for (const transaction of retryableTransactions) {
        const timeSinceLastRetry = Date.now() - (transaction.updatedAt?.getTime() || transaction.createdAt.getTime());
        const requiredDelay = this.retryDelays[transaction.retryCount] * 1000;

        if (timeSinceLastRetry >= requiredDelay) {
          this.addToRetryQueue(transaction);
        }
      }

    } catch (error) {
      logger.error('Failed payment retry check failed', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  // Add transaction to retry queue
  addToRetryQueue(transaction) {
    const retryKey = `${transaction.transactionId}_${transaction.retryCount}`;
    
    if (!this.retryQueue.has(retryKey)) {
      this.retryQueue.set(retryKey, {
        transaction,
        addedAt: Date.now(),
        attempts: 0
      });

      logger.info('Transaction added to retry queue', {
        transactionId: transaction.transactionId,
        retryCount: transaction.retryCount,
        queueSize: this.retryQueue.size
      });
    }
  }

  // Process retry queue
  processRetryQueue() {
    setInterval(async () => {
      if (!this.isRunning || this.retryQueue.size === 0) return;

      const entries = Array.from(this.retryQueue.entries());
      
      for (const [key, retryItem] of entries) {
        try {
          await this.processRetryItem(key, retryItem);
        } catch (error) {
          logger.error('Retry queue processing failed', {
            key,
            error: error.message
          });
        }
      }
    }, 30000); // Process every 30 seconds
  }

  // Process individual retry item
  async processRetryItem(key, retryItem) {
    const { transaction } = retryItem;
    
    try {
      // Attempt to fetch fresh payment status
      await this.reconcileTransaction(transaction);
      
      // Remove from queue if successful or max attempts reached
      this.retryQueue.delete(key);
      
      logger.info('Retry item processed successfully', {
        transactionId: transaction.transactionId,
        key
      });

    } catch (error) {
      retryItem.attempts++;
      
      if (retryItem.attempts >= 3) {
        // Remove from queue after max attempts
        this.retryQueue.delete(key);
        
        await transaction.addRetryAttempt('failed', 'MAX_RETRY_ATTEMPTS', error.message);
        
        logger.warn('Retry item removed after max attempts', {
          transactionId: transaction.transactionId,
          attempts: retryItem.attempts,
          error: error.message
        });
      }
    }
  }

  // Clean up stale transactions
  async cleanupStaleTransactions() {
    logger.info('Starting stale transaction cleanup');
    
    try {
      const staleDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
      
      // Find stale pending transactions
      const staleTransactions = await Transaction.find({
        status: { $in: ['initiated', 'pending'] },
        createdAt: { $lt: staleDate }
      });

      let cleanedCount = 0;

      for (const transaction of staleTransactions) {
        try {
          await transaction.addStatusUpdate('expired', 'Transaction expired due to inactivity', {
            cleanup: true,
            stale_duration: Date.now() - transaction.createdAt.getTime()
          });

          // Cancel associated order if exists
          if (transaction.orderId) {
            const order = await Order.findById(transaction.orderId);
            if (order && order.status === 'pending') {
              order.status = 'cancelled';
              order.notes = 'Order cancelled due to payment timeout';
              await order.save();
            }
          }

          cleanedCount++;
        } catch (error) {
          logger.error('Failed to cleanup stale transaction', {
            transactionId: transaction.transactionId,
            error: error.message
          });
        }
      }

      logger.info('Stale transaction cleanup completed', {
        found: staleTransactions.length,
        cleaned: cleanedCount
      });

    } catch (error) {
      logger.error('Stale transaction cleanup failed', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  // Generate daily analytics
  async generateDailyAnalytics() {
    logger.info('Generating daily payment analytics');
    
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      
      const today = new Date(yesterday);
      today.setDate(today.getDate() + 1);

      const analytics = await Transaction.aggregate([
        {
          $match: {
            createdAt: { $gte: yesterday, $lt: today }
          }
        },
        {
          $group: {
            _id: null,
            totalTransactions: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            successfulTransactions: {
              $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
            },
            successfulAmount: {
              $sum: { $cond: [{ $eq: ['$status', 'success'] }, '$amount', 0] }
            },
            failedTransactions: {
              $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
            },
            avgTransactionAmount: { $avg: '$amount' },
            totalFees: { $sum: '$fees.totalFee' }
          }
        }
      ]);

      if (analytics.length > 0) {
        const stats = analytics[0];
        stats.successRate = stats.totalTransactions > 0 
          ? (stats.successfulTransactions / stats.totalTransactions * 100).toFixed(2)
          : 0;
        
        logger.info('Daily payment analytics generated', {
          date: yesterday.toISOString().split('T')[0],
          ...stats
        });
      }

    } catch (error) {
      logger.error('Daily analytics generation failed', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  // Helper methods
  mapRazorpayStatus(razorpayStatus) {
    const statusMap = {
      'created': 'initiated',
      'authorized': 'authorized',
      'captured': 'success',
      'refunded': 'refunded',
      'failed': 'failed'
    };
    return statusMap[razorpayStatus] || 'pending';
  }

  getPaymentMethod(razorpayMethod) {
    const methodMap = {
      'card': 'card',
      'netbanking': 'netbanking',
      'upi': 'upi',
      'wallet': 'wallet',
      'emi': 'emi'
    };
    return methodMap[razorpayMethod] || 'card';
  }

  extractPaymentDetails(payment) {
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
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Create and export singleton instance
const paymentMonitoringService = new PaymentMonitoringService();

export default paymentMonitoringService;
