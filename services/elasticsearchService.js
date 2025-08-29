import { Client } from '@elastic/elasticsearch';
import logger from '../config/logger.js';

class ElasticsearchService {
  constructor() {
    this.client = null;
    this.isEnabled = false;
    this.indices = {
      products: 'products',
      search_analytics: 'search_analytics',
      user_behavior: 'user_behavior'
    };
  }

  // Initialize Elasticsearch connection
  async initialize() {
    try {
      if (!process.env.ELASTICSEARCH_URL) {
        logger.warn('Elasticsearch URL not configured, using fallback search');
        return;
      }

      this.client = new Client({
        node: process.env.ELASTICSEARCH_URL,
        auth: process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD ? {
          username: process.env.ELASTICSEARCH_USERNAME,
          password: process.env.ELASTICSEARCH_PASSWORD
        } : undefined,
        requestTimeout: 30000,
        maxRetries: 3,
        ssl: {
          rejectUnauthorized: process.env.NODE_ENV === 'production'
        }
      });

      // Test connection
      await this.client.ping();
      
      // Create indices if they don't exist
      await this.createIndices();
      
      this.isEnabled = true;
      logger.info('Elasticsearch connected and indices created successfully');
      
    } catch (error) {
      logger.error('Failed to initialize Elasticsearch', {
        error: error.message,
        stack: error.stack
      });
      this.isEnabled = false;
    }
  }

  // Create Elasticsearch indices with proper mappings
  async createIndices() {
    try {
      // Products index mapping
      const productMapping = {
        mappings: {
          properties: {
            name: {
              type: 'text',
              analyzer: 'standard',
              fields: {
                keyword: { type: 'keyword' },
                autocomplete: {
                  type: 'text',
                  analyzer: 'autocomplete',
                  search_analyzer: 'standard'
                }
              }
            },
            description: {
              type: 'text',
              analyzer: 'standard'
            },
            brand: {
              type: 'text',
              fields: {
                keyword: { type: 'keyword' }
              }
            },
            category: {
              type: 'object',
              properties: {
                id: { type: 'keyword' },
                name: {
                  type: 'text',
                  fields: {
                    keyword: { type: 'keyword' }
                  }
                },
                path: { type: 'keyword' }
              }
            },
            price: { type: 'float' },
            originalPrice: { type: 'float' },
            discount: { type: 'float' },
            rating: { type: 'float' },
            reviewCount: { type: 'integer' },
            stock: { type: 'integer' },
            tags: {
              type: 'text',
              fields: {
                keyword: { type: 'keyword' }
              }
            },
            features: {
              type: 'text',
              analyzer: 'standard'
            },
            specifications: {
              type: 'object',
              dynamic: true
            },
            images: {
              type: 'object',
              properties: {
                url: { type: 'keyword' },
                alt: { type: 'text' }
              }
            },
            isActive: { type: 'boolean' },
            isFeatured: { type: 'boolean' },
            createdAt: { type: 'date' },
            updatedAt: { type: 'date' },
            popularity: { type: 'float' },
            salesRank: { type: 'integer' },
            searchBoost: { type: 'float', index: false }
          }
        },
        settings: {
          analysis: {
            analyzer: {
              autocomplete: {
                tokenizer: 'autocomplete',
                filter: ['lowercase']
              }
            },
            tokenizer: {
              autocomplete: {
                type: 'edge_ngram',
                min_gram: 2,
                max_gram: 20,
                token_chars: ['letter', 'digit']
              }
            }
          }
        }
      };

      // Search analytics index mapping
      const analyticsMapping = {
        mappings: {
          properties: {
            query: {
              type: 'text',
              fields: {
                keyword: { type: 'keyword' }
              }
            },
            userId: { type: 'keyword' },
            sessionId: { type: 'keyword' },
            timestamp: { type: 'date' },
            resultsCount: { type: 'integer' },
            filters: {
              type: 'object',
              dynamic: true
            },
            clickedProducts: {
              type: 'object',
              properties: {
                productId: { type: 'keyword' },
                position: { type: 'integer' },
                timestamp: { type: 'date' }
              }
            },
            userAgent: { type: 'text' },
            ipAddress: { type: 'ip' },
            location: {
              type: 'object',
              properties: {
                country: { type: 'keyword' },
                region: { type: 'keyword' },
                city: { type: 'keyword' }
              }
            }
          }
        }
      };

      // User behavior index mapping
      const behaviorMapping = {
        mappings: {
          properties: {
            userId: { type: 'keyword' },
            sessionId: { type: 'keyword' },
            timestamp: { type: 'date' },
            action: { type: 'keyword' },
            productId: { type: 'keyword' },
            category: { type: 'keyword' },
            searchQuery: { type: 'text' },
            timeSpent: { type: 'integer' },
            deviceType: { type: 'keyword' },
            source: { type: 'keyword' },
            metadata: {
              type: 'object',
              dynamic: true
            }
          }
        }
      };

      // Create indices
      const indices = [
        { name: this.indices.products, mapping: productMapping },
        { name: this.indices.search_analytics, mapping: analyticsMapping },
        { name: this.indices.user_behavior, mapping: behaviorMapping }
      ];

      for (const index of indices) {
        const exists = await this.client.indices.exists({ index: index.name });
        
        if (!exists) {
          await this.client.indices.create({
            index: index.name,
            body: index.mapping
          });
          logger.info(`Created Elasticsearch index: ${index.name}`);
        } else {
          logger.info(`Elasticsearch index already exists: ${index.name}`);
        }
      }

    } catch (error) {
      logger.error('Failed to create Elasticsearch indices', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  // Index a product
  async indexProduct(product) {
    if (!this.isEnabled) return;

    try {
      const doc = {
        name: product.name,
        description: product.description,
        brand: product.brand,
        category: {
          id: product.category?._id?.toString(),
          name: product.category?.name,
          path: product.category?.path
        },
        price: product.price,
        originalPrice: product.originalPrice,
        discount: product.discount,
        rating: product.rating || 0,
        reviewCount: product.reviewCount || 0,
        stock: product.stock,
        tags: product.tags || [],
        features: Array.isArray(product.features) ? product.features.join(' ') : product.features,
        specifications: product.specifications || {},
        images: product.images || [],
        isActive: product.isActive,
        isFeatured: product.isFeatured,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
        popularity: product.popularity || 0,
        salesRank: product.salesRank || 999999,
        searchBoost: this.calculateSearchBoost(product)
      };

      await this.client.index({
        index: this.indices.products,
        id: product._id.toString(),
        body: doc
      });

      logger.debug('Product indexed successfully', { productId: product._id });

    } catch (error) {
      logger.error('Failed to index product', {
        productId: product._id,
        error: error.message
      });
    }
  }

  // Bulk index products
  async bulkIndexProducts(products) {
    if (!this.isEnabled || !products.length) return;

    try {
      const body = [];

      for (const product of products) {
        body.push({
          index: {
            _index: this.indices.products,
            _id: product._id.toString()
          }
        });

        body.push({
          name: product.name,
          description: product.description,
          brand: product.brand,
          category: {
            id: product.category?._id?.toString(),
            name: product.category?.name,
            path: product.category?.path
          },
          price: product.price,
          originalPrice: product.originalPrice,
          discount: product.discount,
          rating: product.rating || 0,
          reviewCount: product.reviewCount || 0,
          stock: product.stock,
          tags: product.tags || [],
          features: Array.isArray(product.features) ? product.features.join(' ') : product.features,
          specifications: product.specifications || {},
          images: product.images || [],
          isActive: product.isActive,
          isFeatured: product.isFeatured,
          createdAt: product.createdAt,
          updatedAt: product.updatedAt,
          popularity: product.popularity || 0,
          salesRank: product.salesRank || 999999,
          searchBoost: this.calculateSearchBoost(product)
        });
      }

      const response = await this.client.bulk({
        refresh: true,
        body
      });

      if (response.errors) {
        logger.error('Bulk indexing had errors', {
          errors: response.items.filter(item => item.index?.error)
        });
      } else {
        logger.info('Bulk indexed products successfully', { count: products.length });
      }

    } catch (error) {
      logger.error('Failed to bulk index products', {
        error: error.message,
        count: products.length
      });
    }
  }

  // Advanced search with Elasticsearch
  async search(query, filters = {}, options = {}) {
    if (!this.isEnabled) {
      throw new Error('Elasticsearch not available');
    }

    try {
      const {
        page = 1,
        limit = 20,
        sortBy = 'relevance',
        sortOrder = 'desc'
      } = options;

      const from = (page - 1) * limit;

      // Build search query
      const searchQuery = this.buildSearchQuery(query, filters);
      
      // Build sort options
      const sort = this.buildSortOptions(sortBy, sortOrder);

      const searchParams = {
        index: this.indices.products,
        body: {
          query: searchQuery,
          sort,
          from,
          size: limit,
          highlight: {
            fields: {
              name: { number_of_fragments: 0 },
              description: { fragment_size: 150, number_of_fragments: 1 },
              brand: { number_of_fragments: 0 }
            }
          },
          aggregations: this.buildAggregations(filters)
        }
      };

      const response = await this.client.search(searchParams);

      return {
        products: response.hits.hits.map(hit => ({
          ...hit._source,
          _id: hit._id,
          _score: hit._score,
          highlight: hit.highlight
        })),
        total: response.hits.total.value,
        aggregations: response.aggregations,
        took: response.took
      };

    } catch (error) {
      logger.error('Elasticsearch search failed', {
        query,
        filters,
        error: error.message
      });
      throw error;
    }
  }

  // Build complex search query
  buildSearchQuery(query, filters) {
    const must = [];
    const filter = [];
    const should = [];

    // Text search
    if (query && query.trim()) {
      const textQuery = {
        bool: {
          should: [
            // Exact match boost
            {
              multi_match: {
                query: query,
                fields: ['name^3', 'brand^2', 'category.name^2'],
                type: 'phrase',
                boost: 3
              }
            },
            // Fuzzy match
            {
              multi_match: {
                query: query,
                fields: [
                  'name.autocomplete^2',
                  'name^2',
                  'description',
                  'brand',
                  'tags',
                  'features'
                ],
                type: 'best_fields',
                fuzziness: 'AUTO',
                prefix_length: 1
              }
            },
            // Wildcard for partial matches
            {
              query_string: {
                query: `*${query}*`,
                fields: ['name^2', 'brand', 'tags'],
                boost: 0.5
              }
            }
          ],
          minimum_should_match: 1
        }
      };
      
      must.push(textQuery);
    }

    // Filters
    filter.push({ term: { isActive: true } });

    if (filters.category) {
      filter.push({ term: { 'category.id': filters.category } });
    }

    if (filters.brand) {
      if (Array.isArray(filters.brand)) {
        filter.push({ terms: { 'brand.keyword': filters.brand } });
      } else {
        filter.push({ term: { 'brand.keyword': filters.brand } });
      }
    }

    if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
      const priceRange = {};
      if (filters.priceMin !== undefined) priceRange.gte = filters.priceMin;
      if (filters.priceMax !== undefined) priceRange.lte = filters.priceMax;
      filter.push({ range: { price: priceRange } });
    }

    if (filters.rating) {
      filter.push({ range: { rating: { gte: filters.rating } } });
    }

    if (filters.inStock) {
      filter.push({ range: { stock: { gt: 0 } } });
    }

    if (filters.tags && filters.tags.length > 0) {
      filter.push({ terms: { 'tags.keyword': filters.tags } });
    }

    // Boost popular and featured products
    should.push(
      { term: { isFeatured: { value: true, boost: 1.5 } } },
      { range: { rating: { gte: 4, boost: 1.2 } } },
      { range: { reviewCount: { gte: 10, boost: 1.1 } } }
    );

    return {
      bool: {
        must: must.length > 0 ? must : [{ match_all: {} }],
        filter,
        should,
        boost: 1.0
      }
    };
  }

  // Build sort options
  buildSortOptions(sortBy, sortOrder) {
    const order = sortOrder === 'asc' ? 'asc' : 'desc';

    switch (sortBy) {
      case 'price':
        return [{ price: { order } }];
      case 'rating':
        return [{ rating: { order } }, { reviewCount: { order } }];
      case 'newest':
        return [{ createdAt: { order: 'desc' } }];
      case 'popularity':
        return [{ popularity: { order: 'desc' } }, { reviewCount: { order: 'desc' } }];
      case 'discount':
        return [{ discount: { order: 'desc' } }];
      case 'relevance':
      default:
        return ['_score', { searchBoost: { order: 'desc' } }, { rating: { order: 'desc' } }];
    }
  }

  // Build aggregations for faceted search
  buildAggregations(currentFilters) {
    return {
      brands: {
        terms: {
          field: 'brand.keyword',
          size: 20
        }
      },
      categories: {
        terms: {
          field: 'category.name.keyword',
          size: 10
        }
      },
      price_ranges: {
        range: {
          field: 'price',
          ranges: [
            { to: 1000 },
            { from: 1000, to: 5000 },
            { from: 5000, to: 10000 },
            { from: 10000, to: 25000 },
            { from: 25000, to: 50000 },
            { from: 50000 }
          ]
        }
      },
      rating_ranges: {
        range: {
          field: 'rating',
          ranges: [
            { from: 4 },
            { from: 3, to: 4 },
            { from: 2, to: 3 },
            { from: 1, to: 2 }
          ]
        }
      },
      avg_price: {
        avg: {
          field: 'price'
        }
      },
      max_price: {
        max: {
          field: 'price'
        }
      },
      min_price: {
        min: {
          field: 'price'
        }
      }
    };
  }

  // Get search suggestions with autocomplete
  async getSuggestions(query, limit = 10) {
    if (!this.isEnabled || !query || query.length < 2) {
      return [];
    }

    try {
      const response = await this.client.search({
        index: this.indices.products,
        body: {
          query: {
            bool: {
              must: [
                {
                  multi_match: {
                    query: query,
                    fields: ['name.autocomplete^3', 'brand.autocomplete^2'],
                    type: 'bool_prefix'
                  }
                }
              ],
              filter: [
                { term: { isActive: true } }
              ]
            }
          },
          size: limit,
          _source: ['name', 'brand', 'category.name', 'images', 'price']
        }
      });

      return response.hits.hits.map(hit => ({
        _id: hit._id,
        name: hit._source.name,
        brand: hit._source.brand,
        category: hit._source.category?.name,
        image: hit._source.images?.[0]?.url,
        price: hit._source.price,
        type: 'product'
      }));

    } catch (error) {
      logger.error('Failed to get search suggestions', {
        query,
        error: error.message
      });
      return [];
    }
  }

  // Calculate search boost score for products
  calculateSearchBoost(product) {
    let boost = 1.0;

    // Featured products get higher boost
    if (product.isFeatured) boost += 0.5;

    // Rating boost
    if (product.rating) {
      boost += (product.rating / 5) * 0.3;
    }

    // Review count boost
    if (product.reviewCount) {
      boost += Math.min(product.reviewCount / 100, 0.2);
    }

    // Stock availability boost
    if (product.stock > 0) {
      boost += 0.1;
    }

    // Discount boost
    if (product.discount > 0) {
      boost += Math.min(product.discount / 100, 0.1);
    }

    return boost;
  }

  // Log search analytics
  async logSearchAnalytics(searchData) {
    if (!this.isEnabled) return;

    try {
      await this.client.index({
        index: this.indices.search_analytics,
        body: {
          ...searchData,
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to log search analytics', { error: error.message });
    }
  }

  // Log user behavior
  async logUserBehavior(behaviorData) {
    if (!this.isEnabled) return;

    try {
      await this.client.index({
        index: this.indices.user_behavior,
        body: {
          ...behaviorData,
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to log user behavior', { error: error.message });
    }
  }

  // Get search analytics
  async getSearchAnalytics(timeRange = '7d') {
    if (!this.isEnabled) return null;

    try {
      const now = new Date();
      const from = new Date(now.getTime() - this.parseTimeRange(timeRange));

      const response = await this.client.search({
        index: this.indices.search_analytics,
        body: {
          query: {
            range: {
              timestamp: {
                gte: from,
                lte: now
              }
            }
          },
          aggregations: {
            top_queries: {
              terms: {
                field: 'query.keyword',
                size: 20
              }
            },
            searches_over_time: {
              date_histogram: {
                field: 'timestamp',
                calendar_interval: 'day'
              }
            },
            avg_results_count: {
              avg: {
                field: 'resultsCount'
              }
            },
            zero_results: {
              filter: {
                term: {
                  resultsCount: 0
                }
              }
            }
          },
          size: 0
        }
      });

      return response.aggregations;

    } catch (error) {
      logger.error('Failed to get search analytics', { error: error.message });
      return null;
    }
  }

  // Helper method to parse time range
  parseTimeRange(timeRange) {
    const multipliers = {
      'd': 24 * 60 * 60 * 1000,
      'h': 60 * 60 * 1000,
      'm': 60 * 1000
    };

    const match = timeRange.match(/^(\d+)([dhm])$/);
    if (!match) return 7 * 24 * 60 * 60 * 1000; // Default to 7 days

    const [, number, unit] = match;
    return parseInt(number) * multipliers[unit];
  }

  // Delete product from index
  async deleteProduct(productId) {
    if (!this.isEnabled) return;

    try {
      await this.client.delete({
        index: this.indices.products,
        id: productId.toString()
      });
      logger.debug('Product deleted from index', { productId });
    } catch (error) {
      if (error.statusCode !== 404) {
        logger.error('Failed to delete product from index', {
          productId,
          error: error.message
        });
      }
    }
  }

  // Refresh indices
  async refreshIndices() {
    if (!this.isEnabled) return;

    try {
      await this.client.indices.refresh({
        index: Object.values(this.indices).join(',')
      });
      logger.info('Elasticsearch indices refreshed');
    } catch (error) {
      logger.error('Failed to refresh indices', { error: error.message });
    }
  }

  // Health check
  async healthCheck() {
    if (!this.isEnabled) {
      return { status: 'disabled' };
    }

    try {
      const health = await this.client.cluster.health();
      return {
        status: 'connected',
        cluster: health.cluster_name,
        status_color: health.status,
        active_shards: health.active_shards,
        indices: Object.keys(this.indices).length
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }
}

// Create and export singleton instance
const elasticsearchService = new ElasticsearchService();

export default elasticsearchService;
