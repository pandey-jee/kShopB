import Order from '../models/Order.js';
import Product from '../models/Product.js';

// @desc    Create new order
// @route   POST /api/orders
// @access  Private
export const createOrder = async (req, res) => {
  try {
    const {
      orderItems,
      shippingAddress,
      paymentMethod,
      itemsPrice,
      taxPrice,
      shippingPrice,
      totalPrice,
      notes
    } = req.body;

    if (orderItems && orderItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No order items'
      });
    }

    // Verify products exist and get current prices
    const orderItemsWithDetails = await Promise.all(
      orderItems.map(async (item) => {
        const product = await Product.findById(item.product);
        if (!product) {
          throw new Error(`Product not found: ${item.product}`);
        }
        
        if (!product.inStock || product.stockQuantity < item.quantity) {
          throw new Error(`Product ${product.name} is out of stock`);
        }

        return {
          ...item,
          name: product.name,
          image: product.image || product.images?.[0]?.url || '/placeholder.svg',
          price: product.price
        };
      })
    );

    const order = new Order({
      user: req.user._id,
      orderItems: orderItemsWithDetails,
      shippingAddress,
      paymentMethod,
      itemsPrice,
      taxPrice,
      shippingPrice,
      totalPrice,
      notes
    });

    const createdOrder = await order.save();

    // Update product stock quantities
    await Promise.all(
      orderItems.map(async (item) => {
        const product = await Product.findById(item.product);
        product.stockQuantity -= item.quantity;
        if (product.stockQuantity <= 0) {
          product.inStock = false;
        }
        await product.save();
      })
    );

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: createdOrder
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error while creating order'
    });
  }
};

// @desc    Get all orders (Admin)
// @route   GET /api/orders
// @access  Private/Admin
export const getOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) {
      filter.orderStatus = req.query.status;
    }

    const orders = await Order.find(filter)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Order.countDocuments(filter);

    res.json({
      success: true,
      data: orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching orders'
    });
  }
};

// @desc    Get single order
// @route   GET /api/orders/:id
// @access  Private
export const getOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email phone')
      .populate('orderItems.product', 'name');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if user owns this order or is admin
    if (order.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this order'
      });
    }

    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching order'
    });
  }
};

// @desc    Update order status (Admin)
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
export const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    order.orderStatus = status;

    if (status === 'delivered') {
      order.isDelivered = true;
      order.deliveredAt = Date.now();
    }

    const updatedOrder = await order.save();

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: updatedOrder
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating order status'
    });
  }
};

// @desc    Get user orders
// @route   GET /api/orders/my-orders
// @access  Private
export const getUserOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const orders = await Order.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Order.countDocuments({ user: req.user._id });

    res.json({
      success: true,
      data: orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get user orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user orders'
    });
  }
};

// @desc    Cancel order
// @route   PUT /api/orders/:id/cancel
// @access  Private
export const cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if user owns this order
    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to cancel this order'
      });
    }

    // Check if order can be cancelled
    if (order.orderStatus === 'delivered' || order.orderStatus === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Order cannot be cancelled'
      });
    }

    order.orderStatus = 'cancelled';
    
    // Restore product stock quantities
    await Promise.all(
      order.orderItems.map(async (item) => {
        const product = await Product.findById(item.product);
        if (product) {
          product.stockQuantity += item.quantity;
          product.inStock = true;
          await product.save();
        }
      })
    );

    const updatedOrder = await order.save();

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      data: updatedOrder
    });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while cancelling order'
    });
  }
};

// @desc    Create COD order
// @route   POST /api/orders/cod
// @access  Private
export const createCODOrder = async (req, res) => {
  try {
    const {
      items,
      shippingAddress,
      itemsPrice,
      shippingPrice,
      totalPrice,
      notes
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No order items'
      });
    }

    // Verify products exist and get current details
    const orderItemsWithDetails = await Promise.all(
      items.map(async (item) => {
        const product = await Product.findById(item.product);
        if (!product) {
          throw new Error(`Product not found: ${item.product}`);
        }
        
        if (!product.inStock || product.stockQuantity < item.quantity) {
          throw new Error(`Product ${product.name} is out of stock`);
        }

        return {
          product: item.product,
          name: product.name,
          image: product.image || product.images?.[0]?.url || '/placeholder.svg',
          price: product.price,
          quantity: item.quantity
        };
      })
    );

    const order = new Order({
      user: req.user._id,
      items: orderItemsWithDetails,
      shippingAddress,
      paymentMethod: 'COD',
      itemsPrice,
      shippingPrice,
      total: totalPrice,
      notes,
      status: 'pending', // COD orders start as pending
      tracking: {
        trackingNumber: `PJA${Date.now()}${Math.floor(Math.random() * 1000)}`,
        carrier: 'Panditji Auto Connect Delivery',
        estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
        currentLocation: 'Order Processing Center',
        statusHistory: [{
          status: 'Order Placed',
          location: 'Order Processing Center',
          timestamp: new Date(),
          description: 'Your order has been placed successfully and is being processed.'
        }]
      }
    });

    const createdOrder = await order.save();

    // Update product stock quantities
    await Promise.all(
      items.map(async (item) => {
        const product = await Product.findById(item.product);
        product.stockQuantity -= item.quantity;
        if (product.stockQuantity <= 0) {
          product.inStock = false;
        }
        await product.save();
      })
    );

    await createdOrder.populate('items.product user');

    res.status(201).json({
      success: true,
      message: 'COD order created successfully',
      order: createdOrder
    });
  } catch (error) {
    console.error('Create COD order error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error while creating order'
    });
  }
};

// @desc    Get order tracking information
// @route   GET /api/orders/:id/tracking
// @access  Private
export const getOrderTracking = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if user owns the order or is admin
    if (order.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this order'
      });
    }

    res.json({
      success: true,
      tracking: {
        orderId: order._id,
        trackingNumber: order.tracking?.trackingNumber,
        carrier: order.tracking?.carrier,
        status: order.status,
        estimatedDelivery: order.tracking?.estimatedDelivery,
        currentLocation: order.tracking?.currentLocation,
        statusHistory: order.tracking?.statusHistory || []
      }
    });
  } catch (error) {
    console.error('Get order tracking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching tracking information'
    });
  }
};

// @desc    Update order tracking
// @route   PUT /api/orders/:id/tracking
// @access  Private/Admin
export const updateOrderTracking = async (req, res) => {
  try {
    const { status, location, description } = req.body;
    
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Update status
    if (status) {
      order.status = status;
    }

    // Update current location
    if (location) {
      order.tracking.currentLocation = location;
    }

    // Add to status history
    const newStatus = {
      status: status || order.status,
      location: location || order.tracking.currentLocation,
      timestamp: new Date(),
      description: description || `Order status updated to ${status || order.status}`
    };

    if (!order.tracking.statusHistory) {
      order.tracking.statusHistory = [];
    }
    
    order.tracking.statusHistory.push(newStatus);

    // Update delivery status
    if (status === 'delivered') {
      order.isDelivered = true;
      order.deliveredAt = new Date();
    }

    const updatedOrder = await order.save();

    res.json({
      success: true,
      message: 'Order tracking updated successfully',
      order: updatedOrder
    });
  } catch (error) {
    console.error('Update order tracking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating tracking information'
    });
  }
};
