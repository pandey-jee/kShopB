// Enhanced Search Configuration
// Phase 2.2: Advanced Search Optimization

export const searchConfig = {
  // Elasticsearch Configuration
  elasticsearch: {
    enabled: process.env.ELASTICSEARCH_ENABLED === 'true',
    node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
    apiKey: process.env.ELASTICSEARCH_API_KEY,
    auth: process.env.ELASTICSEARCH_AUTH ? {
      username: process.env.ELASTICSEARCH_USERNAME,
      password: process.env.ELASTICSEARCH_PASSWORD
    } : undefined,
    
    // Index configurations
    indices: {
      products: 'panditji_products',
      analytics: 'panditji_search_analytics',
      behavior: 'panditji_user_behavior'
    },
    
    // Search settings
    maxResultWindow: 10000,
    timeout: '30s',
    requestTimeout: 30000,
    pingTimeout: 3000,
    
    // Performance settings
    shards: {
      products: 1,
      analytics: 1,
      behavior: 1
    },
    replicas: 0,
    
    // Refresh intervals
    refreshInterval: '1s'
  },

  // Intelligent Search Settings
  search: {
    // Default search parameters
    defaults: {
      page: 1,
      limit: 20,
      maxLimit: 100,
      sortBy: 'relevance',
      sortOrder: 'desc',
      includeFacets: true
    },
    
    // Fuzzy search settings
    fuzzy: {
      enabled: true,
      fuzziness: 'AUTO',
      prefixLength: 0,
      maxExpansions: 50,
      transpositions: true
    },
    
    // Autocomplete settings
    autocomplete: {
      minChars: 2,
      maxSuggestions: 10,
      includeCategories: true,
      includeBrands: true,
      includeProducts: true
    },
    
    // Search weights for relevance scoring
    fieldWeights: {
      name: 3.0,
      brand: 2.0,
      description: 1.0,
      tags: 1.5,
      category: 1.2
    },
    
    // Synonym expansion
    synonyms: {
      enabled: true,
      customSynonyms: {
        'car': ['automobile', 'vehicle', 'auto'],
        'bike': ['motorcycle', 'motorbike', 'two wheeler'],
        'brake': ['braking', 'brake pad', 'brake disc'],
        'engine': ['motor', 'powerplant'],
        'oil': ['lubricant', 'fluid'],
        'filter': ['filtration', 'filtering'],
        'light': ['lamp', 'bulb', 'lighting'],
        'tire': ['tyre', 'wheel'],
        'battery': ['cell', 'power source'],
        'gear': ['transmission', 'gearbox']
      }
    },
    
    // Cache settings
    cache: {
      enabled: true,
      ttl: 300, // 5 minutes
      maxSize: 1000,
      type: 'memory' // 'memory' or 'redis'
    }
  },

  // Analytics Configuration
  analytics: {
    enabled: true,
    
    // Search analytics
    trackSearches: true,
    trackZeroResults: true,
    trackClickThrough: true,
    trackConversions: true,
    
    // User behavior tracking
    trackUserBehavior: true,
    sessionTimeout: 1800, // 30 minutes
    
    // Analytics retention
    retentionPeriod: {
      searches: '90d',
      behavior: '30d',
      aggregations: '1y'
    }
  },

  // Performance and Monitoring
  performance: {
    // Query timeouts
    queryTimeout: 5000, // 5 seconds
    aggregationTimeout: 10000, // 10 seconds
    
    // Circuit breaker settings
    circuitBreaker: {
      enabled: true,
      threshold: 5, // failures
      timeout: 60000, // 1 minute
      resetTimeout: 300000 // 5 minutes
    },
    
    // Rate limiting
    rateLimit: {
      enabled: true,
      windowMs: 60000, // 1 minute
      maxRequests: 100
    }
  },

  // Feature Flags
  features: {
    elasticsearchEnabled: process.env.ELASTICSEARCH_ENABLED === 'true',
    fuseJsEnabled: true,
    synonymExpansion: true,
    semanticSearch: false, // Future enhancement
    autoComplete: true,
    searchAnalytics: true,
    userBehaviorTracking: true,
    smartFiltering: true,
    personalizedResults: false // Future enhancement
  },

  // Error handling
  errorHandling: {
    fallbackToMongoDB: true,
    retryAttempts: 3,
    retryDelay: 1000,
    logErrors: true
  }
};

// Environment-specific overrides
if (process.env.NODE_ENV === 'production') {
  searchConfig.elasticsearch.replicas = 1;
  searchConfig.search.cache.ttl = 600; // 10 minutes in production
  searchConfig.analytics.retentionPeriod.searches = '180d'; // 6 months in production
} else if (process.env.NODE_ENV === 'development') {
  searchConfig.elasticsearch.timeout = '60s';
  searchConfig.performance.queryTimeout = 10000; // 10 seconds for debugging
}

export default searchConfig;
