import express from 'express';
import {
  getSettings,
  updateSettings,
  resetSettings
} from '../controllers/settingsController.js';
import { protect, admin } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication and admin privileges
router.use(protect);
router.use(admin);

// @route   GET /api/admin/settings
// @desc    Get all settings
// @access  Private/Admin
router.get('/', getSettings);

// @route   PUT /api/admin/settings
// @desc    Update settings
// @access  Private/Admin
router.put('/', updateSettings);

// @route   POST /api/admin/settings/reset
// @desc    Reset settings to default
// @access  Private/Admin
router.post('/reset', resetSettings);

export default router;
