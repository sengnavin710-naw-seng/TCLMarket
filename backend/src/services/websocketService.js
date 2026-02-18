const jwt = require('jsonwebtoken');
const User = require('../models/User');

class WebSocketService {
  constructor(io) {
    this.io = io;
    this.clients = new Map();
    this.rooms = new Map();
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);

      // Handle authentication
      socket.on('authenticate', async (token) => {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          const user = await User.findById(decoded.userId).select('-password');
          
          if (user && user.isActive) {
            this.clients.set(socket.id, { user, socket });
            
            // Join user-specific room
            socket.join(`user_${user._id}`);
            
            // Join market rooms for active bets
            const Bet = require('../models/Bet');
            const activeBets = await Bet.find({ userId: user._id, status: 'active' });
            activeBets.forEach(bet => {
              socket.join(`market_${bet.marketId}`);
            });

            // Update last active
            user.lastActive = new Date();
            await user.save();

            socket.emit('authenticated', {
              user: {
                id: user._id,
                username: user.username,
                balance: user.balance
              }
            });

            console.log(`User ${user.username} authenticated`);
          } else {
            socket.emit('error', 'Authentication failed');
          }
        } catch (error) {
          console.error('WebSocket authentication error:', error);
          socket.emit('error', 'Authentication failed');
        }
      });

      // Join market room
      socket.on('join_market', (marketId) => {
        socket.join(`market_${marketId}`);
        console.log(`Client ${socket.id} joined market ${marketId}`);
      });

      // Leave market room
      socket.on('leave_market', (marketId) => {
        socket.leave(`market_${marketId}`);
        console.log(`Client ${socket.id} left market ${marketId}`);
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        this.clients.delete(socket.id);
        console.log('Client disconnected:', socket.id);
      });
    });
  }

  // Broadcast bet update to market participants
  broadcastBetUpdate(bet, market) {
    this.io.to(`market_${market._id}`).emit('bet_update', {
      marketId: market._id,
      newOdds: Object.fromEntries(market.currentOdds),
      totalVolume: market.totalVolume,
      participantCount: market.participantCount,
      recentBet: {
        amount: bet.amount,
        option: bet.option,
        timestamp: bet.createdAt,
        userId: bet.userId
      }
    });

    console.log(`Broadcasted bet update for market ${market._id}`);
  }

  // Broadcast market resolution
  broadcastMarketResolution(market) {
    this.io.emit('market_resolved', {
      marketId: market._id,
      resolution: market.resolution,
      resolutionDate: market.resolutionDate,
      title: market.title
    });

    // Also notify specific bet participants
    this.io.to(`market_${market._id}`).emit('market_resolved_participants', {
      marketId: market._id,
      resolution: market.resolution,
      message: `Market "${market.title}" has been resolved with outcome: ${market.resolution}`
    });

    console.log(`Broadcasted market resolution for ${market.title}`);
  }

  // Send user-specific updates
  sendUserUpdate(userId, update) {
    this.io.to(`user_${userId}`).emit('user_update', update);
  }

  // Send balance update
  sendBalanceUpdate(userId, newBalance, transaction) {
    this.io.to(`user_${userId}`).emit('balance_update', {
      newBalance,
      transaction: {
        amount: transaction.amount,
        type: transaction.type,
        description: transaction.description,
        timestamp: transaction.createdAt
      }
    });
  }

  // Broadcast new market creation
  broadcastNewMarket(market) {
    this.io.emit('new_market', {
      marketId: market._id,
      title: market.title,
      category: market.category,
      endDate: market.endDate,
      isFeatured: market.isFeatured
    });
  }

  // Broadcast market status change
  broadcastMarketStatusChange(market) {
    this.io.to(`market_${market._id}`).emit('market_status_change', {
      marketId: market._id,
      status: market.status,
      message: `Market "${market.title}" is now ${market.status}`
    });
  }

  // Send notification to specific user
  sendNotification(userId, notification) {
    this.io.to(`user_${userId}`).emit('notification', {
      id: Date.now(),
      ...notification,
      timestamp: new Date()
    });
  }

  // Get online users count
  getOnlineUsersCount() {
    return this.clients.size;
  }

  // Get users in specific market
  getMarketParticipants(marketId) {
    const room = this.io.sockets.adapter.rooms.get(`market_${marketId}`);
    return room ? room.size : 0;
  }

  // Broadcast system message
  broadcastSystemMessage(message, type = 'info') {
    this.io.emit('system_message', {
      message,
      type,
      timestamp: new Date()
    });
  }
}

module.exports = WebSocketService;
