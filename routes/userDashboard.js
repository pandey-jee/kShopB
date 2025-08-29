import express from 'express';
import rateLimit from 'express-rate-limit';
import userDashboardController from '../controllers/userDashboardController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

// Apply rate limiting
const dashboardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many dashboard requests from this IP, please try again later.'
});

router.use(dashboardLimiter);

// Dashboard routes
router.get('/dashboard', userDashboardController.getDashboard);
router.get('/profile', userDashboardController.getProfile);
router.get('/analytics/orders', userDashboardController.getOrderAnalytics);
router.get('/analytics/spending', userDashboardController.getSpendingAnalytics);
router.get('/analytics/engagement', userDashboardController.getEngagementMetrics);

// Recommendations
router.get('/recommendations', userDashboardController.getRecommendations);

// Activity and achievements
router.get('/activity', userDashboardController.getActivityFeed);
router.get('/achievements', userDashboardController.getAchievements);

// Notifications
router.get('/notifications', userDashboardController.getNotifications);
router.patch('/notifications/:notificationId/read', userDashboardController.markNotificationRead);
router.patch('/notifications/read-all', userDashboardController.markAllNotificationsRead);

// Preferences and settings
router.get('/preferences', userDashboardController.getPreferences);
router.patch('/preferences', userDashboardController.updatePreferences);

// Stats and summary
router.get('/stats/summary', userDashboardController.getStatsSummary);

// Data export (GDPR compliance)
router.get('/export', userDashboardController.exportUserData);

export default router;
