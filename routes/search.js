import express from 'express';
import {
  getSearchSuggestions,
  getTrendingSearches,
  advancedSearch,
  getSearchAnalytics,
  getSearchFilters,
  rebuildSearchIndex
} from '../controllers/searchController.js';
import { protect, admin } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.get('/suggestions', getSearchSuggestions);
router.get('/trending', getTrendingSearches);
router.get('/filters', getSearchFilters);
router.get('/', advancedSearch);

// Admin routes
router.get('/analytics', protect, admin, getSearchAnalytics);
router.post('/rebuild-index', protect, admin, rebuildSearchIndex);

export default router;
