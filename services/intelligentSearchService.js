import Fuse from 'fuse.js';
import natural from 'natural';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import elasticsearchService from './elasticsearchService.js';
import logger from '../config/logger.js';

class IntelligentSearchService {
  constructor() {
    this.fuseIndex = null;
    this.stemmer = natural.PorterStemmer;
    this.analyzer = new natural.SentimentAnalyzer('English', 
      natural.PorterStemmer, ['negation']);
    this.synonyms = new Map();
    this.searchCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    
    this.initializeSynonyms();
  }

  // Initialize search service
  async initialize() {
    try {
      await this.buildFuseIndex();
      await elasticsearchService.initialize();
      logger.info('Intelligent search service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize intelligent search service', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  // Build Fuse.js index for fallback search
  async buildFuseIndex() {
    try {
      const products = await Product.find({ isActive: true })
        .populate('category', 'name path')
        .lean();

      const fuseOptions = {
        keys: [
          { name: 'name', weight: 0.4 },
          { name: 'description', weight: 0.2 },
          { name: 'brand', weight: 0.3 },
          { name: 'category.name', weight: 0.2 },
          { name: 'tags', weight: 0.15 },
          { name: 'features', weight: 0.1 }
        ],
        threshold: 0.6,
        distance: 100,
        includeScore: true,
        includeMatches: true,
        minMatchCharLength: 2,
        shouldSort: true,
        findAllMatches: true,
        ignoreLocation: true
      };

      this.fuseIndex = new Fuse(products, fuseOptions);
      logger.info('Fuse.js search index built successfully', { 
        productCount: products.length 
      });

    } catch (error) {
      logger.error('Failed to build Fuse.js index', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  // Initialize synonyms for query expansion
  initializeSynonyms() {
    const synonymMapping = {
      // Auto parts synonyms
      'car': ['automobile', 'vehicle', 'auto'],
      'bike': ['motorcycle', 'motorbike', 'two-wheeler'],
      'engine': ['motor', 'powerplant'],
      'brake': ['braking system', 'brake pad', 'brake disc'],
      'tire': ['tyre', 'wheel', 'rubber'],
      'battery': ['cell', 'power source', 'accumulator'],
      'oil': ['lubricant', 'fluid', 'grease'],
      'filter': ['strainer', 'cleaner'],
      'headlight': ['headlamp', 'front light'],
      'mirror': ['rear view', 'side mirror'],
      'horn': ['hooter', 'siren'],
      'seat': ['chair', 'seating'],
      'steering': ['wheel', 'control'],
      
      // Quality descriptors
      'good': ['quality', 'excellent', 'premium', 'high-grade'],
      'cheap': ['affordable', 'budget', 'economical', 'low-cost'],
      'durable': ['long-lasting', 'sturdy', 'robust', 'reliable'],
      'new': ['latest', 'modern', 'fresh', 'recent'],
      'old': ['vintage', 'classic', 'antique'],
      
      // Colors
      'black': ['dark', 'charcoal'],
      'white': ['light', 'pearl'],
      'red': ['crimson', 'scarlet'],
      'blue': ['azure', 'navy'],
      'green': ['emerald', 'olive'],
      'silver': ['metallic', 'chrome']
    };

    // Build bidirectional synonym map
    for (const [key, synonyms] of Object.entries(synonymMapping)) {
      this.synonyms.set(key, synonyms);
      
      // Add reverse mappings
      synonyms.forEach(synonym => {
        if (!this.synonyms.has(synonym)) {
          this.synonyms.set(synonym, [key]);
        } else {
          this.synonyms.get(synonym).push(key);
        }
      });
    }

    logger.info('Synonyms initialized', { 
      synonymCount: this.synonyms.size 
    });
  }

  // Expand query with synonyms
  expandQuery(query) {
    if (!query) return query;

    const words = query.toLowerCase().split(/\s+/);
    const expandedWords = new Set(words);

    words.forEach(word => {
      const synonyms = this.synonyms.get(word);
      if (synonyms) {
        synonyms.forEach(synonym => expandedWords.add(synonym));
      }
    });

    return Array.from(expandedWords).join(' ');
  }

  // Intelligent search with multiple fallback strategies
  async search(query, filters = {}, options = {}) {
    const cacheKey = this.generateCacheKey(query, filters, options);
    
    // Check cache first
    if (this.searchCache.has(cacheKey)) {
      const cached = this.searchCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        logger.debug('Returning cached search results', { query, cacheKey });
        return cached.results;
      }
      this.searchCache.delete(cacheKey);
    }

    let results;
    let searchMethod = 'unknown';

    try {
      // Try Elasticsearch first
      if (elasticsearchService.isEnabled) {
        results = await this.elasticsearchSearch(query, filters, options);
        searchMethod = 'elasticsearch';
        logger.debug('Search completed with Elasticsearch', { 
          query, 
          resultCount: results.products?.length 
        });
      } else {
        throw new Error('Elasticsearch not available');
      }

    } catch (error) {
      logger.warn('Elasticsearch search failed, falling back to Fuse.js', {
        query,
        error: error.message
      });

      // Fallback to Fuse.js
      try {
        results = await this.fuseSearch(query, filters, options);
        searchMethod = 'fuse';
        logger.debug('Search completed with Fuse.js', { 
          query, 
          resultCount: results.products?.length 
        });

      } catch (fuseError) {
        logger.error('Fuse.js search also failed, falling back to MongoDB', {
          query,
          error: fuseError.message
        });

        // Ultimate fallback to MongoDB
        results = await this.mongoSearch(query, filters, options);
        searchMethod = 'mongodb';
      }
    }

    // Enhance results with AI insights
    results = await this.enhanceResults(results, query, options);

    // Cache results
    this.searchCache.set(cacheKey, {
      results,
      timestamp: Date.now(),
      method: searchMethod
    });

    // Log search analytics
    this.logSearchAnalytics(query, filters, options, results, searchMethod);

    return results;
  }

  // Elasticsearch search implementation
  async elasticsearchSearch(query, filters, options) {
    const expandedQuery = this.expandQuery(query);
    
    return await elasticsearchService.search(expandedQuery, filters, options);
  }

  // Fuse.js search implementation
  async fuseSearch(query, filters, options) {
    if (!this.fuseIndex) {
      await this.buildFuseIndex();
    }

    const {
      page = 1,
      limit = 20,
      sortBy = 'relevance'
    } = options;

    let results = [];

    if (query && query.trim()) {
      const expandedQuery = this.expandQuery(query);
      const fuseResults = this.fuseIndex.search(expandedQuery);
      results = fuseResults.map(result => ({
        ...result.item,
        _score: 1 - result.score // Convert Fuse score to Elasticsearch-like score
      }));
    } else {
      // Get all products if no query
      const allProducts = await Product.find({ isActive: true })
        .populate('category', 'name path')
        .lean();
      results = allProducts.map(product => ({ ...product, _score: 1 }));
    }

    // Apply filters
    results = this.applyFilters(results, filters);

    // Apply sorting
    results = this.applySorting(results, sortBy);

    // Pagination
    const total = results.length;
    const from = (page - 1) * limit;
    const products = results.slice(from, from + limit);

    return {
      products,
      total,
      aggregations: this.buildSimpleAggregations(results, filters),
      took: 0 // Fuse.js doesn't provide timing
    };
  }

  // MongoDB search fallback
  async mongoSearch(query, filters, options) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'relevance'
    } = options;

    const searchQuery = { isActive: true };
    
    // Text search
    if (query && query.trim()) {
      const expandedQuery = this.expandQuery(query);
      const searchTerms = expandedQuery.split(/\s+/).map(term => 
        new RegExp(term, 'i')
      );

      searchQuery.$or = [
        { name: { $in: searchTerms } },
        { description: { $in: searchTerms } },
        { brand: { $in: searchTerms } },
        { tags: { $in: searchTerms } },
        { features: { $in: searchTerms } }
      ];
    }

    // Apply filters
    this.applyMongoFilters(searchQuery, filters);

    // Build sort options
    const sort = this.buildMongoSort(sortBy);

    const [products, total] = await Promise.all([
      Product.find(searchQuery)
        .populate('category', 'name path')
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Product.countDocuments(searchQuery)
    ]);

    // Add relevance scores
    const productsWithScores = products.map(product => ({
      ...product,
      _score: this.calculateRelevanceScore(product, query)
    }));

    return {
      products: productsWithScores,
      total,
      aggregations: null, // MongoDB doesn't provide aggregations easily
      took: 0
    };
  }

  // Apply filters to search results
  applyFilters(results, filters) {
    let filtered = results;

    if (filters.category) {
      filtered = filtered.filter(product => 
        product.category?._id?.toString() === filters.category ||
        product.category?.id === filters.category
      );
    }

    if (filters.brand) {
      const brands = Array.isArray(filters.brand) ? filters.brand : [filters.brand];
      filtered = filtered.filter(product => 
        brands.includes(product.brand)
      );
    }

    if (filters.priceMin !== undefined) {
      filtered = filtered.filter(product => 
        product.price >= filters.priceMin
      );
    }

    if (filters.priceMax !== undefined) {
      filtered = filtered.filter(product => 
        product.price <= filters.priceMax
      );
    }

    if (filters.rating) {
      filtered = filtered.filter(product => 
        (product.rating || 0) >= filters.rating
      );
    }

    if (filters.inStock) {
      filtered = filtered.filter(product => 
        product.stock > 0
      );
    }

    if (filters.tags && filters.tags.length > 0) {
      filtered = filtered.filter(product => 
        product.tags && product.tags.some(tag => 
          filters.tags.includes(tag)
        )
      );
    }

    return filtered;
  }

  // Apply sorting to search results
  applySorting(results, sortBy) {
    switch (sortBy) {
      case 'price_asc':
        return results.sort((a, b) => a.price - b.price);
      case 'price_desc':
        return results.sort((a, b) => b.price - a.price);
      case 'rating':
        return results.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      case 'newest':
        return results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      case 'popularity':
        return results.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
      case 'relevance':
      default:
        return results.sort((a, b) => (b._score || 0) - (a._score || 0));
    }
  }

  // Apply filters to MongoDB query
  applyMongoFilters(query, filters) {
    if (filters.category) {
      query.category = filters.category;
    }

    if (filters.brand) {
      if (Array.isArray(filters.brand)) {
        query.brand = { $in: filters.brand };
      } else {
        query.brand = filters.brand;
      }
    }

    if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
      query.price = {};
      if (filters.priceMin !== undefined) query.price.$gte = filters.priceMin;
      if (filters.priceMax !== undefined) query.price.$lte = filters.priceMax;
    }

    if (filters.rating) {
      query.rating = { $gte: filters.rating };
    }

    if (filters.inStock) {
      query.stock = { $gt: 0 };
    }

    if (filters.tags && filters.tags.length > 0) {
      query.tags = { $in: filters.tags };
    }
  }

  // Build MongoDB sort options
  buildMongoSort(sortBy) {
    switch (sortBy) {
      case 'price_asc':
        return { price: 1 };
      case 'price_desc':
        return { price: -1 };
      case 'rating':
        return { rating: -1, reviewCount: -1 };
      case 'newest':
        return { createdAt: -1 };
      case 'popularity':
        return { popularity: -1, reviewCount: -1 };
      case 'relevance':
      default:
        return { isFeatured: -1, rating: -1, reviewCount: -1 };
    }
  }

  // Build simple aggregations for Fuse.js results
  buildSimpleAggregations(results, currentFilters) {
    const aggregations = {
      brands: { buckets: [] },
      categories: { buckets: [] },
      price_ranges: { buckets: [] },
      rating_ranges: { buckets: [] }
    };

    // Brand aggregation
    const brandCounts = {};
    results.forEach(product => {
      if (product.brand) {
        brandCounts[product.brand] = (brandCounts[product.brand] || 0) + 1;
      }
    });
    
    aggregations.brands.buckets = Object.entries(brandCounts)
      .map(([key, doc_count]) => ({ key, doc_count }))
      .sort((a, b) => b.doc_count - a.doc_count);

    // Category aggregation
    const categoryCounts = {};
    results.forEach(product => {
      if (product.category?.name) {
        const catName = product.category.name;
        categoryCounts[catName] = (categoryCounts[catName] || 0) + 1;
      }
    });
    
    aggregations.categories.buckets = Object.entries(categoryCounts)
      .map(([key, doc_count]) => ({ key, doc_count }))
      .sort((a, b) => b.doc_count - a.doc_count);

    return aggregations;
  }

  // Calculate relevance score for MongoDB results
  calculateRelevanceScore(product, query) {
    if (!query) return 1;

    let score = 0;
    const queryLower = query.toLowerCase();

    // Name match (highest weight)
    if (product.name && product.name.toLowerCase().includes(queryLower)) {
      score += 3;
    }

    // Brand match
    if (product.brand && product.brand.toLowerCase().includes(queryLower)) {
      score += 2;
    }

    // Description match
    if (product.description && product.description.toLowerCase().includes(queryLower)) {
      score += 1;
    }

    // Tag match
    if (product.tags && product.tags.some(tag => 
        tag.toLowerCase().includes(queryLower))) {
      score += 1;
    }

    // Boost for featured products
    if (product.isFeatured) score += 0.5;

    // Boost for highly rated products
    if (product.rating) score += (product.rating / 5) * 0.3;

    return score;
  }

  // Enhance results with AI insights
  async enhanceResults(results, query, options) {
    if (!results.products || results.products.length === 0) {
      // Try to suggest alternative searches
      results.suggestions = await this.getSearchSuggestions(query);
      results.alternatives = await this.getAlternativeQueries(query);
    }

    // Add personalization if user context is available
    if (options.userId) {
      results.products = await this.personalizeResults(results.products, options.userId);
    }

    // Add related products
    if (results.products.length > 0) {
      results.relatedProducts = await this.getRelatedProducts(results.products[0], 4);
    }

    return results;
  }

  // Get search suggestions for empty results
  async getSearchSuggestions(query) {
    if (!query) return [];

    try {
      // Use word similarity to find closest matches
      const words = query.toLowerCase().split(/\s+/);
      const suggestions = [];

      // Get popular product names and brands
      const popularTerms = await Product.aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: null,
            names: { $push: '$name' },
            brands: { $push: '$brand' }
          }
        }
      ]);

      if (popularTerms.length > 0) {
        const allTerms = [
          ...popularTerms[0].names,
          ...popularTerms[0].brands
        ].filter(Boolean);

        // Find similar terms using simple string similarity
        for (const word of words) {
          for (const term of allTerms) {
            if (term.toLowerCase().includes(word) || 
                natural.JaroWinklerDistance(word, term.toLowerCase()) > 0.7) {
              suggestions.push(term);
              if (suggestions.length >= 5) break;
            }
          }
          if (suggestions.length >= 5) break;
        }
      }

      return [...new Set(suggestions)].slice(0, 5);

    } catch (error) {
      logger.error('Failed to get search suggestions', {
        query,
        error: error.message
      });
      return [];
    }
  }

  // Get alternative search queries
  async getAlternativeQueries(query) {
    if (!query) return [];

    const alternatives = [];
    const words = query.toLowerCase().split(/\s+/);

    // Add synonym-based alternatives
    words.forEach(word => {
      const synonyms = this.synonyms.get(word);
      if (synonyms && synonyms.length > 0) {
        const altQuery = query.toLowerCase().replace(word, synonyms[0]);
        alternatives.push(altQuery);
      }
    });

    // Add partial queries (remove one word at a time)
    if (words.length > 1) {
      words.forEach((_, index) => {
        const partial = words.filter((_, i) => i !== index).join(' ');
        alternatives.push(partial);
      });
    }

    return [...new Set(alternatives)].slice(0, 3);
  }

  // Personalize search results based on user behavior
  async personalizeResults(products, userId) {
    // This would integrate with user behavior analytics
    // For now, return original results
    return products;
  }

  // Get related products
  async getRelatedProducts(product, limit = 4) {
    try {
      const related = await Product.find({
        _id: { $ne: product._id },
        isActive: true,
        $or: [
          { category: product.category?._id || product.category?.id },
          { brand: product.brand },
          { tags: { $in: product.tags || [] } }
        ]
      })
      .limit(limit)
      .select('name images price rating reviewCount')
      .lean();

      return related;

    } catch (error) {
      logger.error('Failed to get related products', {
        productId: product._id,
        error: error.message
      });
      return [];
    }
  }

  // Generate cache key
  generateCacheKey(query, filters, options) {
    const key = JSON.stringify({ query, filters, options });
    return Buffer.from(key).toString('base64').slice(0, 50);
  }

  // Log search analytics
  async logSearchAnalytics(query, filters, options, results, method) {
    try {
      const analyticsData = {
        query: query || '',
        filters,
        options,
        resultsCount: results.total || 0,
        searchMethod: method,
        timestamp: new Date(),
        took: results.took || 0
      };

      // Log to Elasticsearch if available
      if (elasticsearchService.isEnabled) {
        await elasticsearchService.logSearchAnalytics(analyticsData);
      }

      // Log to application logger
      logger.info('Search performed', {
        query,
        resultsCount: results.total || 0,
        method,
        took: results.took || 0
      });

    } catch (error) {
      logger.error('Failed to log search analytics', {
        error: error.message
      });
    }
  }

  // Get intelligent suggestions with autocomplete
  async getIntelligentSuggestions(query, limit = 10) {
    try {
      let suggestions = [];

      // Try Elasticsearch first
      if (elasticsearchService.isEnabled) {
        suggestions = await elasticsearchService.getSuggestions(query, limit);
      }

      // Fallback to Fuse.js if needed
      if (suggestions.length === 0 && this.fuseIndex) {
        const expandedQuery = this.expandQuery(query);
        const fuseResults = this.fuseIndex.search(expandedQuery);
        
        suggestions = fuseResults.slice(0, limit).map(result => ({
          _id: result.item._id,
          name: result.item.name,
          brand: result.item.brand,
          category: result.item.category?.name,
          image: result.item.images?.[0]?.url,
          price: result.item.price,
          type: 'product'
        }));
      }

      // Add category and brand suggestions
      if (suggestions.length < limit) {
        const remaining = limit - suggestions.length;
        
        const categoryMatches = await Category.find({
          name: { $regex: query, $options: 'i' }
        })
        .limit(Math.ceil(remaining / 2))
        .select('name');

        categoryMatches.forEach(category => {
          suggestions.push({
            _id: category._id,
            name: category.name,
            type: 'category'
          });
        });

        // Get brand suggestions
        const brandMatches = await Product.distinct('brand', {
          brand: { $regex: query, $options: 'i' },
          isActive: true
        });

        brandMatches.slice(0, Math.floor(remaining / 2)).forEach(brand => {
          if (brand) {
            suggestions.push({
              _id: `brand-${brand}`,
              name: brand,
              type: 'brand'
            });
          }
        });
      }

      return suggestions.slice(0, limit);

    } catch (error) {
      logger.error('Failed to get intelligent suggestions', {
        query,
        error: error.message
      });
      return [];
    }
  }

  // Clear search cache
  clearCache() {
    this.searchCache.clear();
    logger.info('Search cache cleared');
  }

  // Rebuild search indices
  async rebuildIndices() {
    try {
      await this.buildFuseIndex();
      
      if (elasticsearchService.isEnabled) {
        // Reindex all products in Elasticsearch
        const products = await Product.find({ isActive: true })
          .populate('category', 'name path')
          .lean();
        
        await elasticsearchService.bulkIndexProducts(products);
      }

      this.clearCache();
      logger.info('Search indices rebuilt successfully');

    } catch (error) {
      logger.error('Failed to rebuild search indices', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  // Get search health status
  getHealthStatus() {
    return {
      fuseIndex: this.fuseIndex ? 'ready' : 'not_ready',
      elasticsearch: elasticsearchService.isEnabled ? 'enabled' : 'disabled',
      cacheSize: this.searchCache.size,
      synonymsCount: this.synonyms.size
    };
  }
}

// Create and export singleton instance
const intelligentSearchService = new IntelligentSearchService();

export default intelligentSearchService;
