import User from '../models/User.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Transaction from '../models/Transaction.js';
import Review from '../models/Review.js';
import { AppError } from '../middleware/enhancedErrorHandler.js';
import { asyncHandler } from '../middleware/enhancedErrorHandler.js';
import logger from '../config/logger.js';

class UserAnalyticsService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5 minutes
  }

  // Get comprehensive user dashboard data
  async getUserDashboard(userId) {
    try {
      const cacheKey = `dashboard_${userId}`;
      const cached = this.cache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }

      const [
        userProfile,
        orderSummary,
        recentOrders,
        favoriteProducts,
        recommendations,
        spendingAnalytics,
        activityFeed,
        achievements
      ] = await Promise.all([
        this.getUserProfile(userId),
        this.getOrderSummary(userId),
        this.getRecentOrders(userId),
        this.getFavoriteProducts(userId),
        this.getPersonalizedRecommendations(userId),
        this.getSpendingAnalytics(userId),
        this.getActivityFeed(userId),
        this.getUserAchievements(userId)
      ]);

      const dashboardData = {
        profile: userProfile,
        orders: {
          summary: orderSummary,
          recent: recentOrders
        },
        products: {
          favorites: favoriteProducts,
          recommendations
        },
        analytics: {
          spending: spendingAnalytics,
          activity: activityFeed
        },
        achievements,
        lastUpdated: new Date().toISOString()
      };

      // Cache the result
      this.cache.set(cacheKey, {
        data: dashboardData,
        timestamp: Date.now()
      });

      logger.info('User dashboard data generated', {
        userId,
        ordersCount: recentOrders.length,
        recommendationsCount: recommendations.length
      });

      return dashboardData;

    } catch (error) {
      logger.error('Failed to generate user dashboard', {
        userId,
        error: error.message,
        stack: error.stack
      });
      throw new AppError('Failed to load dashboard data', 500);
    }
  }

  // Get enhanced user profile with statistics
  async getUserProfile(userId) {
    const user = await User.findById(userId)
      .select('-password -refreshTokens')
      .lean();

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Calculate profile completeness
    const profileFields = ['name', 'email', 'phone', 'addresses', 'preferences'];
    const completedFields = profileFields.filter(field => {
      if (field === 'addresses') return user.addresses && user.addresses.length > 0;
      if (field === 'preferences') return user.preferences && Object.keys(user.preferences).length > 0;
      return user[field];
    });

    const profileCompletion = Math.round((completedFields.length / profileFields.length) * 100);

    // Get membership details
    const totalOrders = await Order.countDocuments({ 
      user: userId, 
      status: { $in: ['delivered', 'completed'] } 
    });

    const totalSpent = await Order.aggregate([
      { 
        $match: { 
          user: userId, 
          status: { $in: ['delivered', 'completed'] } 
        } 
      },
      { 
        $group: { 
          _id: null, 
          total: { $sum: '$totalAmount' } 
        } 
      }
    ]);

    const membershipTier = this.calculateMembershipTier(totalSpent[0]?.total || 0, totalOrders);

    return {
      ...user,
      profileCompletion,
      membershipTier,
      statistics: {
        totalOrders,
        totalSpent: totalSpent[0]?.total || 0,
        joinedDays: Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      }
    };
  }

  // Get comprehensive order summary
  async getOrderSummary(userId) {
    const [
      totalOrders,
      completedOrders,
      pendingOrders,
      totalSpent,
      averageOrderValue,
      monthlyOrders
    ] = await Promise.all([
      Order.countDocuments({ user: userId }),
      Order.countDocuments({ user: userId, status: { $in: ['delivered', 'completed'] } }),
      Order.countDocuments({ user: userId, status: { $in: ['pending', 'processing', 'shipped'] } }),
      this.getTotalSpent(userId),
      this.getAverageOrderValue(userId),
      this.getMonthlyOrderStats(userId)
    ]);

    return {
      total: totalOrders,
      completed: completedOrders,
      pending: pendingOrders,
      totalSpent,
      averageOrderValue,
      monthlyTrend: monthlyOrders
    };
  }

  // Get recent orders with detailed information
  async getRecentOrders(userId, limit = 5) {
    const orders = await Order.find({ user: userId })
      .populate('items.product', 'name images price brand category')
      .populate('shippingAddress')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return orders.map(order => ({
      ...order,
      items: order.items.map(item => ({
        ...item,
        product: {
          ...item.product,
          image: item.product.images?.[0]?.url
        }
      }))
    }));
  }

  // Get user's favorite products based on wishlist and purchase history
  async getFavoriteProducts(userId, limit = 8) {
    const user = await User.findById(userId).populate({
      path: 'wishlist',
      populate: {
        path: 'product',
        select: 'name images price brand rating reviewCount category isActive'
      }
    });

    let favorites = user?.wishlist?.filter(item => item.product?.isActive) || [];

    // If wishlist is empty or has few items, get from purchase history
    if (favorites.length < limit) {
      const recentPurchases = await Order.aggregate([
        { $match: { user: userId, status: { $in: ['delivered', 'completed'] } } },
        { $unwind: '$items' },
        { $group: { _id: '$items.product', count: { $sum: 1 }, lastPurchase: { $max: '$createdAt' } } },
        { $sort: { count: -1, lastPurchase: -1 } },
        { $limit: limit - favorites.length },
        { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
        { $unwind: '$product' },
        { $match: { 'product.isActive': true } },
        { $project: { product: 1, purchaseCount: '$count' } }
      ]);

      const purchasedProducts = recentPurchases.map(item => ({
        product: item.product,
        addedAt: item.lastPurchase,
        source: 'purchase_history',
        purchaseCount: item.purchaseCount
      }));

      favorites = [...favorites, ...purchasedProducts];
    }

    return favorites.slice(0, limit);
  }

  // Get personalized product recommendations
  async getPersonalizedRecommendations(userId, limit = 12) {
    try {
      // Get user's purchase history and preferences
      const [purchaseHistory, userPreferences, wishlist] = await Promise.all([
        this.getUserPurchaseHistory(userId),
        this.getUserPreferences(userId),
        this.getUserWishlist(userId)
      ]);

      // Algorithm: Category-based + Brand preference + Rating-based recommendations
      const categoryScores = this.calculateCategoryPreferences(purchaseHistory);
      const brandScores = this.calculateBrandPreferences(purchaseHistory);

      // Get potential recommendations
      const recommendations = await Product.aggregate([
        { 
          $match: { 
            isActive: true,
            _id: { $nin: [...purchaseHistory.map(p => p._id), ...wishlist.map(w => w._id)] }
          } 
        },
        {
          $addFields: {
            categoryScore: {
              $cond: {
                if: { $in: ['$category', Object.keys(categoryScores)] },
                then: { $multiply: [categoryScores, 2] },
                else: 1
              }
            },
            brandScore: {
              $cond: {
                if: { $in: ['$brand', Object.keys(brandScores)] },
                then: { $multiply: [brandScores, 1.5] },
                else: 1
              }
            },
            ratingScore: { $multiply: ['$rating', 0.2] },
            popularityScore: { $multiply: ['$reviewCount', 0.01] }
          }
        },
        {
          $addFields: {
            recommendationScore: {
              $add: ['$categoryScore', '$brandScore', '$ratingScore', '$popularityScore']
            }
          }
        },
        { $sort: { recommendationScore: -1, rating: -1, reviewCount: -1 } },
        { $limit: limit * 2 }, // Get more to filter out of stock items
        {
          $lookup: {
            from: 'categories',
            localField: 'category',
            foreignField: '_id',
            as: 'categoryInfo'
          }
        },
        { $unwind: { path: '$categoryInfo', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            name: 1,
            images: 1,
            price: 1,
            brand: 1,
            rating: 1,
            reviewCount: 1,
            category: '$categoryInfo.name',
            recommendationScore: 1,
            stock: 1,
            isActive: 1
          }
        }
      ]);

      // Filter and prioritize in-stock items
      const inStockRecommendations = recommendations.filter(item => item.stock > 0);
      const finalRecommendations = inStockRecommendations.slice(0, limit);

      logger.info('Personalized recommendations generated', {
        userId,
        totalFound: recommendations.length,
        inStock: inStockRecommendations.length,
        returned: finalRecommendations.length
      });

      return finalRecommendations.map(item => ({
        ...item,
        recommendationReason: this.getRecommendationReason(item, categoryScores, brandScores)
      }));

    } catch (error) {
      logger.error('Failed to generate recommendations', { userId, error: error.message });
      
      // Fallback to popular products
      return await Product.find({ isActive: true, isFeatured: true, stock: { $gt: 0 } })
        .populate('category', 'name')
        .sort({ rating: -1, reviewCount: -1 })
        .limit(limit)
        .lean();
    }
  }

  // Get user spending analytics
  async getSpendingAnalytics(userId) {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const [
      monthlySpending,
      categorySpending,
      yearlyComparison,
      savingsOpportunities
    ] = await Promise.all([
      this.getMonthlySpending(userId, sixMonthsAgo),
      this.getCategorySpending(userId),
      this.getYearlySpendingComparison(userId),
      this.getSavingsOpportunities(userId)
    ]);

    return {
      monthly: monthlySpending,
      byCategory: categorySpending,
      yearlyComparison,
      savings: savingsOpportunities,
      insights: this.generateSpendingInsights(monthlySpending, categorySpending)
    };
  }

  // Get user activity feed
  async getActivityFeed(userId, limit = 10) {
    const activities = [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Recent orders
    const recentOrders = await Order.find({
      user: userId,
      createdAt: { $gte: thirtyDaysAgo }
    }).sort({ createdAt: -1 }).limit(5).lean();

    recentOrders.forEach(order => {
      activities.push({
        type: 'order',
        action: 'placed',
        description: `Order #${order.orderNumber} placed`,
        amount: order.totalAmount,
        date: order.createdAt,
        metadata: { orderId: order._id, status: order.status }
      });
    });

    // Recent reviews
    const recentReviews = await Review.find({
      user: userId,
      createdAt: { $gte: thirtyDaysAgo }
    }).populate('product', 'name').sort({ createdAt: -1 }).limit(3).lean();

    recentReviews.forEach(review => {
      activities.push({
        type: 'review',
        action: 'posted',
        description: `Reviewed ${review.product.name}`,
        rating: review.rating,
        date: review.createdAt,
        metadata: { productId: review.product._id, reviewId: review._id }
      });
    });

    // Sort by date and limit
    return activities
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, limit);
  }

  // Get user achievements and badges
  async getUserAchievements(userId) {
    const [
      totalOrders,
      totalSpent,
      reviewsCount,
      loyaltyDays
    ] = await Promise.all([
      Order.countDocuments({ user: userId, status: { $in: ['delivered', 'completed'] } }),
      this.getTotalSpent(userId),
      Review.countDocuments({ user: userId }),
      this.getUserLoyaltyDays(userId)
    ]);

    const achievements = [];

    // Order-based achievements
    if (totalOrders >= 1) achievements.push({ type: 'first_order', name: 'First Purchase', icon: '🛒', earned: true });
    if (totalOrders >= 5) achievements.push({ type: 'regular_customer', name: 'Regular Customer', icon: '⭐', earned: true });
    if (totalOrders >= 10) achievements.push({ type: 'loyal_customer', name: 'Loyal Customer', icon: '👑', earned: true });
    if (totalOrders >= 25) achievements.push({ type: 'vip_customer', name: 'VIP Customer', icon: '💎', earned: true });

    // Spending-based achievements
    if (totalSpent >= 10000) achievements.push({ type: 'big_spender', name: 'Big Spender', icon: '💰', earned: true });
    if (totalSpent >= 50000) achievements.push({ type: 'premium_member', name: 'Premium Member', icon: '🏆', earned: true });

    // Review-based achievements
    if (reviewsCount >= 1) achievements.push({ type: 'first_review', name: 'First Review', icon: '📝', earned: true });
    if (reviewsCount >= 5) achievements.push({ type: 'reviewer', name: 'Active Reviewer', icon: '🗣️', earned: true });

    // Loyalty-based achievements
    if (loyaltyDays >= 30) achievements.push({ type: 'monthly_member', name: 'Monthly Member', icon: '📅', earned: true });
    if (loyaltyDays >= 365) achievements.push({ type: 'yearly_member', name: 'Yearly Member', icon: '🎂', earned: true });

    return {
      total: achievements.length,
      achievements,
      nextAchievement: this.getNextAchievement(totalOrders, totalSpent, reviewsCount, loyaltyDays)
    };
  }

  // Helper methods
  calculateMembershipTier(totalSpent, totalOrders) {
    if (totalSpent >= 100000 || totalOrders >= 50) return { name: 'Platinum', benefits: ['Free Shipping', 'Priority Support', 'Exclusive Deals', '15% Discount'] };
    if (totalSpent >= 50000 || totalOrders >= 25) return { name: 'Gold', benefits: ['Free Shipping', 'Priority Support', '10% Discount'] };
    if (totalSpent >= 20000 || totalOrders >= 10) return { name: 'Silver', benefits: ['Free Shipping', '5% Discount'] };
    return { name: 'Bronze', benefits: ['Welcome Bonus'] };
  }

  calculateCategoryPreferences(purchaseHistory) {
    const categoryCount = {};
    purchaseHistory.forEach(item => {
      categoryCount[item.category] = (categoryCount[item.category] || 0) + 1;
    });
    return categoryCount;
  }

  calculateBrandPreferences(purchaseHistory) {
    const brandCount = {};
    purchaseHistory.forEach(item => {
      brandCount[item.brand] = (brandCount[item.brand] || 0) + 1;
    });
    return brandCount;
  }

  getRecommendationReason(item, categoryScores, brandScores) {
    if (brandScores[item.brand]) return `Popular in ${item.brand} brand`;
    if (categoryScores[item.category]) return `Based on your interest in ${item.category}`;
    if (item.rating >= 4.5) return 'Highly rated product';
    return 'Trending product';
  }

  // Additional helper methods would be implemented here...
  async getTotalSpent(userId) {
    const result = await Order.aggregate([
      { $match: { user: userId, status: { $in: ['delivered', 'completed'] } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    return result[0]?.total || 0;
  }

  async getAverageOrderValue(userId) {
    const result = await Order.aggregate([
      { $match: { user: userId, status: { $in: ['delivered', 'completed'] } } },
      { $group: { _id: null, avg: { $avg: '$totalAmount' } } }
    ]);
    return result[0]?.avg || 0;
  }

  async getUserPurchaseHistory(userId) {
    return await Order.aggregate([
      { $match: { user: userId, status: { $in: ['delivered', 'completed'] } } },
      { $unwind: '$items' },
      { $lookup: { from: 'products', localField: 'items.product', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $lookup: { from: 'categories', localField: 'product.category', foreignField: '_id', as: 'category' } },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: '$product._id',
          name: '$product.name',
          brand: '$product.brand',
          category: '$category.name',
          price: '$items.price',
          quantity: '$items.quantity'
        }
      }
    ]);
  }

  async getUserWishlist(userId) {
    const user = await User.findById(userId).populate('wishlist.product', '_id').lean();
    return user?.wishlist?.map(item => ({ _id: item.product._id })) || [];
  }

  async getUserPreferences(userId) {
    const user = await User.findById(userId).select('preferences').lean();
    return user?.preferences || {};
  }

  async getMonthlySpending(userId, fromDate) {
    return await Order.aggregate([
      { 
        $match: { 
          user: userId, 
          status: { $in: ['delivered', 'completed'] },
          createdAt: { $gte: fromDate }
        } 
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          total: { $sum: '$totalAmount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);
  }

  async getCategorySpending(userId) {
    return await Order.aggregate([
      { $match: { user: userId, status: { $in: ['delivered', 'completed'] } } },
      { $unwind: '$items' },
      { $lookup: { from: 'products', localField: 'items.product', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $lookup: { from: 'categories', localField: 'product.category', foreignField: '_id', as: 'category' } },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$category.name',
          total: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          count: { $sum: '$items.quantity' }
        }
      },
      { $sort: { total: -1 } }
    ]);
  }

  async getMonthlyOrderStats(userId) {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    return await Order.aggregate([
      { 
        $match: { 
          user: userId,
          createdAt: { $gte: sixMonthsAgo }
        } 
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 },
          total: { $sum: '$totalAmount' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);
  }

  async getYearlySpendingComparison(userId) {
    const thisYear = new Date().getFullYear();
    const lastYear = thisYear - 1;

    const [thisYearSpending, lastYearSpending] = await Promise.all([
      this.getYearSpending(userId, thisYear),
      this.getYearSpending(userId, lastYear)
    ]);

    return {
      thisYear: thisYearSpending,
      lastYear: lastYearSpending,
      growth: lastYearSpending > 0 ? ((thisYearSpending - lastYearSpending) / lastYearSpending) * 100 : 0
    };
  }

  async getYearSpending(userId, year) {
    const result = await Order.aggregate([
      { 
        $match: { 
          user: userId, 
          status: { $in: ['delivered', 'completed'] },
          createdAt: {
            $gte: new Date(year, 0, 1),
            $lt: new Date(year + 1, 0, 1)
          }
        } 
      },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    return result[0]?.total || 0;
  }

  async getSavingsOpportunities(userId) {
    // This would implement logic to find potential savings
    // For now, return a placeholder
    return {
      potentialSavings: 0,
      recommendations: []
    };
  }

  generateSpendingInsights(monthlySpending, categorySpending) {
    const insights = [];
    
    if (monthlySpending.length >= 2) {
      const recent = monthlySpending[monthlySpending.length - 1];
      const previous = monthlySpending[monthlySpending.length - 2];
      
      if (recent.total > previous.total) {
        insights.push(`Your spending increased by ₹${(recent.total - previous.total).toLocaleString()} this month`);
      } else {
        insights.push(`You saved ₹${(previous.total - recent.total).toLocaleString()} this month`);
      }
    }

    if (categorySpending.length > 0) {
      const topCategory = categorySpending[0];
      insights.push(`${topCategory._id} is your top spending category with ₹${topCategory.total.toLocaleString()}`);
    }

    return insights;
  }

  async getUserLoyaltyDays(userId) {
    const user = await User.findById(userId).select('createdAt').lean();
    if (!user) return 0;
    
    return Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24));
  }

  getNextAchievement(totalOrders, totalSpent, reviewsCount, loyaltyDays) {
    if (totalOrders < 1) return { name: 'First Purchase', progress: 0, target: 1, type: 'order' };
    if (totalOrders < 5) return { name: 'Regular Customer', progress: totalOrders, target: 5, type: 'order' };
    if (totalOrders < 10) return { name: 'Loyal Customer', progress: totalOrders, target: 10, type: 'order' };
    if (totalSpent < 10000) return { name: 'Big Spender', progress: totalSpent, target: 10000, type: 'spending' };
    if (reviewsCount < 1) return { name: 'First Review', progress: 0, target: 1, type: 'review' };
    
    return null;
  }

  // Clear cache when needed
  clearCache(userId = null) {
    if (userId) {
      this.cache.delete(`dashboard_${userId}`);
    } else {
      this.cache.clear();
    }
  }
}

export default new UserAnalyticsService();
