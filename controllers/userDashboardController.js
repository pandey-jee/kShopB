import userAnalyticsService from '../services/userAnalyticsService.js';
import notificationService from '../services/notificationService.js';
import enhancedCartService from '../services/enhancedCartService.js';
import User from '../models/User.js';
import { AppError } from '../middleware/enhancedErrorHandler.js';
import { asyncHandler } from '../middleware/enhancedErrorHandler.js';
import logger from '../config/logger.js';

class UserDashboardController {
  // Get comprehensive user dashboard
  getDashboard = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    try {
      const dashboardData = await userAnalyticsService.getUserDashboard(userId);
      
      res.status(200).json({
        success: true,
        message: 'Dashboard data retrieved successfully',
        data: dashboardData,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Dashboard retrieval failed', {
        userId,
        error: error.message,
        stack: error.stack
      });
      throw new AppError('Failed to load dashboard', 500);
    }
  });

  // Get user profile with enhanced statistics
  getProfile = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    try {
      const profile = await userAnalyticsService.getUserProfile(userId);
      
      res.status(200).json({
        success: true,
        message: 'Profile retrieved successfully',
        data: profile
      });

    } catch (error) {
      logger.error('Profile retrieval failed', {
        userId,
        error: error.message
      });
      throw new AppError('Failed to load profile', 500);
    }
  });

  // Get user order analytics
  getOrderAnalytics = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { timeframe = '6months' } = req.query;

    try {
      const orderAnalytics = await userAnalyticsService.getOrderSummary(userId);
      
      res.status(200).json({
        success: true,
        message: 'Order analytics retrieved successfully',
        data: orderAnalytics,
        timeframe
      });

    } catch (error) {
      logger.error('Order analytics retrieval failed', {
        userId,
        timeframe,
        error: error.message
      });
      throw new AppError('Failed to load order analytics', 500);
    }
  });

  // Get spending analytics
  getSpendingAnalytics = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    try {
      const spendingAnalytics = await userAnalyticsService.getSpendingAnalytics(userId);
      
      res.status(200).json({
        success: true,
        message: 'Spending analytics retrieved successfully',
        data: spendingAnalytics
      });

    } catch (error) {
      logger.error('Spending analytics retrieval failed', {
        userId,
        error: error.message
      });
      throw new AppError('Failed to load spending analytics', 500);
    }
  });

  // Get personalized recommendations
  getRecommendations = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { limit = 12, type = 'general' } = req.query;

    try {
      let recommendations;
      
      switch (type) {
        case 'cart':
          recommendations = await enhancedCartService.getCartRecommendations(userId);
          break;
        case 'general':
        default:
          recommendations = await userAnalyticsService.getPersonalizedRecommendations(userId, parseInt(limit));
          break;
      }
      
      res.status(200).json({
        success: true,
        message: 'Recommendations retrieved successfully',
        data: {
          recommendations,
          type,
          count: recommendations.length
        }
      });

    } catch (error) {
      logger.error('Recommendations retrieval failed', {
        userId,
        type,
        limit,
        error: error.message
      });
      throw new AppError('Failed to load recommendations', 500);
    }
  });

  // Get user activity feed
  getActivityFeed = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { limit = 10, offset = 0 } = req.query;

    try {
      const activityFeed = await userAnalyticsService.getActivityFeed(userId, parseInt(limit));
      
      res.status(200).json({
        success: true,
        message: 'Activity feed retrieved successfully',
        data: {
          activities: activityFeed,
          pagination: {
            limit: parseInt(limit),
            offset: parseInt(offset),
            total: activityFeed.length
          }
        }
      });

    } catch (error) {
      logger.error('Activity feed retrieval failed', {
        userId,
        limit,
        offset,
        error: error.message
      });
      throw new AppError('Failed to load activity feed', 500);
    }
  });

  // Get user achievements
  getAchievements = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    try {
      const achievements = await userAnalyticsService.getUserAchievements(userId);
      
      res.status(200).json({
        success: true,
        message: 'Achievements retrieved successfully',
        data: achievements
      });

    } catch (error) {
      logger.error('Achievements retrieval failed', {
        userId,
        error: error.message
      });
      throw new AppError('Failed to load achievements', 500);
    }
  });

  // Get user notifications
  getNotifications = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { limit = 20, unreadOnly = false } = req.query;

    try {
      let notifications;
      
      if (unreadOnly === 'true') {
        notifications = await notificationService.getUnreadNotifications(userId);
      } else {
        // This would get all notifications from database
        const user = await User.findById(userId).select('notifications');
        notifications = user?.notifications?.slice(-parseInt(limit)) || [];
      }
      
      res.status(200).json({
        success: true,
        message: 'Notifications retrieved successfully',
        data: {
          notifications,
          unreadCount: notifications.filter(n => !n.read).length,
          totalCount: notifications.length
        }
      });

    } catch (error) {
      logger.error('Notifications retrieval failed', {
        userId,
        limit,
        unreadOnly,
        error: error.message
      });
      throw new AppError('Failed to load notifications', 500);
    }
  });

  // Mark notification as read
  markNotificationRead = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { notificationId } = req.params;

    try {
      await notificationService.markNotificationAsRead(userId, notificationId);
      
      res.status(200).json({
        success: true,
        message: 'Notification marked as read'
      });

    } catch (error) {
      logger.error('Mark notification read failed', {
        userId,
        notificationId,
        error: error.message
      });
      throw new AppError('Failed to mark notification as read', 500);
    }
  });

  // Mark all notifications as read
  markAllNotificationsRead = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    try {
      await User.findByIdAndUpdate(userId, {
        $set: { 'notifications.$[].read': true }
      });
      
      res.status(200).json({
        success: true,
        message: 'All notifications marked as read'
      });

    } catch (error) {
      logger.error('Mark all notifications read failed', {
        userId,
        error: error.message
      });
      throw new AppError('Failed to mark all notifications as read', 500);
    }
  });

  // Get user preferences
  getPreferences = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    try {
      const user = await User.findById(userId).select('preferences notifications settings');
      
      res.status(200).json({
        success: true,
        message: 'Preferences retrieved successfully',
        data: {
          preferences: user.preferences || {},
          notifications: user.notifications || {},
          settings: user.settings || {}
        }
      });

    } catch (error) {
      logger.error('Preferences retrieval failed', {
        userId,
        error: error.message
      });
      throw new AppError('Failed to load preferences', 500);
    }
  });

  // Update user preferences
  updatePreferences = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { preferences, notifications, settings } = req.body;

    try {
      const updateData = {};
      if (preferences) updateData.preferences = preferences;
      if (notifications) updateData.notifications = notifications;
      if (settings) updateData.settings = settings;

      const user = await User.findByIdAndUpdate(
        userId,
        { $set: updateData },
        { new: true, runValidators: true }
      ).select('preferences notifications settings');

      // Clear analytics cache when preferences change
      userAnalyticsService.clearCache(userId);
      
      res.status(200).json({
        success: true,
        message: 'Preferences updated successfully',
        data: {
          preferences: user.preferences,
          notifications: user.notifications,
          settings: user.settings
        }
      });

    } catch (error) {
      logger.error('Preferences update failed', {
        userId,
        updateData: { preferences, notifications, settings },
        error: error.message
      });
      throw new AppError('Failed to update preferences', 500);
    }
  });

  // Get dashboard statistics summary
  getStatsSummary = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    try {
      const [
        orderSummary,
        unreadNotifications,
        cartItemsCount
      ] = await Promise.all([
        userAnalyticsService.getOrderSummary(userId),
        notificationService.getUnreadNotifications(userId),
        enhancedCartService.getCart(userId).then(cart => cart.itemCount)
      ]);

      const summary = {
        orders: {
          total: orderSummary.total,
          pending: orderSummary.pending,
          completed: orderSummary.completed
        },
        notifications: {
          unread: unreadNotifications.length
        },
        cart: {
          items: cartItemsCount
        },
        isOnline: notificationService.isUserOnline(userId)
      };
      
      res.status(200).json({
        success: true,
        message: 'Stats summary retrieved successfully',
        data: summary
      });

    } catch (error) {
      logger.error('Stats summary retrieval failed', {
        userId,
        error: error.message
      });
      throw new AppError('Failed to load stats summary', 500);
    }
  });

  // Export user data (GDPR compliance)
  exportUserData = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    try {
      const userData = await userAnalyticsService.getUserDashboard(userId);
      
      // Add timestamp and format for export
      const exportData = {
        user: userData.profile,
        orders: userData.orders,
        analytics: userData.analytics,
        achievements: userData.achievements,
        exportedAt: new Date().toISOString(),
        format: 'JSON'
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="user-data-${userId}-${Date.now()}.json"`);
      
      res.status(200).json({
        success: true,
        message: 'User data exported successfully',
        data: exportData
      });

      logger.info('User data exported', { userId });

    } catch (error) {
      logger.error('User data export failed', {
        userId,
        error: error.message
      });
      throw new AppError('Failed to export user data', 500);
    }
  });

  // Get user engagement metrics
  getEngagementMetrics = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    try {
      // Calculate engagement metrics
      const user = await User.findById(userId).select('createdAt lastLoginAt');
      const orderSummary = await userAnalyticsService.getOrderSummary(userId);
      const activityFeed = await userAnalyticsService.getActivityFeed(userId, 50);

      const daysSinceJoined = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      const daysSinceLastLogin = user.lastLoginAt ? 
        Math.floor((Date.now() - new Date(user.lastLoginAt).getTime()) / (1000 * 60 * 60 * 24)) : null;

      const engagementMetrics = {
        membershipDuration: daysSinceJoined,
        lastActivity: daysSinceLastLogin,
        totalOrders: orderSummary.total,
        averageOrdersPerMonth: daysSinceJoined > 30 ? 
          Math.round((orderSummary.total / daysSinceJoined) * 30 * 100) / 100 : 0,
        totalSpent: orderSummary.totalSpent,
        averageOrderValue: orderSummary.averageOrderValue,
        recentActivityCount: activityFeed.length,
        engagementScore: this.calculateEngagementScore({
          daysSinceJoined,
          daysSinceLastLogin,
          totalOrders: orderSummary.total,
          totalSpent: orderSummary.totalSpent,
          recentActivityCount: activityFeed.length
        })
      };
      
      res.status(200).json({
        success: true,
        message: 'Engagement metrics retrieved successfully',
        data: engagementMetrics
      });

    } catch (error) {
      logger.error('Engagement metrics retrieval failed', {
        userId,
        error: error.message
      });
      throw new AppError('Failed to load engagement metrics', 500);
    }
  });

  // Helper method to calculate engagement score
  calculateEngagementScore(metrics) {
    let score = 0;
    
    // Points for membership duration (max 20 points)
    score += Math.min(metrics.daysSinceJoined / 365 * 20, 20);
    
    // Points for recent activity (max 25 points)
    if (metrics.daysSinceLastLogin <= 1) score += 25;
    else if (metrics.daysSinceLastLogin <= 7) score += 20;
    else if (metrics.daysSinceLastLogin <= 30) score += 10;
    
    // Points for order frequency (max 25 points)
    score += Math.min(metrics.totalOrders * 2, 25);
    
    // Points for spending (max 20 points)
    score += Math.min(metrics.totalSpent / 10000 * 20, 20);
    
    // Points for recent activity (max 10 points)
    score += Math.min(metrics.recentActivityCount, 10);
    
    return Math.round(score);
  }
}

export default new UserDashboardController();
