import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  options: {
    size: String,
    color: String,
    variant: String,
    customization: String
  },
  addedAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

const savedItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  options: {
    size: String,
    color: String,
    variant: String,
    customization: String
  },
  savedAt: {
    type: Date,
    default: Date.now
  },
  originalAddedAt: {
    type: Date
  }
});

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    uppercase: true
  },
  discount: {
    type: Number,
    required: true,
    min: 0
  },
  type: {
    type: String,
    enum: ['percentage', 'fixed'],
    required: true
  },
  appliedAt: {
    type: Date,
    default: Date.now
  }
});

const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  items: [cartItemSchema],
  savedItems: [savedItemSchema],
  
  // Pricing details
  subtotal: {
    type: Number,
    default: 0,
    min: 0
  },
  discountAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  taxAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  shippingAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  finalTotal: {
    type: Number,
    default: 0,
    min: 0
  },
  total: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Additional details
  itemCount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Coupon information
  coupon: couponSchema,
  
  // Metadata
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  // Cart session tracking
  sessionId: String,
  ipAddress: String,
  userAgent: String,
  
  // Abandonment tracking
  lastActivity: {
    type: Date,
    default: Date.now
  },
  isAbandoned: {
    type: Boolean,
    default: false
  },
  abandonedAt: Date,
  
  // Conversion tracking
  isConverted: {
    type: Boolean,
    default: false
  },
  convertedAt: Date,
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
cartSchema.index({ user: 1 });
cartSchema.index({ 'items.product': 1 });
cartSchema.index({ updatedAt: -1 });
cartSchema.index({ isAbandoned: 1, abandonedAt: -1 });
cartSchema.index({ lastActivity: -1 });

// Virtual for total savings
cartSchema.virtual('totalSavings').get(function() {
  return this.items.reduce((total, item) => {
    if (item.product && item.product.originalPrice) {
      return total + ((item.product.originalPrice - item.product.price) * item.quantity);
    }
    return total;
  }, 0);
});

// Virtual for estimated delivery date
cartSchema.virtual('estimatedDelivery').get(function() {
  const date = new Date();
  date.setDate(date.getDate() + 3); // Default 3 days
  return date.toISOString().split('T')[0];
});

// Pre-save middleware to update timestamps and calculate totals
cartSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  this.lastActivity = new Date();
  
  // Update item count
  this.itemCount = this.items.reduce((total, item) => total + item.quantity, 0);
  
  // Mark as abandoned if no activity for 24 hours (would be handled by background job)
  const twentyFourHoursAgo = new Date();
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
  
  if (this.lastActivity < twentyFourHoursAgo && this.items.length > 0 && !this.isConverted) {
    this.isAbandoned = true;
    this.abandonedAt = this.abandonedAt || new Date();
  }
  
  next();
});

// Instance methods
cartSchema.methods.markAsConverted = function(orderId) {
  this.isConverted = true;
  this.convertedAt = new Date();
  this.orderId = orderId;
  this.isAbandoned = false;
  return this.save();
};

cartSchema.methods.addItem = function(productId, quantity, price, options = {}) {
  const existingItemIndex = this.items.findIndex(
    item => item.product.toString() === productId.toString()
  );
  
  if (existingItemIndex > -1) {
    this.items[existingItemIndex].quantity += quantity;
    this.items[existingItemIndex].price = price;
    this.items[existingItemIndex].updatedAt = new Date();
  } else {
    this.items.push({
      product: productId,
      quantity,
      price,
      options,
      addedAt: new Date()
    });
  }
  
  return this;
};

cartSchema.methods.removeItem = function(productId) {
  this.items = this.items.filter(
    item => item.product.toString() !== productId.toString()
  );
  return this;
};

cartSchema.methods.updateItemQuantity = function(productId, quantity) {
  const item = this.items.find(
    item => item.product.toString() === productId.toString()
  );
  
  if (item) {
    if (quantity <= 0) {
      return this.removeItem(productId);
    }
    item.quantity = quantity;
    item.updatedAt = new Date();
  }
  
  return this;
};

cartSchema.methods.clearItems = function() {
  this.items = [];
  this.subtotal = 0;
  this.total = 0;
  this.finalTotal = 0;
  this.itemCount = 0;
  this.discountAmount = 0;
  this.taxAmount = 0;
  this.shippingAmount = 0;
  this.coupon = undefined;
  return this;
};

cartSchema.methods.saveItemForLater = function(productId) {
  const itemIndex = this.items.findIndex(
    item => item.product.toString() === productId.toString()
  );
  
  if (itemIndex > -1) {
    const item = this.items[itemIndex];
    this.savedItems.push({
      product: item.product,
      quantity: item.quantity,
      price: item.price,
      options: item.options,
      savedAt: new Date(),
      originalAddedAt: item.addedAt
    });
    this.items.splice(itemIndex, 1);
  }
  
  return this;
};

cartSchema.methods.moveToCartFromSaved = function(productId) {
  const savedItemIndex = this.savedItems.findIndex(
    item => item.product.toString() === productId.toString()
  );
  
  if (savedItemIndex > -1) {
    const savedItem = this.savedItems[savedItemIndex];
    this.addItem(
      savedItem.product,
      savedItem.quantity,
      savedItem.price,
      savedItem.options
    );
    this.savedItems.splice(savedItemIndex, 1);
  }
  
  return this;
};

// Static methods
cartSchema.statics.findByUser = function(userId) {
  return this.findOne({ user: userId })
    .populate('items.product', 'name images price originalPrice brand rating reviewCount stock isActive category')
    .populate('savedItems.product', 'name images price originalPrice brand rating reviewCount stock isActive category');
};

cartSchema.statics.getAbandonedCarts = function(hoursAgo = 24) {
  const cutoffTime = new Date();
  cutoffTime.setHours(cutoffTime.getHours() - hoursAgo);
  
  return this.find({
    lastActivity: { $lt: cutoffTime },
    'items.0': { $exists: true },
    isConverted: false,
    isAbandoned: { $ne: true }
  }).populate('user', 'email name');
};

cartSchema.statics.getCartAnalytics = function(startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: null,
        totalCarts: { $sum: 1 },
        convertedCarts: {
          $sum: { $cond: ['$isConverted', 1, 0] }
        },
        abandonedCarts: {
          $sum: { $cond: ['$isAbandoned', 1, 0] }
        },
        averageCartValue: { $avg: '$total' },
        totalCartValue: { $sum: '$total' }
      }
    },
    {
      $addFields: {
        conversionRate: {
          $multiply: [
            { $divide: ['$convertedCarts', '$totalCarts'] },
            100
          ]
        },
        abandonmentRate: {
          $multiply: [
            { $divide: ['$abandonedCarts', '$totalCarts'] },
            100
          ]
        }
      }
    }
  ]);
};

export default mongoose.model('Cart', cartSchema);
