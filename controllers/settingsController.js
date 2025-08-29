// @desc    Get all settings
// @route   GET /api/admin/settings
// @access  Private/Admin
export const getSettings = async (req, res) => {
  try {
    // Default settings structure
    const defaultSettings = {
      site: {
        name: 'Panditji Auto Connect',
        description: 'Your trusted auto parts store',
        logo: '/logo.png',
        favicon: '/favicon.ico',
        contactEmail: 'info@panditjiautoconnect.com',
        contactPhone: '+91-9876543210',
        address: '123 Auto Street, Delhi, India'
      },
      payment: {
        razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
        codEnabled: true,
        onlinePaymentEnabled: true,
        minimumOrderAmount: 500
      },
      shipping: {
        freeShippingThreshold: 1000,
        standardShippingRate: 50,
        expressShippingRate: 150,
        estimatedDeliveryDays: '3-5'
      },
      notifications: {
        emailNotifications: true,
        smsNotifications: false,
        pushNotifications: true,
        orderConfirmation: true,
        shipmentUpdates: true
      },
      security: {
        twoFactorAuth: false,
        sessionTimeout: 30,
        passwordPolicy: 'medium',
        ipWhitelist: []
      },
      analytics: {
        googleAnalyticsId: '',
        facebookPixelId: '',
        trackingEnabled: true
      }
    };

    res.json({
      success: true,
      settings: defaultSettings
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings'
    });
  }
};

// @desc    Update settings
// @route   PUT /api/admin/settings
// @access  Private/Admin
export const updateSettings = async (req, res) => {
  try {
    const { settings } = req.body;

    // In a real implementation, you would save to database
    // For now, we'll just return the updated settings
    res.json({
      success: true,
      message: 'Settings updated successfully',
      settings
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update settings'
    });
  }
};

// @desc    Reset settings to default
// @route   POST /api/admin/settings/reset
// @access  Private/Admin
export const resetSettings = async (req, res) => {
  try {
    const defaultSettings = {
      site: {
        name: 'Panditji Auto Connect',
        description: 'Your trusted auto parts store',
        logo: '/logo.png',
        favicon: '/favicon.ico',
        contactEmail: 'info@panditjiautoconnect.com',
        contactPhone: '+91-9876543210',
        address: '123 Auto Street, Delhi, India'
      },
      payment: {
        razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
        codEnabled: true,
        onlinePaymentEnabled: true,
        minimumOrderAmount: 500
      },
      shipping: {
        freeShippingThreshold: 1000,
        standardShippingRate: 50,
        expressShippingRate: 150,
        estimatedDeliveryDays: '3-5'
      },
      notifications: {
        emailNotifications: true,
        smsNotifications: false,
        pushNotifications: true,
        orderConfirmation: true,
        shipmentUpdates: true
      },
      security: {
        twoFactorAuth: false,
        sessionTimeout: 30,
        passwordPolicy: 'medium',
        ipWhitelist: []
      },
      analytics: {
        googleAnalyticsId: '',
        facebookPixelId: '',
        trackingEnabled: true
      }
    };

    res.json({
      success: true,
      message: 'Settings reset to default successfully',
      settings: defaultSettings
    });
  } catch (error) {
    console.error('Reset settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset settings'
    });
  }
};
