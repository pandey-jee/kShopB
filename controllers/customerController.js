import User from '../models/User.js';
import Order from '../models/Order.js';

// Get all customers with statistics
export const getCustomers = async (req, res) => {
  try {
    const customers = await User.find({ role: 'user' }).select('-password');
    
    // Get customer statistics
    const customersWithStats = await Promise.all(
      customers.map(async (customer) => {
        const orders = await Order.find({ user: customer._id });
        const totalOrders = orders.length;
        const totalSpent = orders.reduce((sum, order) => sum + order.total, 0);
        
        return {
          ...customer.toObject(),
          totalOrders,
          totalSpent,
          isActive: customer.lastActive && new Date() - new Date(customer.lastActive) < 30 * 60 * 1000, // Active in last 30 minutes
          lastActive: customer.lastActive || customer.createdAt
        };
      })
    );

    res.json(customersWithStats);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ message: 'Failed to fetch customers' });
  }
};

// Get customer details by ID
export const getCustomerById = async (req, res) => {
  try {
    const { customerId } = req.params;
    
    const customer = await User.findById(customerId).select('-password');
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const orders = await Order.find({ user: customerId }).populate('items.product');
    const totalOrders = orders.length;
    const totalSpent = orders.reduce((sum, order) => sum + order.total, 0);

    res.json({
      ...customer.toObject(),
      totalOrders,
      totalSpent,
      isActive: customer.lastActive && new Date() - new Date(customer.lastActive) < 30 * 60 * 1000,
      orders
    });
  } catch (error) {
    console.error('Error fetching customer:', error);
    res.status(500).json({ message: 'Failed to fetch customer details' });
  }
};

// Get customer orders
export const getCustomerOrders = async (req, res) => {
  try {
    const { customerId } = req.params;
    
    const orders = await Order.find({ user: customerId })
      .populate('items.product', 'name image')
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (error) {
    console.error('Error fetching customer orders:', error);
    res.status(500).json({ message: 'Failed to fetch customer orders' });
  }
};

// Update customer status
export const updateCustomerStatus = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { status } = req.body;

    const customer = await User.findByIdAndUpdate(
      customerId,
      { status },
      { new: true }
    ).select('-password');

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    res.json(customer);
  } catch (error) {
    console.error('Error updating customer status:', error);
    res.status(500).json({ message: 'Failed to update customer status' });
  }
};

// Get customer analytics
export const getCustomerAnalytics = async (req, res) => {
  try {
    const totalCustomers = await User.countDocuments({ role: 'user' });
    const activeCustomers = await User.countDocuments({ 
      role: 'user',
      lastActive: { $gte: new Date(Date.now() - 30 * 60 * 1000) } // Active in last 30 minutes
    });

    const recentCustomers = await User.find({ role: 'user' })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('-password');

    // Customer registration trend (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const registrationTrend = await User.aggregate([
      {
        $match: {
          role: 'user',
          createdAt: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id": 1 } }
    ]);

    res.json({
      totalCustomers,
      activeCustomers,
      inactiveCustomers: totalCustomers - activeCustomers,
      recentCustomers,
      registrationTrend
    });
  } catch (error) {
    console.error('Error fetching customer analytics:', error);
    res.status(500).json({ message: 'Failed to fetch customer analytics' });
  }
};
