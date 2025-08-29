import express from 'express';
import { getRecommendations, getRecommendationAnalytics } from '../controllers/recommendationController.js';
import { protect, admin } from '../middleware/auth.js';

const router = express.Router();

// Get product recommendations
router.get('/', getRecommendations);

// Get recommendation analytics (admin only)
router.get('/analytics', protect, admin, getRecommendationAnalytics);

export default router;
