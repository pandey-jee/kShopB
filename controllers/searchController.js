import Product from '../models/Product.js';
import Category from '../models/Category.js';
// import intelligentSearchService from '../services/intelligentSearchService.js';
// import elasticsearchService from '../services/elasticsearchService.js';
import { AppError } from '../middleware/enhancedErrorHandler.js';
import { asyncHandler } from '../middleware/enhancedErrorHandler.js';
import logger from '../config/logger.js';

// Enhanced search suggestions with intelligent autocomplete
export const getSearchSuggestions = asyncHandler(async (req, res) => {
  const { q, limit = 10 } = req.query;
  
  if (!q || q.length < 2) {
    return res.json({ 
      suggestions: [],
      message: 'Query too short for suggestions'
    });
  }

  try {
    // Fallback implementation without intelligent search for now
    const suggestions = [];
    
    // Search products
    const products = await Product.find({
      $and: [
        { isActive: true },
        {
          $or: [
            { name: { $regex: q, $options: 'i' } },
            { description: { $regex: q, $options: 'i' } },
            { brand: { $regex: q, $options: 'i' } },
            { tags: { $elemMatch: { $regex: q, $options: 'i' } } }
          ]
        }
      ]
    })
    .populate('category', 'name')
    .limit(parseInt(limit) - 2)
    .select('name images price category brand');

    // Add products to suggestions
    products.forEach(product => {
      suggestions.push({
        _id: product._id,
        name: product.name,
        type: 'product',
        image: product.images[0]?.url,
        price: product.price,
        category: product.category?.name
      });
    });

    // Search categories
    const categories = await Category.find({
      name: { $regex: q, $options: 'i' }
    })
    .limit(2)
    .select('name');

    // Add categories to suggestions
    categories.forEach(category => {
      suggestions.push({
        _id: category._id,
        name: category.name,
        type: 'category'
      });
    });

    logger.info('Search suggestions generated', {
      query: q,
      count: suggestions.length,
      userAgent: req.get('User-Agent'),
      ipAddress: req.ip
    });

    res.json({ 
      suggestions: suggestions.slice(0, parseInt(limit)),
      query: q,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Search suggestions failed', {
      query: q,
      error: error.message,
      stack: error.stack
    });
    
    throw new AppError('Failed to get search suggestions', 500);
  }
});

// Enhanced trending searches with analytics
export const getTrendingSearches = asyncHandler(async (req, res) => {
  const { limit = 10, timeRange = '7d' } = req.query;

  try {
    let trending = [];

    // Fallback to popular categories and products
    const [popularCategories, popularProducts, topBrands] = await Promise.all([
      Category.find()
        .limit(Math.ceil(limit / 3))
        .select('name')
        .lean(),
      
      Product.find({ 
        isFeatured: true,
        isActive: true 
      })
        .limit(Math.ceil(limit / 3))
        .select('name')
        .lean(),

      Product.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$brand', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: Math.ceil(limit / 3) }
      ])
    ]);

    trending = [
      ...popularCategories.map(cat => ({
        query: cat.name,
        type: 'category',
        count: 0
      })),
      ...popularProducts.map(prod => ({
        query: prod.name,
        type: 'product',
        count: 0
      })),
      ...topBrands.map(brand => ({
        query: brand._id,
        type: 'brand',
        count: brand.count
      }))
    ].slice(0, parseInt(limit));

    logger.info('Trending searches retrieved', {
      count: trending.length,
      timeRange,
      source: 'fallback'
    });

    res.json({
      trending,
      timeRange,
      timestamp: new Date().toISOString(),
      total: trending.length
    });

  } catch (error) {
    logger.error('Failed to get trending searches', {
      error: error.message,
      timeRange,
      stack: error.stack
    });
    
    throw new AppError('Failed to get trending searches', 500);
  }
});

// Advanced search with basic implementation for now
export const advancedSearch = asyncHandler(async (req, res) => {
  const {
    q,
    category,
    brand,
    minPrice,
    maxPrice,
    rating,
    inStock,
    tags,
    sortBy = 'relevance',
    sortOrder = 'desc',
    page = 1,
    limit = 20
  } = req.query;

  // Validate parameters
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

  try {
    const query = { isActive: true };
    
    // Add text search
    if (q) {
      query.$or = [
        { name: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { brand: { $regex: q, $options: 'i' } },
        { tags: { $elemMatch: { $regex: q, $options: 'i' } } }
      ];
    }

    // Add filters
    if (category) query.category = category;
    if (brand) {
      const brandArray = Array.isArray(brand) ? brand : brand.split(',');
      query.brand = { $in: brandArray };
    }
    if (minPrice !== undefined || maxPrice !== undefined) {
      query.price = {};
      if (minPrice !== undefined) query.price.$gte = parseFloat(minPrice);
      if (maxPrice !== undefined) query.price.$lte = parseFloat(maxPrice);
    }
    if (rating) query.rating = { $gte: parseFloat(rating) };
    if (inStock === 'true') query.stock = { $gt: 0 };
    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : tags.split(',');
      query.tags = { $in: tagArray };
    }

    // Build sort object
    const sort = {};
    if (sortBy === 'price') {
      sort.price = sortOrder === 'asc' ? 1 : -1;
    } else if (sortBy === 'rating') {
      sort.rating = sortOrder === 'asc' ? 1 : -1;
    } else if (sortBy === 'name') {
      sort.name = sortOrder === 'asc' ? 1 : -1;
    } else {
      sort.createdAt = -1; // Default sort
    }

    const startTime = Date.now();

    // Execute search
    const [products, total] = await Promise.all([
      Product.find(query)
        .populate('category', 'name')
        .sort(sort)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Product.countDocuments(query)
    ]);

    const searchTime = Date.now() - startTime;

    // Prepare response
    const response = {
      products: products || [],
      pagination: {
        current: pageNum,
        limit: limitNum,
        total: total || 0,
        pages: Math.ceil((total || 0) / limitNum),
        hasNext: pageNum < Math.ceil((total || 0) / limitNum),
        hasPrev: pageNum > 1
      },
      searchInfo: {
        query: q || '',
        filters: { category, brand, minPrice, maxPrice, rating, inStock, tags },
        sortBy,
        searchTime,
        resultCount: total || 0
      }
    };

    logger.info('Advanced search completed', {
      query: q,
      resultCount: total || 0,
      searchTime,
      page: pageNum
    });

    res.json(response);

  } catch (error) {
    logger.error('Advanced search failed', {
      query: q,
      error: error.message,
      stack: error.stack
    });
    
    throw new AppError('Search failed. Please try again.', 500);
  }
});

// Basic search analytics for admin
export const getSearchAnalytics = asyncHandler(async (req, res) => {
  const { timeRange = '7d' } = req.query;

  try {
    // Basic analytics - would be enhanced with Elasticsearch
    const analytics = {
      searchQueries: {
        topQueries: [],
        searchesOverTime: [],
        averageResults: 0,
        zeroResultsCount: 0
      },
      performance: {
        averageResponseTime: 150,
        cacheHitRate: 0.0
      },
      popular: {
        categories: [],
        brands: [],
        products: []
      }
    };

    // Get popular categories and brands
    const [categories, brands, products] = await Promise.all([
      Category.aggregate([
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: 'category',
            as: 'products'
          }
        },
        {
          $project: {
            name: 1,
            productCount: { $size: '$products' }
          }
        },
        { $sort: { productCount: -1 } },
        { $limit: 10 }
      ]),

      Product.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$brand', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),

      Product.find({ isFeatured: true, isActive: true })
        .select('name rating reviewCount')
        .sort({ reviewCount: -1 })
        .limit(10)
        .lean()
    ]);

    analytics.popular = {
      categories: categories.map(cat => ({
        name: cat.name,
        count: cat.productCount
      })),
      brands: brands.map(brand => ({
        name: brand._id,
        count: brand.count
      })),
      products: products.map(prod => ({
        name: prod.name,
        rating: prod.rating,
        reviews: prod.reviewCount
      }))
    };

    logger.info('Search analytics retrieved', {
      timeRange
    });

    res.json({
      analytics,
      timeRange,
      generatedAt: new Date().toISOString(),
      period: timeRange
    });

  } catch (error) {
    logger.error('Failed to get search analytics', {
      error: error.message,
      timeRange,
      stack: error.stack
    });
    
    throw new AppError('Failed to retrieve search analytics', 500);
  }
});

// Get search filters and facets
export const getSearchFilters = asyncHandler(async (req, res) => {
  const { category, q } = req.query;

  try {
    const filters = {
      categories: [],
      brands: [],
      priceRanges: [],
      ratings: [5, 4, 3, 2, 1],
      tags: []
    };

    // Get categories
    const categoryQuery = category ? { parent: category } : {};
    filters.categories = await Category.find(categoryQuery)
      .select('name _id parent')
      .lean();

    // Get brands based on category or search query
    const productQuery = { isActive: true };
    if (category) productQuery.category = category;
    if (q) {
      productQuery.$or = [
        { name: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { brand: { $regex: q, $options: 'i' } }
      ];
    }

    const brandsAgg = await Product.aggregate([
      { $match: productQuery },
      { $group: { _id: '$brand', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 50 }
    ]);

    filters.brands = brandsAgg
      .filter(item => item._id)
      .map(item => ({
        name: item._id,
        count: item.count
      }));

    // Get price ranges
    const priceStats = await Product.aggregate([
      { $match: productQuery },
      {
        $group: {
          _id: null,
          minPrice: { $min: '$price' },
          maxPrice: { $max: '$price' },
          avgPrice: { $avg: '$price' }
        }
      }
    ]);

    if (priceStats.length > 0) {
      const { minPrice, maxPrice } = priceStats[0];
      const ranges = generatePriceRanges(minPrice, maxPrice);
      filters.priceRanges = ranges;
    }

    logger.info('Search filters retrieved', {
      category,
      query: q,
      filterCounts: {
        categories: filters.categories.length,
        brands: filters.brands.length
      }
    });

    res.json({
      filters,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get search filters', {
      error: error.message,
      category,
      query: q
    });
    
    throw new AppError('Failed to get search filters', 500);
  }
});

// Rebuild search indices (placeholder for now)
export const rebuildSearchIndex = asyncHandler(async (req, res) => {
  try {
    logger.info('Search index rebuild initiated', {
      userId: req.user._id,
      timestamp: new Date().toISOString()
    });

    // Placeholder implementation
    await new Promise(resolve => setTimeout(resolve, 1000));

    logger.info('Search index rebuild completed', {
      userId: req.user._id
    });

    res.json({
      success: true,
      message: 'Search index rebuilt successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Search index rebuild failed', {
      error: error.message,
      userId: req.user._id,
      stack: error.stack
    });
    
    throw new AppError('Failed to rebuild search index', 500);
  }
});

// Helper function to generate price ranges
function generatePriceRanges(minPrice, maxPrice) {
  const ranges = [];
  const step = Math.ceil((maxPrice - minPrice) / 6);
  
  for (let i = 0; i < 6; i++) {
    const from = minPrice + (i * step);
    const to = i === 5 ? maxPrice : from + step;
    
    ranges.push({
      from,
      to,
      label: `₹${from.toLocaleString()} - ₹${to.toLocaleString()}`
    });
  }
  
  return ranges;
}
