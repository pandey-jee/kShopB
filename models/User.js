import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot be more than 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please enter a valid email'
    ]
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  phone: {
    type: String,
    trim: true
  },
  dateOfBirth: {
    type: Date
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other']
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: {
      type: String,
      default: 'India'
    }
  },
  addresses: [{
    type: {
      type: String,
      enum: ['home', 'office', 'other'],
      default: 'home'
    },
    name: String,
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: {
      type: String,
      default: 'India'
    },
    phone: String,
    isDefault: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  preferences: {
    newsletter: {
      type: Boolean,
      default: true
    },
    smsNotifications: {
      type: Boolean,
      default: true
    },
    orderUpdates: {
      type: Boolean,
      default: true
    },
    priceAlerts: {
      type: Boolean,
      default: true
    },
    stockAlerts: {
      type: Boolean,
      default: true
    },
    promotionalEmails: {
      type: Boolean,
      default: true
    },
    categories: [String],
    brands: [String],
    language: {
      type: String,
      default: 'en'
    },
    currency: {
      type: String,
      default: 'INR'
    }
  },
  
  notifications: [{
    id: String,
    type: {
      type: String,
      enum: ['order', 'payment', 'promotion', 'system', 'stock', 'price_drop', 'cart', 'offer', 'coupon'],
      required: true
    },
    title: {
      type: String,
      required: true
    },
    message: {
      type: String,
      required: true
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    read: {
      type: Boolean,
      default: false
    },
    action: {
      type: String,
      url: String
    },
    data: mongoose.Schema.Types.Mixed,
    timestamp: {
      type: Date,
      default: Date.now
    },
    expiresAt: Date
  }],
  
  settings: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'light'
    },
    autoLogin: {
      type: Boolean,
      default: false
    },
    twoFactorAuth: {
      type: Boolean,
      default: false
    },
    twoFactorSecret: String,
    privacy: {
      showProfile: {
        type: Boolean,
        default: true
      },
      showActivity: {
        type: Boolean,
        default: false
      },
      allowMarketing: {
        type: Boolean,
        default: true
      }
    }
  },
  
  status: {
    isOnline: {
      type: Boolean,
      default: false
    },
    lastSeen: {
      type: Date,
      default: Date.now
    },
    lastLoginAt: Date,
    loginCount: {
      type: Number,
      default: 0
    }
  },
  
  wishlist: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    addedAt: {
      type: Date,
      default: Date.now
    },
    notifyOnDiscount: {
      type: Boolean,
      default: true
    },
    notifyOnStock: {
      type: Boolean,
      default: true
    }
  }],
  
  searchHistory: [{
    query: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    resultCount: Number,
    filters: mongoose.Schema.Types.Mixed
  }],
  
  avatar: {
    type: String,
    default: ''
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  verificationToken: String,
  verificationTokenExpire: Date,
  
  // GDPR compliance
  gdprConsent: {
    marketing: {
      type: Boolean,
      default: false
    },
    analytics: {
      type: Boolean,
      default: false
    },
    functional: {
      type: Boolean,
      default: true
    },
    consentDate: Date
  },
  
  // Account security
  failedLoginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,
  
  // Referral system
  referralCode: String,
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  referralCount: {
    type: Number,
    default: 0
  },
  
  // Analytics data
  totalSpent: {
    type: Number,
    default: 0
  },
  orderCount: {
    type: Number,
    default: 0
  },
  lastOrderDate: Date,
  averageOrderValue: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
userSchema.index({ email: 1 });
userSchema.index({ 'status.isOnline': 1 });
userSchema.index({ 'status.lastSeen': -1 });
userSchema.index({ isActive: 1 });
userSchema.index({ role: 1 });
userSchema.index({ referralCode: 1 });
userSchema.index({ 'notifications.read': 1 });
userSchema.index({ 'notifications.timestamp': -1 });

// Virtual for account locked status
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Virtual for unread notification count
userSchema.virtual('unreadNotificationCount').get(function() {
  return this.notifications ? this.notifications.filter(n => !n.read).length : 0;
});

// Virtual for membership duration
userSchema.virtual('membershipDuration').get(function() {
  return Math.floor((Date.now() - this.createdAt.getTime()) / (1000 * 60 * 60 * 24));
});

// Pre-save middleware
userSchema.pre('save', async function(next) {
  // Hash password if modified
  if (!this.isModified('password')) {
    // Update login tracking
    if (this.isModified('status.lastLoginAt')) {
      this.loginCount = (this.loginCount || 0) + 1;
    }
    
    // Generate referral code if new user
    if (this.isNew && !this.referralCode) {
      this.referralCode = this.generateReferralCode();
    }
    
    return next();
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Instance methods
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.incLoginAttempts = function() {
  // Reset failed attempts if lock has expired
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { failedLoginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { failedLoginAttempts: 1 } };
  
  // Lock account after 5 failed attempts for 2 hours
  if (this.failedLoginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 };
  }
  
  return this.updateOne(updates);
};

userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { failedLoginAttempts: 1, lockUntil: 1 }
  });
};

userSchema.methods.addNotification = function(notification) {
  if (!this.notifications) {
    this.notifications = [];
  }
  
  this.notifications.unshift({
    id: notification.id || `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    ...notification,
    timestamp: new Date()
  });
  
  // Keep only last 100 notifications
  if (this.notifications.length > 100) {
    this.notifications = this.notifications.slice(0, 100);
  }
  
  return this.save();
};

userSchema.methods.markNotificationAsRead = function(notificationId) {
  const notification = this.notifications.id(notificationId);
  if (notification) {
    notification.read = true;
    return this.save();
  }
  return Promise.resolve(this);
};

userSchema.methods.addToWishlist = function(productId, options = {}) {
  const existingIndex = this.wishlist.findIndex(
    item => item.product.toString() === productId.toString()
  );
  
  if (existingIndex === -1) {
    this.wishlist.push({
      product: productId,
      addedAt: new Date(),
      ...options
    });
    return this.save();
  }
  
  return Promise.resolve(this);
};

userSchema.methods.removeFromWishlist = function(productId) {
  this.wishlist = this.wishlist.filter(
    item => item.product.toString() !== productId.toString()
  );
  return this.save();
};

userSchema.methods.addSearchQuery = function(query, resultCount = 0, filters = {}) {
  if (!this.searchHistory) {
    this.searchHistory = [];
  }
  
  this.searchHistory.unshift({
    query,
    resultCount,
    filters,
    timestamp: new Date()
  });
  
  // Keep only last 50 search queries
  if (this.searchHistory.length > 50) {
    this.searchHistory = this.searchHistory.slice(0, 50);
  }
  
  return this.save();
};

userSchema.methods.updateOrderStats = function(orderAmount) {
  this.orderCount = (this.orderCount || 0) + 1;
  this.totalSpent = (this.totalSpent || 0) + orderAmount;
  this.averageOrderValue = this.totalSpent / this.orderCount;
  this.lastOrderDate = new Date();
  return this.save();
};

userSchema.methods.generateReferralCode = function() {
  const prefix = this.name.substring(0, 3).toUpperCase();
  const suffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}${suffix}`;
};

userSchema.methods.getDefaultAddress = function() {
  return this.addresses.find(addr => addr.isDefault) || this.addresses[0];
};

userSchema.methods.setDefaultAddress = function(addressId) {
  // Remove default from all addresses
  this.addresses.forEach(addr => {
    addr.isDefault = false;
  });
  
  // Set new default
  const address = this.addresses.id(addressId);
  if (address) {
    address.isDefault = true;
  }
  
  return this.save();
};

// Static methods
userSchema.statics.findActiveUsers = function() {
  return this.find({ isActive: true });
};

userSchema.statics.findOnlineUsers = function() {
  return this.find({ 'status.isOnline': true });
};

userSchema.statics.findByReferralCode = function(code) {
  return this.findOne({ referralCode: code });
};

userSchema.statics.getUserAnalytics = function(startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        activeUsers: {
          $sum: { $cond: ['$isActive', 1, 0] }
        },
        verifiedUsers: {
          $sum: { $cond: ['$isVerified', 1, 0] }
        },
        averageOrderValue: { $avg: '$averageOrderValue' },
        totalSpent: { $sum: '$totalSpent' },
        totalOrders: { $sum: '$orderCount' }
      }
    }
  ]);
};

export default mongoose.model('User', userSchema);
