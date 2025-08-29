// Real automotive parts image URLs
export const AUTOMOTIVE_IMAGES = {
  // Engine Parts
  air_filter: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop',
  oil_filter: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop',
  spark_plugs: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=400&h=400&fit=crop',
  brake_pads: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop',
  
  // Electrical Parts  
  headlights: 'https://images.unsplash.com/photo-1544829099-b9a0c5303bea?w=400&h=400&fit=crop',
  tail_lights: 'https://images.unsplash.com/photo-1544829099-b9a0c5303bea?w=400&h=400&fit=crop',
  battery: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop',
  alternator: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop',
  
  // Suspension Parts
  shock_absorber: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop',
  springs: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop',
  
  // Tires & Wheels
  tire: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop',
  wheel: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop',
  
  // Accessories
  car_cover: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop',
  floor_mats: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop',
  
  // Default fallback
  default: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop'
};

// Product categories with their typical images
export const CATEGORY_IMAGES = {
  'Engine Parts': AUTOMOTIVE_IMAGES.air_filter,
  'Electrical': AUTOMOTIVE_IMAGES.headlights,
  'Suspension': AUTOMOTIVE_IMAGES.shock_absorber,
  'Tires & Wheels': AUTOMOTIVE_IMAGES.tire,
  'Accessories': AUTOMOTIVE_IMAGES.car_cover,
  'Brake System': AUTOMOTIVE_IMAGES.brake_pads
};

// Get random image for a category
export const getRandomImageForCategory = (category) => {
  const categoryImages = {
    'Engine Parts': [
      AUTOMOTIVE_IMAGES.air_filter,
      AUTOMOTIVE_IMAGES.oil_filter,
      AUTOMOTIVE_IMAGES.spark_plugs
    ],
    'Electrical': [
      AUTOMOTIVE_IMAGES.headlights,
      AUTOMOTIVE_IMAGES.tail_lights,
      AUTOMOTIVE_IMAGES.battery,
      AUTOMOTIVE_IMAGES.alternator
    ],
    'Suspension': [
      AUTOMOTIVE_IMAGES.shock_absorber,
      AUTOMOTIVE_IMAGES.springs
    ],
    'Tires & Wheels': [
      AUTOMOTIVE_IMAGES.tire,
      AUTOMOTIVE_IMAGES.wheel
    ],
    'Accessories': [
      AUTOMOTIVE_IMAGES.car_cover,
      AUTOMOTIVE_IMAGES.floor_mats
    ],
    'Brake System': [
      AUTOMOTIVE_IMAGES.brake_pads
    ]
  };
  
  const images = categoryImages[category] || [AUTOMOTIVE_IMAGES.default];
  return images[Math.floor(Math.random() * images.length)];
};

// Brand logos (placeholder URLs - replace with actual brand logo URLs)
export const BRAND_LOGOS = {
  'Bosch': 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=200&h=100&fit=crop',
  'NGK': 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=200&h=100&fit=crop',
  'Mahle': 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=200&h=100&fit=crop',
  'Monroe': 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=200&h=100&fit=crop',
  'Castrol': 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=200&h=100&fit=crop',
  'Michelin': 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=200&h=100&fit=crop'
};

export default {
  AUTOMOTIVE_IMAGES,
  CATEGORY_IMAGES,
  getRandomImageForCategory,
  BRAND_LOGOS
};
