import User from '../models/User.js';
import Product from '../models/Product.js';
import Cart from '../models/Cart.js';
import { AppError } from '../middleware/enhancedErrorHandler.js';
import logger from '../config/logger.js';
import notificationService from './notificationService.js';

class EnhancedCartService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5 minutes
    this.priceCheckInterval = 3600000; // 1 hour
    this.stockCheckInterval = 600000; // 10 minutes
    
    // Start background monitoring
    this.startBackgroundMonitoring();
  }

  // Get user's cart with enhanced information
  async getCart(userId) {
    try {
      const cacheKey = `cart_${userId}`;
      const cached = this.cache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }

      let cart = await Cart.findOne({ user: userId })
        .populate({
          path: 'items.product',
          select: 'name images price originalPrice brand rating reviewCount stock isActive category specifications'
        })
        .lean();

      if (!cart) {
        cart = await Cart.create({ user: userId, items: [] });
      }

      // Enhance cart with additional information
      const enhancedCart = await this.enhanceCartData(cart);

      // Cache the result
      this.cache.set(cacheKey, {
        data: enhancedCart,
        timestamp: Date.now()
      });

      logger.info('Cart retrieved', { userId, itemsCount: enhancedCart.items.length });
      return enhancedCart;

    } catch (error) {
      logger.error('Failed to get cart', { userId, error: error.message });
      throw new AppError('Failed to retrieve cart', 500);
    }
  }

  // Add item to cart with intelligence
  async addToCart(userId, productId, quantity = 1, options = {}) {
    try {
      // Validate product and stock
      const product = await Product.findById(productId);
      if (!product || !product.isActive) {
        throw new AppError('Product not available', 404);
      }

      if (product.stock < quantity) {
        throw new AppError(`Only ${product.stock} items available in stock`, 400);
      }

      // Get or create cart
      let cart = await Cart.findOne({ user: userId });
      if (!cart) {
        cart = new Cart({ user: userId, items: [] });
      }

      // Check if item already exists in cart
      const existingItemIndex = cart.items.findIndex(
        item => item.product.toString() === productId.toString()
      );

      if (existingItemIndex > -1) {
        // Update existing item
        const newQuantity = cart.items[existingItemIndex].quantity + quantity;
        
        if (product.stock < newQuantity) {
          throw new AppError(`Cannot add more items. Only ${product.stock} available`, 400);
        }

        cart.items[existingItemIndex].quantity = newQuantity;
        cart.items[existingItemIndex].price = product.price;
        cart.items[existingItemIndex].updatedAt = new Date();
      } else {
        // Add new item
        cart.items.push({
          product: productId,
          quantity,
          price: product.price,
          options,
          addedAt: new Date()
        });
      }

      // Update cart totals
      await this.updateCartTotals(cart);
      await cart.save();

      // Clear cache
      this.clearCartCache(userId);

      // Get updated cart with populated data
      const updatedCart = await this.getCart(userId);

      // Check for recommendations and notifications
      await this.processCartIntelligence(userId, updatedCart, 'add', productId);

      logger.info('Item added to cart', { 
        userId, 
        productId, 
        quantity, 
        cartTotal: updatedCart.total 
      });

      return updatedCart;

    } catch (error) {
      logger.error('Failed to add item to cart', { 
        userId, 
        productId, 
        quantity, 
        error: error.message 
      });
      throw error;
    }
  }

  // Update cart item quantity
  async updateCartItem(userId, productId, quantity) {
    try {
      if (quantity <= 0) {
        return await this.removeFromCart(userId, productId);
      }

      const product = await Product.findById(productId);
      if (!product || !product.isActive) {
        throw new AppError('Product not available', 404);
      }

      if (product.stock < quantity) {
        throw new AppError(`Only ${product.stock} items available`, 400);
      }

      const cart = await Cart.findOne({ user: userId });
      if (!cart) {
        throw new AppError('Cart not found', 404);
      }

      const itemIndex = cart.items.findIndex(
        item => item.product.toString() === productId.toString()
      );

      if (itemIndex === -1) {
        throw new AppError('Item not found in cart', 404);
      }

      // Update item
      cart.items[itemIndex].quantity = quantity;
      cart.items[itemIndex].price = product.price;
      cart.items[itemIndex].updatedAt = new Date();

      await this.updateCartTotals(cart);
      await cart.save();

      this.clearCartCache(userId);
      const updatedCart = await this.getCart(userId);

      logger.info('Cart item updated', { 
        userId, 
        productId, 
        quantity, 
        cartTotal: updatedCart.total 
      });

      return updatedCart;

    } catch (error) {
      logger.error('Failed to update cart item', { 
        userId, 
        productId, 
        quantity, 
        error: error.message 
      });
      throw error;
    }
  }

  // Remove item from cart
  async removeFromCart(userId, productId) {
    try {
      const cart = await Cart.findOne({ user: userId });
      if (!cart) {
        throw new AppError('Cart not found', 404);
      }

      const initialLength = cart.items.length;
      cart.items = cart.items.filter(
        item => item.product.toString() !== productId.toString()
      );

      if (cart.items.length === initialLength) {
        throw new AppError('Item not found in cart', 404);
      }

      await this.updateCartTotals(cart);
      await cart.save();

      this.clearCartCache(userId);
      const updatedCart = await this.getCart(userId);

      // Process cart intelligence for removed item
      await this.processCartIntelligence(userId, updatedCart, 'remove', productId);

      logger.info('Item removed from cart', { 
        userId, 
        productId, 
        remainingItems: updatedCart.items.length 
      });

      return updatedCart;

    } catch (error) {
      logger.error('Failed to remove item from cart', { 
        userId, 
        productId, 
        error: error.message 
      });
      throw error;
    }
  }

  // Clear entire cart
  async clearCart(userId) {
    try {
      const cart = await Cart.findOne({ user: userId });
      if (!cart) {
        return { items: [], total: 0, itemCount: 0 };
      }

      cart.items = [];
      cart.total = 0;
      cart.itemCount = 0;
      cart.discountAmount = 0;
      cart.taxAmount = 0;
      cart.shippingAmount = 0;
      cart.finalTotal = 0;

      await cart.save();
      this.clearCartCache(userId);

      logger.info('Cart cleared', { userId });
      return cart;

    } catch (error) {
      logger.error('Failed to clear cart', { userId, error: error.message });
      throw new AppError('Failed to clear cart', 500);
    }
  }

  // Apply coupon to cart
  async applyCoupon(userId, couponCode) {
    try {
      const cart = await this.getCart(userId);
      
      // Validate coupon (this would integrate with a coupon service)
      const coupon = await this.validateCoupon(couponCode, cart);
      
      if (!coupon) {
        throw new AppError('Invalid or expired coupon', 400);
      }

      // Calculate discount
      const discount = this.calculateCouponDiscount(coupon, cart);
      
      // Update cart with coupon
      await Cart.findOneAndUpdate(
        { user: userId },
        {
          $set: {
            'coupon.code': couponCode,
            'coupon.discount': discount,
            'coupon.type': coupon.type,
            discountAmount: discount
          }
        }
      );

      this.clearCartCache(userId);
      const updatedCart = await this.getCart(userId);

      // Send notification about savings
      await notificationService.sendNotification(userId, {
        type: 'coupon',
        title: 'Coupon Applied!',
        message: `You saved ₹${discount} with coupon ${couponCode}`,
        priority: 'medium'
      });

      logger.info('Coupon applied to cart', { 
        userId, 
        couponCode, 
        discount, 
        newTotal: updatedCart.finalTotal 
      });

      return updatedCart;

    } catch (error) {
      logger.error('Failed to apply coupon', { 
        userId, 
        couponCode, 
        error: error.message 
      });
      throw error;
    }
  }

  // Save cart for later (wishlist-like functionality)
  async saveForLater(userId, productId) {
    try {
      // Move item from cart to saved items
      const cart = await Cart.findOne({ user: userId });
      if (!cart) {
        throw new AppError('Cart not found', 404);
      }

      const itemIndex = cart.items.findIndex(
        item => item.product.toString() === productId.toString()
      );

      if (itemIndex === -1) {
        throw new AppError('Item not found in cart', 404);
      }

      const savedItem = cart.items[itemIndex];
      cart.items.splice(itemIndex, 1);

      // Add to saved items
      if (!cart.savedItems) {
        cart.savedItems = [];
      }

      cart.savedItems.push({
        ...savedItem.toObject(),
        savedAt: new Date()
      });

      await this.updateCartTotals(cart);
      await cart.save();

      this.clearCartCache(userId);
      const updatedCart = await this.getCart(userId);

      logger.info('Item saved for later', { userId, productId });
      return updatedCart;

    } catch (error) {
      logger.error('Failed to save item for later', { 
        userId, 
        productId, 
        error: error.message 
      });
      throw error;
    }
  }

  // Move saved item back to cart
  async moveToCart(userId, productId) {
    try {
      const cart = await Cart.findOne({ user: userId });
      if (!cart || !cart.savedItems) {
        throw new AppError('No saved items found', 404);
      }

      const savedItemIndex = cart.savedItems.findIndex(
        item => item.product.toString() === productId.toString()
      );

      if (savedItemIndex === -1) {
        throw new AppError('Saved item not found', 404);
      }

      const savedItem = cart.savedItems[savedItemIndex];
      
      // Check stock availability
      const product = await Product.findById(productId);
      if (!product || !product.isActive) {
        throw new AppError('Product no longer available', 404);
      }

      if (product.stock < savedItem.quantity) {
        // Adjust quantity if needed
        savedItem.quantity = product.stock;
        if (savedItem.quantity === 0) {
          throw new AppError('Product is out of stock', 400);
        }
      }

      // Remove from saved items
      cart.savedItems.splice(savedItemIndex, 1);

      // Add back to cart
      const existingItemIndex = cart.items.findIndex(
        item => item.product.toString() === productId.toString()
      );

      if (existingItemIndex > -1) {
        cart.items[existingItemIndex].quantity += savedItem.quantity;
      } else {
        cart.items.push({
          product: savedItem.product,
          quantity: savedItem.quantity,
          price: product.price, // Use current price
          options: savedItem.options,
          addedAt: new Date()
        });
      }

      await this.updateCartTotals(cart);
      await cart.save();

      this.clearCartCache(userId);
      const updatedCart = await this.getCart(userId);

      logger.info('Saved item moved to cart', { userId, productId });
      return updatedCart;

    } catch (error) {
      logger.error('Failed to move saved item to cart', { 
        userId, 
        productId, 
        error: error.message 
      });
      throw error;
    }
  }

  // Get cart recommendations
  async getCartRecommendations(userId) {
    try {
      const cart = await this.getCart(userId);
      
      if (cart.items.length === 0) {
        return [];
      }

      // Get categories and brands from cart items
      const cartCategories = [...new Set(cart.items.map(item => item.product.category))];
      const cartBrands = [...new Set(cart.items.map(item => item.product.brand))];
      const cartProductIds = cart.items.map(item => item.product._id);

      // Find related products
      const recommendations = await Product.find({
        $and: [
          { isActive: true },
          { stock: { $gt: 0 } },
          { _id: { $nin: cartProductIds } },
          {
            $or: [
              { category: { $in: cartCategories } },
              { brand: { $in: cartBrands } }
            ]
          }
        ]
      })
      .sort({ rating: -1, reviewCount: -1 })
      .limit(8)
      .select('name images price brand rating reviewCount category')
      .lean();

      // Add recommendation reasons
      const enhancedRecommendations = recommendations.map(product => ({
        ...product,
        recommendationReason: this.getRecommendationReason(product, cartCategories, cartBrands)
      }));

      logger.info('Cart recommendations generated', { 
        userId, 
        cartItems: cart.items.length,
        recommendations: enhancedRecommendations.length 
      });

      return enhancedRecommendations;

    } catch (error) {
      logger.error('Failed to get cart recommendations', { 
        userId, 
        error: error.message 
      });
      return [];
    }
  }

  // Validate cart before checkout
  async validateCartForCheckout(userId) {
    try {
      const cart = await this.getCart(userId);
      const issues = [];

      if (cart.items.length === 0) {
        issues.push({
          type: 'empty_cart',
          message: 'Cart is empty'
        });
      }

      // Check each item for availability and stock
      for (const item of cart.items) {
        const product = await Product.findById(item.product._id);
        
        if (!product || !product.isActive) {
          issues.push({
            type: 'product_unavailable',
            productId: item.product._id,
            productName: item.product.name,
            message: `${item.product.name} is no longer available`
          });
          continue;
        }

        if (product.stock < item.quantity) {
          issues.push({
            type: 'insufficient_stock',
            productId: item.product._id,
            productName: item.product.name,
            requestedQuantity: item.quantity,
            availableStock: product.stock,
            message: `Only ${product.stock} units of ${item.product.name} available`
          });
        }

        if (product.price !== item.price) {
          issues.push({
            type: 'price_changed',
            productId: item.product._id,
            productName: item.product.name,
            oldPrice: item.price,
            newPrice: product.price,
            message: `Price of ${item.product.name} has changed`
          });
        }
      }

      const isValid = issues.length === 0;

      logger.info('Cart validation completed', { 
        userId, 
        isValid, 
        issuesCount: issues.length 
      });

      return {
        isValid,
        issues,
        cart: isValid ? cart : null
      };

    } catch (error) {
      logger.error('Cart validation failed', { userId, error: error.message });
      throw new AppError('Failed to validate cart', 500);
    }
  }

  // Update cart totals
  async updateCartTotals(cart) {
    let subtotal = 0;
    let itemCount = 0;

    cart.items.forEach(item => {
      subtotal += item.price * item.quantity;
      itemCount += item.quantity;
    });

    cart.subtotal = subtotal;
    cart.itemCount = itemCount;

    // Calculate tax (this would be based on your tax logic)
    cart.taxAmount = Math.round(subtotal * 0.18); // 18% GST

    // Calculate shipping (this would be based on your shipping logic)
    cart.shippingAmount = subtotal >= 500 ? 0 : 50;

    // Apply discount
    cart.discountAmount = cart.discountAmount || 0;

    // Calculate final total
    cart.finalTotal = cart.subtotal + cart.taxAmount + cart.shippingAmount - cart.discountAmount;
    cart.total = cart.finalTotal;

    cart.updatedAt = new Date();
  }

  // Enhance cart data with additional information
  async enhanceCartData(cart) {
    // Add price change information
    for (const item of cart.items) {
      if (item.product) {
        const currentProduct = await Product.findById(item.product._id).select('price originalPrice stock');
        if (currentProduct) {
          item.currentPrice = currentProduct.price;
          item.priceChanged = item.price !== currentProduct.price;
          item.stockAvailable = currentProduct.stock >= item.quantity;
          item.savings = item.product.originalPrice ? 
            (item.product.originalPrice - item.product.price) * item.quantity : 0;
        }
      }
    }

    // Calculate total savings
    cart.totalSavings = cart.items.reduce((total, item) => total + (item.savings || 0), 0);

    // Add delivery estimation
    cart.estimatedDelivery = this.calculateDeliveryDate();

    // Add cart insights
    cart.insights = await this.generateCartInsights(cart);

    return cart;
  }

  // Process cart intelligence (recommendations, notifications, etc.)
  async processCartIntelligence(userId, cart, action, productId) {
    try {
      // Send notifications for abandoned cart (if user hasn't checked out)
      if (action === 'add' && cart.items.length === 1) {
        // First item added - start abandoned cart tracking
        setTimeout(async () => {
          const currentCart = await Cart.findOne({ user: userId });
          if (currentCart && currentCart.items.length > 0) {
            await notificationService.sendNotification(userId, {
              type: 'cart',
              title: 'Complete Your Purchase',
              message: 'You have items waiting in your cart',
              priority: 'low',
              action: {
                type: 'view_cart',
                url: '/cart'
              }
            });
          }
        }, 3600000); // 1 hour
      }

      // Check for bundle offers
      if (action === 'add') {
        const bundleOffers = await this.checkBundleOffers(cart, productId);
        if (bundleOffers.length > 0) {
          await notificationService.sendNotification(userId, {
            type: 'offer',
            title: 'Bundle Offer Available!',
            message: `Save more by buying these items together`,
            priority: 'medium'
          });
        }
      }

    } catch (error) {
      logger.error('Cart intelligence processing failed', { 
        userId, 
        action, 
        productId, 
        error: error.message 
      });
    }
  }

  // Background monitoring for price changes and stock updates
  startBackgroundMonitoring() {
    // Monitor price changes
    setInterval(async () => {
      await this.checkPriceChanges();
    }, this.priceCheckInterval);

    // Monitor stock changes
    setInterval(async () => {
      await this.checkStockChanges();
    }, this.stockCheckInterval);
  }

  async checkPriceChanges() {
    try {
      // Get all active carts
      const carts = await Cart.find({ 'items.0': { $exists: true } })
        .populate('user', '_id')
        .populate('items.product', '_id price name');

      for (const cart of carts) {
        for (const item of cart.items) {
          if (item.product && item.price !== item.product.price) {
            // Price changed - notify user
            await notificationService.sendNotification(cart.user._id, {
              type: 'price_change',
              title: 'Price Update',
              message: `Price of ${item.product.name} in your cart has changed`,
              priority: 'medium',
              action: {
                type: 'view_cart',
                url: '/cart'
              }
            });
          }
        }
      }

    } catch (error) {
      logger.error('Price change monitoring failed', { error: error.message });
    }
  }

  async checkStockChanges() {
    try {
      // Check for items going out of stock
      const carts = await Cart.find({ 'items.0': { $exists: true } })
        .populate('user', '_id')
        .populate('items.product', '_id stock name');

      for (const cart of carts) {
        for (const item of cart.items) {
          if (item.product && item.product.stock < item.quantity) {
            // Stock insufficient - notify user
            await notificationService.sendNotification(cart.user._id, {
              type: 'stock_alert',
              title: 'Stock Alert',
              message: `Limited stock available for ${item.product.name}`,
              priority: 'high',
              action: {
                type: 'view_cart',
                url: '/cart'
              }
            });
          }
        }
      }

    } catch (error) {
      logger.error('Stock change monitoring failed', { error: error.message });
    }
  }

  // Helper methods
  calculateDeliveryDate() {
    const date = new Date();
    date.setDate(date.getDate() + 3); // 3 days from now
    return date.toISOString().split('T')[0];
  }

  async generateCartInsights(cart) {
    const insights = [];

    if (cart.totalSavings > 0) {
      insights.push(`You're saving ₹${cart.totalSavings} on this order`);
    }

    if (cart.shippingAmount === 0) {
      insights.push('Free shipping applied!');
    } else {
      const needed = 500 - cart.subtotal;
      if (needed > 0) {
        insights.push(`Add ₹${needed} more for free shipping`);
      }
    }

    return insights;
  }

  getRecommendationReason(product, cartCategories, cartBrands) {
    if (cartBrands.includes(product.brand)) {
      return `More from ${product.brand}`;
    }
    if (cartCategories.includes(product.category)) {
      return `Popular in ${product.category}`;
    }
    return 'Frequently bought together';
  }

  async validateCoupon(couponCode, cart) {
    // This would integrate with your coupon system
    // For now, return a mock coupon
    const mockCoupons = {
      'SAVE10': { type: 'percentage', value: 10, minAmount: 500 },
      'FLAT50': { type: 'fixed', value: 50, minAmount: 200 },
      'NEWUSER': { type: 'percentage', value: 15, minAmount: 1000 }
    };

    const coupon = mockCoupons[couponCode];
    if (!coupon) return null;

    if (cart.subtotal < coupon.minAmount) {
      throw new AppError(`Minimum order amount ₹${coupon.minAmount} required`, 400);
    }

    return coupon;
  }

  calculateCouponDiscount(coupon, cart) {
    if (coupon.type === 'percentage') {
      return Math.round((cart.subtotal * coupon.value) / 100);
    } else {
      return coupon.value;
    }
  }

  async checkBundleOffers(cart, productId) {
    // This would check for bundle offers
    // Mock implementation
    return [];
  }

  clearCartCache(userId) {
    this.cache.delete(`cart_${userId}`);
  }
}

export default new EnhancedCartService();
