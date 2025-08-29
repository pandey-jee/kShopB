import express from 'express';
import {
  getSearchSuggestions,
  getTrendingSearches,
  advancedSearch,
  getSearchAnalytics
} from '../controllers/searchController.js';
import { protect, admin } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.get('/suggestions', getSearchSuggestions);
router.get('/trending', getTrendingSearches);
router.get('/', advancedSearch);

// Admin routes
router.get('/analytics', protect, admin, getSearchAnalytics);

export default router;
