import Product from '../models/Product.js';
import Category from '../models/Category.js';

// Get search suggestions
export const getSearchSuggestions = async (req, res) => {
  try {
    const { q, limit = 8 } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ suggestions: [] });
    }

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

    // Get unique brands that match
    const brands = await Product.distinct('brand', {
      brand: { $regex: q, $options: 'i' },
      isActive: true
    });

    // Add brands to suggestions (limit to 2)
    brands.slice(0, 2).forEach(brand => {
      if (brand) {
        suggestions.push({
          _id: `brand-${brand}`,
          name: brand,
          type: 'brand'
        });
      }
    });

    res.json({ suggestions: suggestions.slice(0, parseInt(limit)) });
  } catch (error) {
    console.error('Error getting search suggestions:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get trending searches
export const getTrendingSearches = async (req, res) => {
  try {
    // In a real app, this would be based on actual search analytics
    // For now, return popular categories and products
    const popularCategories = await Category.find()
      .limit(3)
      .select('name');
    
    const popularProducts = await Product.find({ isFeatured: true })
      .limit(3)
      .select('name');

    const trending = [
      ...popularCategories.map(cat => cat.name),
      ...popularProducts.map(prod => prod.name),
      'brake pads',
      'engine oil',
      'headlights'
    ];

    res.json({ trending: trending.slice(0, 6) });
  } catch (error) {
    console.error('Error getting trending searches:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Advanced search with filters
export const advancedSearch = async (req, res) => {
  try {
    const {
      q,
      page = 1,
      limit = 12,
      sortBy = 'relevance',
      order = 'desc',
      minPrice,
      maxPrice,
      categories,
      brands,
      inStock,
      featured,
      rating
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build search query
    const searchQuery = {
      isActive: true
    };

    // Text search
    if (q && q.length > 0) {
      searchQuery.$or = [
        { name: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { brand: { $regex: q, $options: 'i' } },
        { tags: { $elemMatch: { $regex: q, $options: 'i' } } }
      ];
    }

    // Price range filter
    if (minPrice || maxPrice) {
      searchQuery.price = {};
      if (minPrice) searchQuery.price.$gte = parseFloat(minPrice);
      if (maxPrice) searchQuery.price.$lte = parseFloat(maxPrice);
    }

    // Category filter
    if (categories && categories.length > 0) {
      const categoryArray = Array.isArray(categories) ? categories : categories.split(',');
      searchQuery.category = { $in: categoryArray };
    }

    // Brand filter
    if (brands && brands.length > 0) {
      const brandArray = Array.isArray(brands) ? brands : brands.split(',');
      searchQuery.brand = { $in: brandArray };
    }

    // Stock filter
    if (inStock === 'true') {
      searchQuery.inStock = true;
      searchQuery.stockQuantity = { $gt: 0 };
    }

    // Featured filter
    if (featured === 'true') {
      searchQuery.isFeatured = true;
    }

    // Rating filter
    if (rating && parseFloat(rating) > 0) {
      searchQuery.averageRating = { $gte: parseFloat(rating) };
    }

    // Build sort options
    let sortOptions = {};
    switch (sortBy) {
      case 'price':
        sortOptions = { price: order === 'asc' ? 1 : -1 };
        break;
      case 'rating':
        sortOptions = { averageRating: -1, totalReviews: -1 };
        break;
      case 'newest':
        sortOptions = { createdAt: -1 };
        break;
      case 'name':
        sortOptions = { name: 1 };
        break;
      case 'popularity':
        sortOptions = { totalReviews: -1, averageRating: -1 };
        break;
      default: // relevance
        if (q && q.length > 0) {
          // For text search, use text score for relevance
          sortOptions = { score: { $meta: 'textScore' } };
        } else {
          sortOptions = { isFeatured: -1, averageRating: -1 };
        }
    }

    // Execute search
    let query = Product.find(searchQuery);
    
    // Add text score for relevance sorting
    if (q && q.length > 0 && sortBy === 'relevance') {
      query = query.select({ score: { $meta: 'textScore' } });
    }

    const products = await query
      .populate('category', 'name')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    const totalProducts = await Product.countDocuments(searchQuery);
    const totalPages = Math.ceil(totalProducts / parseInt(limit));

    // Get aggregated data for filters
    const aggregationPipeline = [
      { $match: searchQuery },
      {
        $group: {
          _id: null,
          minPrice: { $min: '$price' },
          maxPrice: { $max: '$price' },
          brands: { $addToSet: '$brand' },
          avgRating: { $avg: '$averageRating' }
        }
      }
    ];

    const aggregation = await Product.aggregate(aggregationPipeline);
    const filterData = aggregation[0] || {};

    // Get available categories
    const availableCategories = await Category.find({
      _id: { $in: await Product.distinct('category', searchQuery) }
    }).select('name');

    res.json({
      products,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalProducts,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      },
      filters: {
        priceRange: {
          min: filterData.minPrice || 0,
          max: filterData.maxPrice || 0
        },
        availableBrands: (filterData.brands || []).filter(Boolean),
        availableCategories,
        avgRating: filterData.avgRating || 0
      },
      searchQuery: q,
      appliedFilters: {
        minPrice,
        maxPrice,
        categories,
        brands,
        inStock,
        featured,
        rating
      }
    });
  } catch (error) {
    console.error('Error in advanced search:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get search analytics (for admin)
export const getSearchAnalytics = async (req, res) => {
  try {
    // This would typically come from a search analytics collection
    // For now, return mock data
    const analytics = {
      totalSearches: 1250,
      topQueries: [
        { query: 'brake pads', count: 125 },
        { query: 'engine oil', count: 98 },
        { query: 'headlights', count: 87 },
        { query: 'battery', count: 76 },
        { query: 'tires', count: 65 }
      ],
      noResultQueries: [
        { query: 'vintage parts', count: 15 },
        { query: 'custom wheels', count: 12 }
      ],
      avgResultsPerSearch: 8.5,
      conversionRate: 12.8
    };

    res.json(analytics);
  } catch (error) {
    console.error('Error getting search analytics:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
