import express from 'express';
import rateLimit from 'express-rate-limit';
import enhancedCartController from '../controllers/enhancedCartController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

// Apply rate limiting
const cartLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs
  message: 'Too many cart requests from this IP, please try again later.'
});

router.use(cartLimiter);

// Cart CRUD operations
router.get('/', enhancedCartController.getCart);
router.post('/add', enhancedCartController.addToCart);
router.post('/add-multiple', enhancedCartController.addMultipleItems);
router.patch('/items/:productId', enhancedCartController.updateCartItem);
router.delete('/items/:productId', enhancedCartController.removeFromCart);
router.delete('/clear', enhancedCartController.clearCart);

// Cart features
router.get('/summary', enhancedCartController.getCartSummary);
router.get('/recommendations', enhancedCartController.getRecommendations);
router.post('/validate', enhancedCartController.validateCart);

// Coupon management
router.post('/coupon/apply', enhancedCartController.applyCoupon);
router.delete('/coupon/remove', enhancedCartController.removeCoupon);

// Save for later functionality
router.post('/save-later/:productId', enhancedCartController.saveForLater);
router.post('/move-to-cart/:productId', enhancedCartController.moveToCart);

// Shipping and sharing
router.post('/estimate-shipping', enhancedCartController.estimateShipping);
router.post('/share', enhancedCartController.shareCart);

export default router;
