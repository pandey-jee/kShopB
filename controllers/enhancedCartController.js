import enhancedCartService from '../services/enhancedCartService.js';
import notificationService from '../services/notificationService.js';
import Cart from '../models/Cart.js';
import { AppError } from '../middleware/enhancedErrorHandler.js';
import { asyncHandler } from '../middleware/enhancedErrorHandler.js';
import logger from '../config/logger.js';

class EnhancedCartController {
  // Get user's cart with enhanced features
  getCart = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    try {
      const cart = await enhancedCartService.getCart(userId);
      
      res.status(200).json({
        success: true,
        message: 'Cart retrieved successfully',
        data: cart
      });

    } catch (error) {
      logger.error('Cart retrieval failed', {
        userId,
        error: error.message
      });
      throw new AppError('Failed to retrieve cart', 500);
    }
  });

  // Add item to cart with validation
  addToCart = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { productId, quantity = 1, options = {} } = req.body;

    if (!productId) {
      throw new AppError('Product ID is required', 400);
    }

    if (quantity <= 0) {
      throw new AppError('Quantity must be greater than 0', 400);
    }

    try {
      const updatedCart = await enhancedCartService.addToCart(userId, productId, quantity, options);
      
      res.status(200).json({
        success: true,
        message: 'Item added to cart successfully',
        data: updatedCart
      });

    } catch (error) {
      logger.error('Add to cart failed', {
        userId,
        productId,
        quantity,
        options,
        error: error.message
      });
      
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to add item to cart', 500);
    }
  });

  // Update cart item quantity
  updateCartItem = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { productId } = req.params;
    const { quantity } = req.body;

    if (!productId) {
      throw new AppError('Product ID is required', 400);
    }

    if (quantity < 0) {
      throw new AppError('Quantity cannot be negative', 400);
    }

    try {
      const updatedCart = await enhancedCartService.updateCartItem(userId, productId, quantity);
      
      res.status(200).json({
        success: true,
        message: quantity === 0 ? 'Item removed from cart' : 'Cart item updated successfully',
        data: updatedCart
      });

    } catch (error) {
      logger.error('Update cart item failed', {
        userId,
        productId,
        quantity,
        error: error.message
      });
      
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to update cart item', 500);
    }
  });

  // Remove item from cart
  removeFromCart = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { productId } = req.params;

    if (!productId) {
      throw new AppError('Product ID is required', 400);
    }

    try {
      const updatedCart = await enhancedCartService.removeFromCart(userId, productId);
      
      res.status(200).json({
        success: true,
        message: 'Item removed from cart successfully',
        data: updatedCart
      });

    } catch (error) {
      logger.error('Remove from cart failed', {
        userId,
        productId,
        error: error.message
      });
      
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to remove item from cart', 500);
    }
  });

  // Clear entire cart
  clearCart = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    try {
      const clearedCart = await enhancedCartService.clearCart(userId);
      
      res.status(200).json({
        success: true,
        message: 'Cart cleared successfully',
        data: clearedCart
      });

    } catch (error) {
      logger.error('Clear cart failed', {
        userId,
        error: error.message
      });
      throw new AppError('Failed to clear cart', 500);
    }
  });

  // Apply coupon to cart
  applyCoupon = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { couponCode } = req.body;

    if (!couponCode || typeof couponCode !== 'string') {
      throw new AppError('Valid coupon code is required', 400);
    }

    try {
      const updatedCart = await enhancedCartService.applyCoupon(userId, couponCode.trim().toUpperCase());
      
      res.status(200).json({
        success: true,
        message: 'Coupon applied successfully',
        data: updatedCart
      });

    } catch (error) {
      logger.error('Apply coupon failed', {
        userId,
        couponCode,
        error: error.message
      });
      
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to apply coupon', 500);
    }
  });

  // Remove coupon from cart
  removeCoupon = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    try {
      // Remove coupon by updating cart
      const cart = await Cart.findOneAndUpdate(
        { user: userId },
        {
          $unset: { coupon: 1 },
          $set: { discountAmount: 0 }
        },
        { new: true }
      );

      if (!cart) {
        throw new AppError('Cart not found', 404);
      }

      await enhancedCartService.updateCartTotals(cart);
      await cart.save();

      enhancedCartService.clearCartCache(userId);
      const updatedCart = await enhancedCartService.getCart(userId);
      
      res.status(200).json({
        success: true,
        message: 'Coupon removed successfully',
        data: updatedCart
      });

    } catch (error) {
      logger.error('Remove coupon failed', {
        userId,
        error: error.message
      });
      
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to remove coupon', 500);
    }
  });

  // Save item for later
  saveForLater = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { productId } = req.params;

    if (!productId) {
      throw new AppError('Product ID is required', 400);
    }

    try {
      const updatedCart = await enhancedCartService.saveForLater(userId, productId);
      
      res.status(200).json({
        success: true,
        message: 'Item saved for later',
        data: updatedCart
      });

    } catch (error) {
      logger.error('Save for later failed', {
        userId,
        productId,
        error: error.message
      });
      
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to save item for later', 500);
    }
  });

  // Move saved item back to cart
  moveToCart = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { productId } = req.params;

    if (!productId) {
      throw new AppError('Product ID is required', 400);
    }

    try {
      const updatedCart = await enhancedCartService.moveToCart(userId, productId);
      
      res.status(200).json({
        success: true,
        message: 'Item moved to cart',
        data: updatedCart
      });

    } catch (error) {
      logger.error('Move to cart failed', {
        userId,
        productId,
        error: error.message
      });
      
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to move item to cart', 500);
    }
  });

  // Get cart recommendations
  getRecommendations = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { limit = 8 } = req.query;

    try {
      const recommendations = await enhancedCartService.getCartRecommendations(userId);
      
      res.status(200).json({
        success: true,
        message: 'Cart recommendations retrieved successfully',
        data: {
          recommendations: recommendations.slice(0, parseInt(limit)),
          total: recommendations.length
        }
      });

    } catch (error) {
      logger.error('Get cart recommendations failed', {
        userId,
        limit,
        error: error.message
      });
      throw new AppError('Failed to get cart recommendations', 500);
    }
  });

  // Validate cart for checkout
  validateCart = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    try {
      const validation = await enhancedCartService.validateCartForCheckout(userId);
      
      res.status(200).json({
        success: true,
        message: 'Cart validation completed',
        data: validation
      });

    } catch (error) {
      logger.error('Cart validation failed', {
        userId,
        error: error.message
      });
      throw new AppError('Failed to validate cart', 500);
    }
  });

  // Get cart summary for quick view
  getCartSummary = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    try {
      const cart = await enhancedCartService.getCart(userId);
      
      const summary = {
        itemCount: cart.itemCount,
        subtotal: cart.subtotal,
        totalSavings: cart.totalSavings,
        finalTotal: cart.finalTotal,
        hasItems: cart.items.length > 0,
        freeShipping: cart.shippingAmount === 0,
        estimatedDelivery: cart.estimatedDelivery
      };
      
      res.status(200).json({
        success: true,
        message: 'Cart summary retrieved successfully',
        data: summary
      });

    } catch (error) {
      logger.error('Get cart summary failed', {
        userId,
        error: error.message
      });
      throw new AppError('Failed to get cart summary', 500);
    }
  });

  // Quick add multiple items to cart
  addMultipleItems = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError('Items array is required', 400);
    }

    // Validate items structure
    for (const item of items) {
      if (!item.productId || !item.quantity || item.quantity <= 0) {
        throw new AppError('Each item must have productId and valid quantity', 400);
      }
    }

    try {
      const results = [];
      let cart;

      for (const item of items) {
        try {
          cart = await enhancedCartService.addToCart(
            userId, 
            item.productId, 
            item.quantity, 
            item.options || {}
          );
          results.push({
            productId: item.productId,
            success: true,
            quantity: item.quantity
          });
        } catch (itemError) {
          results.push({
            productId: item.productId,
            success: false,
            error: itemError.message,
            quantity: item.quantity
          });
        }
      }

      // Get final cart state
      const finalCart = cart || await enhancedCartService.getCart(userId);

      res.status(200).json({
        success: true,
        message: 'Multiple items processing completed',
        data: {
          cart: finalCart,
          results,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length
        }
      });

    } catch (error) {
      logger.error('Add multiple items failed', {
        userId,
        itemsCount: items.length,
        error: error.message
      });
      throw new AppError('Failed to add multiple items', 500);
    }
  });

  // Estimate shipping for cart
  estimateShipping = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { pincode, country = 'IN' } = req.body;

    if (!pincode) {
      throw new AppError('Pincode is required for shipping estimation', 400);
    }

    try {
      const cart = await enhancedCartService.getCart(userId);
      
      if (cart.items.length === 0) {
        throw new AppError('Cart is empty', 400);
      }

      // Mock shipping calculation (would integrate with shipping service)
      const shippingEstimate = this.calculateShippingEstimate(cart, pincode, country);
      
      res.status(200).json({
        success: true,
        message: 'Shipping estimate calculated',
        data: shippingEstimate
      });

    } catch (error) {
      logger.error('Shipping estimation failed', {
        userId,
        pincode,
        country,
        error: error.message
      });
      
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to estimate shipping', 500);
    }
  });

  // Share cart with others
  shareCart = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { method = 'link', recipients = [] } = req.body;

    try {
      const cart = await enhancedCartService.getCart(userId);
      
      if (cart.items.length === 0) {
        throw new AppError('Cannot share empty cart', 400);
      }

      // Generate share token/link
      const shareToken = this.generateShareToken(userId, cart._id);
      const shareLink = `${process.env.FRONTEND_URL}/shared-cart/${shareToken}`;

      // Create share data
      const shareData = {
        method,
        shareLink,
        shareToken,
        cart: {
          items: cart.items.map(item => ({
            product: {
              id: item.product._id,
              name: item.product.name,
              image: item.product.images?.[0]?.url,
              price: item.product.price
            },
            quantity: item.quantity,
            price: item.price
          })),
          total: cart.finalTotal,
          itemCount: cart.itemCount
        },
        sharedBy: req.user.name,
        sharedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      };

      // If email method and recipients provided, send emails
      if (method === 'email' && recipients.length > 0) {
        // This would integrate with email service
        logger.info('Cart share email would be sent', {
          userId,
          recipients: recipients.length,
          shareToken
        });
      }

      res.status(200).json({
        success: true,
        message: 'Cart shared successfully',
        data: shareData
      });

    } catch (error) {
      logger.error('Cart sharing failed', {
        userId,
        method,
        recipientsCount: recipients.length,
        error: error.message
      });
      
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to share cart', 500);
    }
  });

  // Helper methods
  calculateShippingEstimate(cart, pincode, country) {
    // Mock shipping calculation logic
    const baseShipping = cart.subtotal >= 500 ? 0 : 50;
    const expressShipping = baseShipping + 100;
    
    const estimatedDays = pincode.startsWith('1') ? 1 : 3; // Delhi area gets faster delivery
    
    return {
      standard: {
        cost: baseShipping,
        estimatedDays,
        description: baseShipping === 0 ? 'Free Shipping' : 'Standard Shipping'
      },
      express: {
        cost: expressShipping,
        estimatedDays: Math.max(1, estimatedDays - 1),
        description: 'Express Shipping'
      },
      pincode,
      country
    };
  }

  generateShareToken(userId, cartId) {
    const tokenData = `${userId}_${cartId}_${Date.now()}`;
    return Buffer.from(tokenData).toString('base64');
  }
}

export default new EnhancedCartController();
