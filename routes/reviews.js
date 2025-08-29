import express from 'express';
import {
  getProductReviews,
  getUserReviews,
  createReview,
  updateReview,
  deleteReview,
  markHelpful,
  reportReview
} from '../controllers/reviewController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.get('/product/:productId', getProductReviews);

// Protected routes
router.get('/user', protect, getUserReviews);
router.post('/', protect, createReview);
router.put('/:reviewId', protect, updateReview);
router.delete('/:reviewId', protect, deleteReview);
router.post('/:reviewId/helpful', protect, markHelpful);
router.post('/:reviewId/report', protect, reportReview);

export default router;
