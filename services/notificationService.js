import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import logger from '../config/logger.js';

class NotificationService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // userId -> socket.id
    this.userSockets = new Map(); // socket.id -> userId
    this.rooms = new Map(); // roomId -> Set of userIds
    this.notificationQueue = new Map(); // userId -> Array of notifications
  }

  // Initialize Socket.IO server
  initializeSocket(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:8080",
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    this.setupSocketEvents();
    logger.info('Socket.IO server initialized');
    return this.io;
  }

  // Setup socket event handlers
  setupSocketEvents() {
    this.io.use(this.authenticateSocket.bind(this));

    this.io.on('connection', (socket) => {
      const userId = socket.userId;
      logger.info('User connected via WebSocket', { userId, socketId: socket.id });

      // Store user connection
      this.connectedUsers.set(userId, socket.id);
      this.userSockets.set(socket.id, userId);

      // Join user to their personal room
      socket.join(`user_${userId}`);

      // Send any queued notifications
      this.sendQueuedNotifications(userId, socket);

      // Handle notification acknowledgment
      socket.on('notification_ack', (notificationId) => {
        this.markNotificationAsRead(userId, notificationId);
      });

      // Handle typing indicators for chat
      socket.on('typing_start', (data) => {
        socket.broadcast.to(data.roomId).emit('user_typing', {
          userId,
          isTyping: true
        });
      });

      socket.on('typing_stop', (data) => {
        socket.broadcast.to(data.roomId).emit('user_typing', {
          userId,
          isTyping: false
        });
      });

      // Handle user status updates
      socket.on('update_status', (status) => {
        this.updateUserStatus(userId, status);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        logger.info('User disconnected', { userId, socketId: socket.id });
        this.connectedUsers.delete(userId);
        this.userSockets.delete(socket.id);
        this.updateUserStatus(userId, 'offline');
      });

      // Send welcome notification
      this.sendNotification(userId, {
        type: 'system',
        title: 'Welcome back!',
        message: 'You are now connected to real-time updates',
        priority: 'low'
      });
    });
  }

  // Authenticate socket connection
  async authenticateSocket(socket, next) {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('_id name email isActive');

      if (!user || !user.isActive) {
        return next(new Error('Invalid user'));
      }

      socket.userId = user._id.toString();
      socket.user = user;
      next();

    } catch (error) {
      logger.error('Socket authentication failed', { error: error.message });
      next(new Error('Authentication failed'));
    }
  }

  // Send notification to specific user
  async sendNotification(userId, notification) {
    try {
      const notificationData = {
        id: this.generateNotificationId(),
        ...notification,
        timestamp: new Date().toISOString(),
        read: false
      };

      // Check if user is connected
      const socketId = this.connectedUsers.get(userId.toString());
      
      if (socketId) {
        // User is online, send immediately
        this.io.to(socketId).emit('notification', notificationData);
        logger.info('Real-time notification sent', { 
          userId, 
          type: notification.type,
          title: notification.title 
        });
      } else {
        // User is offline, queue the notification
        this.queueNotification(userId, notificationData);
        logger.info('Notification queued for offline user', { 
          userId, 
          type: notification.type 
        });
      }

      // Store notification in database for persistence
      await this.storeNotificationInDB(userId, notificationData);

      return notificationData;

    } catch (error) {
      logger.error('Failed to send notification', { 
        userId, 
        error: error.message,
        notification: notification.type 
      });
      throw error;
    }
  }

  // Send notification to multiple users
  async sendBulkNotification(userIds, notification) {
    const results = [];
    
    for (const userId of userIds) {
      try {
        const result = await this.sendNotification(userId, notification);
        results.push({ userId, success: true, notificationId: result.id });
      } catch (error) {
        results.push({ userId, success: false, error: error.message });
      }
    }

    logger.info('Bulk notification sent', { 
      totalUsers: userIds.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    });

    return results;
  }

  // Send notification to room/group
  async sendRoomNotification(roomId, notification, excludeUserId = null) {
    try {
      const notificationData = {
        id: this.generateNotificationId(),
        ...notification,
        timestamp: new Date().toISOString(),
        read: false
      };

      // Send to all users in the room except excluded user
      if (excludeUserId) {
        this.io.to(roomId).except(`user_${excludeUserId}`).emit('notification', notificationData);
      } else {
        this.io.to(roomId).emit('notification', notificationData);
      }

      logger.info('Room notification sent', { 
        roomId, 
        type: notification.type,
        excludeUserId 
      });

      return notificationData;

    } catch (error) {
      logger.error('Failed to send room notification', { 
        roomId, 
        error: error.message 
      });
      throw error;
    }
  }

  // Order status notifications
  async sendOrderNotification(userId, orderData, status) {
    const notificationTemplates = {
      confirmed: {
        type: 'order',
        title: 'Order Confirmed!',
        message: `Your order #${orderData.orderNumber} has been confirmed`,
        priority: 'high',
        action: {
          type: 'view_order',
          url: `/orders/${orderData._id}`
        }
      },
      processing: {
        type: 'order',
        title: 'Order Processing',
        message: `Your order #${orderData.orderNumber} is being prepared`,
        priority: 'medium',
        action: {
          type: 'view_order',
          url: `/orders/${orderData._id}`
        }
      },
      shipped: {
        type: 'order',
        title: 'Order Shipped!',
        message: `Your order #${orderData.orderNumber} has been shipped`,
        priority: 'high',
        action: {
          type: 'track_order',
          url: `/orders/${orderData._id}/track`
        }
      },
      delivered: {
        type: 'order',
        title: 'Order Delivered!',
        message: `Your order #${orderData.orderNumber} has been delivered`,
        priority: 'high',
        action: {
          type: 'rate_order',
          url: `/orders/${orderData._id}/review`
        }
      },
      cancelled: {
        type: 'order',
        title: 'Order Cancelled',
        message: `Your order #${orderData.orderNumber} has been cancelled`,
        priority: 'medium',
        action: {
          type: 'view_order',
          url: `/orders/${orderData._id}`
        }
      }
    };

    const notification = notificationTemplates[status];
    if (notification) {
      return await this.sendNotification(userId, {
        ...notification,
        data: { orderId: orderData._id, orderNumber: orderData.orderNumber }
      });
    }
  }

  // Payment notifications
  async sendPaymentNotification(userId, paymentData, status) {
    const notificationTemplates = {
      success: {
        type: 'payment',
        title: 'Payment Successful!',
        message: `Payment of ₹${paymentData.amount} completed successfully`,
        priority: 'high',
        action: {
          type: 'view_receipt',
          url: `/payments/${paymentData._id}/receipt`
        }
      },
      failed: {
        type: 'payment',
        title: 'Payment Failed',
        message: `Payment of ₹${paymentData.amount} failed. Please try again`,
        priority: 'high',
        action: {
          type: 'retry_payment',
          url: `/payments/${paymentData._id}/retry`
        }
      },
      refund: {
        type: 'payment',
        title: 'Refund Processed',
        message: `Refund of ₹${paymentData.amount} has been processed`,
        priority: 'medium',
        action: {
          type: 'view_refund',
          url: `/payments/${paymentData._id}/refund`
        }
      }
    };

    const notification = notificationTemplates[status];
    if (notification) {
      return await this.sendNotification(userId, {
        ...notification,
        data: { paymentId: paymentData._id, amount: paymentData.amount }
      });
    }
  }

  // Promotional notifications
  async sendPromotionalNotification(userId, promoData) {
    return await this.sendNotification(userId, {
      type: 'promotion',
      title: promoData.title,
      message: promoData.message,
      priority: 'low',
      action: {
        type: 'view_offer',
        url: promoData.url
      },
      data: { promoId: promoData._id, discount: promoData.discount }
    });
  }

  // Stock alert notifications
  async sendStockAlert(userId, productData) {
    return await this.sendNotification(userId, {
      type: 'stock',
      title: 'Item Back in Stock!',
      message: `${productData.name} is now available`,
      priority: 'medium',
      action: {
        type: 'view_product',
        url: `/products/${productData._id}`
      },
      data: { productId: productData._id }
    });
  }

  // Price drop notifications
  async sendPriceDrop(userId, productData, oldPrice, newPrice) {
    const discount = Math.round(((oldPrice - newPrice) / oldPrice) * 100);
    
    return await this.sendNotification(userId, {
      type: 'price_drop',
      title: 'Price Drop Alert!',
      message: `${productData.name} is now ${discount}% off`,
      priority: 'medium',
      action: {
        type: 'view_product',
        url: `/products/${productData._id}`
      },
      data: { 
        productId: productData._id, 
        oldPrice, 
        newPrice, 
        discount 
      }
    });
  }

  // Queue notification for offline users
  queueNotification(userId, notification) {
    const userKey = userId.toString();
    if (!this.notificationQueue.has(userKey)) {
      this.notificationQueue.set(userKey, []);
    }
    
    const queue = this.notificationQueue.get(userKey);
    queue.push(notification);
    
    // Limit queue size to prevent memory issues
    if (queue.length > 50) {
      queue.shift(); // Remove oldest notification
    }
  }

  // Send queued notifications when user comes online
  async sendQueuedNotifications(userId, socket) {
    const userKey = userId.toString();
    const queue = this.notificationQueue.get(userKey);
    
    if (queue && queue.length > 0) {
      logger.info('Sending queued notifications', { 
        userId, 
        count: queue.length 
      });
      
      for (const notification of queue) {
        socket.emit('notification', notification);
      }
      
      // Clear the queue
      this.notificationQueue.delete(userKey);
    }
  }

  // Update user online status
  async updateUserStatus(userId, status) {
    try {
      await User.findByIdAndUpdate(userId, {
        'status.isOnline': status === 'online',
        'status.lastSeen': new Date()
      });

      // Broadcast status update to relevant users (friends, etc.)
      this.io.emit('user_status_update', {
        userId,
        status,
        lastSeen: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to update user status', { userId, status, error: error.message });
    }
  }

  // Mark notification as read
  async markNotificationAsRead(userId, notificationId) {
    try {
      // Update in database
      await User.findByIdAndUpdate(userId, {
        $set: { 'notifications.$[elem].read': true }
      }, {
        arrayFilters: [{ 'elem.id': notificationId }]
      });

      logger.info('Notification marked as read', { userId, notificationId });

    } catch (error) {
      logger.error('Failed to mark notification as read', { 
        userId, 
        notificationId, 
        error: error.message 
      });
    }
  }

  // Store notification in database for persistence
  async storeNotificationInDB(userId, notification) {
    try {
      await User.findByIdAndUpdate(userId, {
        $push: {
          notifications: {
            $each: [notification],
            $slice: -100 // Keep only last 100 notifications
          }
        }
      });

    } catch (error) {
      logger.error('Failed to store notification in database', { 
        userId, 
        error: error.message 
      });
    }
  }

  // Get connected users count
  getConnectedUsersCount() {
    return this.connectedUsers.size;
  }

  // Check if user is online
  isUserOnline(userId) {
    return this.connectedUsers.has(userId.toString());
  }

  // Get user's unread notifications
  async getUnreadNotifications(userId) {
    try {
      const user = await User.findById(userId).select('notifications');
      if (!user) return [];

      return user.notifications?.filter(n => !n.read) || [];

    } catch (error) {
      logger.error('Failed to get unread notifications', { userId, error: error.message });
      return [];
    }
  }

  // Generate unique notification ID
  generateNotificationId() {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Cleanup method for graceful shutdown
  cleanup() {
    if (this.io) {
      this.io.close();
      logger.info('Socket.IO server closed');
    }
    this.connectedUsers.clear();
    this.userSockets.clear();
    this.notificationQueue.clear();
  }
}

export default new NotificationService();
