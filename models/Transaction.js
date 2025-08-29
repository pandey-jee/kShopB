import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  // Transaction identifiers
  transactionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Payment gateway details
  gateway: {
    type: String,
    required: true,
    enum: ['razorpay', 'payu', 'stripe', 'paypal'],
    default: 'razorpay'
  },
  gatewayTransactionId: {
    type: String,
    required: true,
    index: true
  },
  gatewayOrderId: {
    type: String,
    index: true
  },
  gatewayPaymentId: {
    type: String,
    index: true
  },

  // Transaction details
  amount: {
    type: Number,
    required: true,
    min: [0, 'Amount must be positive']
  },
  currency: {
    type: String,
    required: true,
    default: 'INR'
  },
  type: {
    type: String,
    required: true,
    enum: ['payment', 'refund', 'partial_refund', 'chargeback', 'fee'],
    index: true
  },
  method: {
    type: String,
    required: true,
    enum: ['card', 'netbanking', 'upi', 'wallet', 'emi', 'cod']
  },

  // Transaction status and lifecycle
  status: {
    type: String,
    required: true,
    enum: [
      'initiated', 'pending', 'processing', 'authorized', 
      'captured', 'success', 'failed', 'cancelled', 
      'expired', 'disputed', 'refunded', 'partially_refunded'
    ],
    default: 'initiated',
    index: true
  },
  previousStatus: {
    type: String,
    enum: [
      'initiated', 'pending', 'processing', 'authorized', 
      'captured', 'success', 'failed', 'cancelled', 
      'expired', 'disputed', 'refunded', 'partially_refunded'
    ]
  },
  statusHistory: [{
    status: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    reason: String,
    metadata: mongoose.Schema.Types.Mixed
  }],

  // Payment method details
  paymentDetails: {
    // Card details (masked)
    cardLast4: String,
    cardNetwork: String, // visa, mastercard, rupay, etc.
    cardType: String,    // credit, debit
    cardIssuer: String,
    
    // Bank details
    bankName: String,
    bankCode: String,
    
    // UPI details
    upiId: String,
    upiApp: String,
    
    // Wallet details
    walletName: String,
    
    // EMI details
    emiTenure: Number,
    emiInterestRate: Number,
    
    // Additional metadata
    authCode: String,
    rrn: String // Retrieval Reference Number
  },

  // Timing information
  initiatedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  authorizedAt: Date,
  capturedAt: Date,
  settledAt: Date,
  failedAt: Date,
  refundedAt: Date,

  // Retry and failure handling
  retryCount: {
    type: Number,
    default: 0,
    max: [5, 'Maximum 5 retry attempts allowed']
  },
  retryHistory: [{
    attempt: Number,
    timestamp: Date,
    status: String,
    errorCode: String,
    errorMessage: String
  }],
  failureReason: {
    code: String,
    message: String,
    category: String // technical, business, user_error, etc.
  },

  // Financial details
  fees: {
    gatewayFee: {
      type: Number,
      default: 0
    },
    serviceTax: {
      type: Number,
      default: 0
    },
    totalFee: {
      type: Number,
      default: 0
    }
  },
  netAmount: {
    type: Number,
    required: true
  },

  // Risk and fraud
  riskScore: {
    type: Number,
    min: 0,
    max: 100
  },
  fraudChecks: {
    avsCheck: String,     // Address Verification Service
    cvvCheck: String,     // Card Verification Value
    velocityCheck: String, // Transaction velocity
    deviceCheck: String,  // Device fingerprinting
    ipCheck: String       // IP geolocation
  },
  isHighRisk: {
    type: Boolean,
    default: false
  },

  // Customer and device information
  customerInfo: {
    email: String,
    phone: String,
    ipAddress: String,
    userAgent: String,
    deviceFingerprint: String
  },

  // Webhook and notification tracking
  webhookStatus: {
    type: String,
    enum: ['pending', 'delivered', 'failed', 'not_applicable'],
    default: 'pending'
  },
  webhookAttempts: [{
    timestamp: Date,
    status: String,
    responseCode: Number,
    responseBody: String,
    attempt: Number
  }],
  notificationsSent: [{
    type: String, // email, sms, push
    timestamp: Date,
    status: String,
    recipient: String
  }],

  // Settlement information
  settlement: {
    batchId: String,
    settledAmount: Number,
    settledAt: Date,
    settlementUtr: String, // Unique Transaction Reference
    bankAccount: String
  },

  // Dispute and chargeback
  dispute: {
    disputeId: String,
    reason: String,
    amount: Number,
    evidence: [String], // Document URLs
    status: String,
    raisedAt: Date,
    respondBy: Date,
    resolvedAt: Date
  },

  // Refund details
  refund: {
    refundId: String,
    amount: Number,
    reason: String,
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    initiatedAt: Date,
    processedAt: Date,
    arn: String, // Acquirer Reference Number
    status: String
  },

  // Metadata and additional information
  metadata: {
    source: String,        // web, mobile_app, api
    campaign: String,      // Marketing campaign
    channel: String,       // organic, paid, referral
    sessionId: String,
    correlationId: String,
    additionalData: mongoose.Schema.Types.Mixed
  },

  // Notes and internal tracking
  internalNotes: [{
    note: String,
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    addedAt: {
      type: Date,
      default: Date.now
    },
    category: String // investigation, customer_service, etc.
  }],

  // Compliance and audit
  complianceChecks: {
    kycStatus: String,
    amlStatus: String,
    sanctionScreening: String,
    lastCheckedAt: Date
  },
  auditTrail: [{
    action: String,
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    changes: mongoose.Schema.Types.Mixed,
    ipAddress: String
  }]
}, {
  timestamps: true,
  indexes: [
    { transactionId: 1 },
    { orderId: 1 },
    { userId: 1 },
    { status: 1, createdAt: -1 },
    { gateway: 1, gatewayTransactionId: 1 },
    { type: 1, status: 1 },
    { initiatedAt: -1 },
    { "settlement.settledAt": -1 },
    { "customerInfo.email": 1 },
    { "customerInfo.phone": 1 }
  ]
});

// Pre-save middleware for status tracking
transactionSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status !== this.previousStatus) {
    // Add to status history
    this.statusHistory.push({
      status: this.status,
      timestamp: new Date(),
      reason: 'Status changed',
      metadata: { previousStatus: this.previousStatus }
    });
    
    // Update timing fields based on status
    const now = new Date();
    switch (this.status) {
      case 'authorized':
        this.authorizedAt = now;
        break;
      case 'captured':
      case 'success':
        this.capturedAt = now;
        break;
      case 'failed':
        this.failedAt = now;
        break;
      case 'refunded':
      case 'partially_refunded':
        this.refundedAt = now;
        break;
    }
    
    // Store previous status
    this.previousStatus = this.original?.status || this.status;
  }
  
  // Calculate net amount
  if (this.amount && this.fees) {
    this.netAmount = this.amount - (this.fees.totalFee || 0);
  }
  
  next();
});

// Instance methods
transactionSchema.methods.addStatusUpdate = function(status, reason, metadata = {}) {
  this.previousStatus = this.status;
  this.status = status;
  this.statusHistory.push({
    status,
    timestamp: new Date(),
    reason,
    metadata
  });
  return this.save();
};

transactionSchema.methods.addRetryAttempt = function(status, errorCode, errorMessage) {
  this.retryCount += 1;
  this.retryHistory.push({
    attempt: this.retryCount,
    timestamp: new Date(),
    status,
    errorCode,
    errorMessage
  });
  return this.save();
};

transactionSchema.methods.markAsHighRisk = function(reason) {
  this.isHighRisk = true;
  this.internalNotes.push({
    note: `Marked as high risk: ${reason}`,
    category: 'risk_assessment',
    addedAt: new Date()
  });
  return this.save();
};

// Static methods
transactionSchema.statics.getTransactionStats = function(filters = {}) {
  const pipeline = [
    { $match: filters },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        avgAmount: { $avg: '$amount' }
      }
    }
  ];
  return this.aggregate(pipeline);
};

transactionSchema.statics.getFailureAnalysis = function(dateRange = {}) {
  const pipeline = [
    {
      $match: {
        status: 'failed',
        ...dateRange
      }
    },
    {
      $group: {
        _id: '$failureReason.category',
        count: { $sum: 1 },
        reasons: { $push: '$failureReason.message' }
      }
    },
    { $sort: { count: -1 } }
  ];
  return this.aggregate(pipeline);
};

export default mongoose.model('Transaction', transactionSchema);
