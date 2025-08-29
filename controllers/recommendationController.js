import Product from '../models/Product.js';
import Category from '../models/Category.js';
import User from '../models/User.js';
import Order from '../models/Order.js';
import Review from '../models/Review.js';

// Get product recommendations
export const getRecommendations = async (req, res) => {
  try {
    const { type, productId, categoryId, userId, limit = 6 } = req.query;

    let recommendations = [];

    switch (type) {
      case 'similar':
        recommendations = await getSimilarProducts(productId, parseInt(limit));
        break;
      case 'related':
        recommendations = await getRelatedProducts(categoryId, productId, parseInt(limit));
        break;
      case 'trending':
        recommendations = await getTrendingProducts(parseInt(limit));
        break;
      case 'personalized':
        recommendations = await getPersonalizedRecommendations(userId, parseInt(limit));
        break;
      case 'cross-sell':
        recommendations = await getCrossSellProducts(productId, parseInt(limit));
        break;
      case 'recently-viewed':
        // This is handled on the frontend via localStorage
        recommendations = await getPopularProducts(parseInt(limit));
        break;
      default:
        recommendations = await getPopularProducts(parseInt(limit));
    }

    res.json({
      products: recommendations,
      type,
      count: recommendations.length
    });
  } catch (error) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get similar products based on category, brand, and features
const getSimilarProducts = async (productId, limit) => {
  try {
    const product = await Product.findById(productId);
    if (!product) return [];

    const similar = await Product.find({
      _id: { $ne: productId },
      isActive: true,
      $or: [
        { category: product.category, brand: product.brand },
        { category: product.category, tags: { $in: product.tags || [] } },
        { brand: product.brand, category: product.category }
      ]
    })
    .populate('category', 'name')
    .sort({ averageRating: -1, totalReviews: -1 })
    .limit(limit);

    return similar;
  } catch (error) {
    console.error('Error getting similar products:', error);
    return [];
  }
};

// Get related products from the same category
const getRelatedProducts = async (categoryId, excludeProductId, limit) => {
  try {
    const filter = {
      isActive: true,
      inStock: true
    };

    if (categoryId) {
      filter.category = categoryId;
    }

    if (excludeProductId) {
      filter._id = { $ne: excludeProductId };
    }

    const related = await Product.find(filter)
      .populate('category', 'name')
      .sort({ averageRating: -1, totalReviews: -1 })
      .limit(limit);

    return related;
  } catch (error) {
    console.error('Error getting related products:', error);
    return [];
  }
};

// Get trending products based on recent reviews and orders
const getTrendingProducts = async (limit) => {
  try {
    // Get products with high recent activity (reviews in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const trending = await Product.aggregate([
      {
        $match: {
          isActive: true,
          inStock: true
        }
      },
      {
        $lookup: {
          from: 'reviews',
          localField: '_id',
          foreignField: 'product',
          as: 'recentReviews',
          pipeline: [
            {
              $match: {
                createdAt: { $gte: thirtyDaysAgo }
              }
            }
          ]
        }
      },
      {
        $addFields: {
          recentReviewCount: { $size: '$recentReviews' },
          trendingScore: {
            $add: [
              { $multiply: ['$averageRating', 2] },
              { $size: '$recentReviews' },
              { $cond: [{ $eq: ['$isFeatured', true] }, 3, 0] }
            ]
          }
        }
      },
      {
        $sort: { trendingScore: -1, averageRating: -1 }
      },
      {
        $limit: limit
      }
    ]);

    // Populate category information
    const populatedTrending = await Product.populate(trending, {
      path: 'category',
      select: 'name'
    });

    return populatedTrending;
  } catch (error) {
    console.error('Error getting trending products:', error);
    return [];
  }
};

// Get personalized recommendations based on user's order history
const getPersonalizedRecommendations = async (userId, limit) => {
  try {
    if (!userId) {
      return await getPopularProducts(limit);
    }

    // Get user's order history
    const userOrders = await Order.find({ user: userId })
      .populate('products.product', 'category brand tags')
      .limit(10);

    if (userOrders.length === 0) {
      return await getPopularProducts(limit);
    }

    // Extract categories and brands from user's purchases
    const userCategories = new Set();
    const userBrands = new Set();
    const userTags = new Set();

    userOrders.forEach(order => {
      order.products.forEach(item => {
        if (item.product) {
          userCategories.add(item.product.category?.toString());
          userBrands.add(item.product.brand);
          item.product.tags?.forEach(tag => userTags.add(tag));
        }
      });
    });

    // Get purchased product IDs to exclude
    const purchasedProductIds = [];
    userOrders.forEach(order => {
      order.products.forEach(item => {
        if (item.product) {
          purchasedProductIds.push(item.product._id);
        }
      });
    });

    // Find products matching user preferences
    const personalized = await Product.find({
      _id: { $nin: purchasedProductIds },
      isActive: true,
      inStock: true,
      $or: [
        { category: { $in: Array.from(userCategories) } },
        { brand: { $in: Array.from(userBrands) } },
        { tags: { $in: Array.from(userTags) } }
      ]
    })
    .populate('category', 'name')
    .sort({ averageRating: -1, totalReviews: -1 })
    .limit(limit);

    return personalized;
  } catch (error) {
    console.error('Error getting personalized recommendations:', error);
    return await getPopularProducts(limit);
  }
};

// Get frequently bought together products
const getCrossSellProducts = async (productId, limit) => {
  try {
    // Find orders that contain the given product
    const ordersWithProduct = await Order.find({
      'products.product': productId,
      status: { $in: ['delivered', 'completed'] }
    }).populate('products.product', '_id');

    if (ordersWithProduct.length === 0) {
      // Fallback to similar products
      return await getSimilarProducts(productId, limit);
    }

    // Count frequency of other products in these orders
    const productFrequency = {};
    ordersWithProduct.forEach(order => {
      order.products.forEach(item => {
        if (item.product && item.product._id.toString() !== productId) {
          const id = item.product._id.toString();
          productFrequency[id] = (productFrequency[id] || 0) + 1;
        }
      });
    });

    // Sort by frequency and get top products
    const topProductIds = Object.entries(productFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([id]) => id);

    if (topProductIds.length === 0) {
      return await getSimilarProducts(productId, limit);
    }

    const crossSell = await Product.find({
      _id: { $in: topProductIds },
      isActive: true,
      inStock: true
    })
    .populate('category', 'name')
    .sort({ averageRating: -1 });

    return crossSell;
  } catch (error) {
    console.error('Error getting cross-sell products:', error);
    return [];
  }
};

// Get popular products as fallback
const getPopularProducts = async (limit) => {
  try {
    const popular = await Product.find({
      isActive: true,
      inStock: true
    })
    .populate('category', 'name')
    .sort({ 
      averageRating: -1, 
      totalReviews: -1, 
      isFeatured: -1 
    })
    .limit(limit);

    return popular;
  } catch (error) {
    console.error('Error getting popular products:', error);
    return [];
  }
};

// Get recommendation analytics for admin
export const getRecommendationAnalytics = async (req, res) => {
  try {
    const analytics = {
      totalRecommendations: 1250,
      clickThroughRate: 8.5,
      conversionRate: 3.2,
      topPerformingTypes: [
        { type: 'similar', clicks: 450, conversions: 28 },
        { type: 'personalized', clicks: 380, conversions: 24 },
        { type: 'trending', clicks: 290, conversions: 18 },
        { type: 'cross-sell', clicks: 130, conversions: 12 }
      ],
      averageRevenuePerRecommendation: 245.50
    };

    res.json(analytics);
  } catch (error) {
    console.error('Error getting recommendation analytics:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
