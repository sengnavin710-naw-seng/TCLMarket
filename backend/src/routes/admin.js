const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Market = require('../models/Market');
const Bet = require('../models/Bet');
const Transaction = require('../models/Transaction');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// All admin routes require authentication and admin privileges
router.use(auth, adminAuth);

// Get dashboard overview
router.get('/dashboard', async (req, res) => {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Basic counts
    const totalUsers = await User.countDocuments();
    const totalMarkets = await Market.countDocuments();
    const activeMarkets = await Market.countDocuments({ status: 'open' });
    const totalBets = await Bet.countDocuments();
    const activeBets = await Bet.countDocuments({ status: 'active' });

    // Recent activity
    const newUsers24h = await User.countDocuments({ createdAt: { $gte: last24h } });
    const newMarkets24h = await Market.countDocuments({ createdAt: { $gte: last24h } });
    const newBets24h = await Bet.countDocuments({ createdAt: { $gte: last24h } });

    // Volume stats
    const totalVolume = await Market.aggregate([
      { $group: { _id: null, total: { $sum: '$totalVolume' } } }
    ]);

    const volume24h = await Bet.aggregate([
      { $match: { createdAt: { $gte: last24h } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // User stats
    const totalBalance = await User.aggregate([
      { $group: { _id: null, total: { $sum: '$balance' } } }
    ]);

    const activeUsers24h = await User.countDocuments({ lastActive: { $gte: last24h } });

    // Market categories
    const marketCategories = await Market.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);

    res.json({
      overview: {
        totalUsers,
        totalMarkets,
        activeMarkets,
        totalBets,
        activeBets,
        totalVolume: totalVolume[0]?.total || 0,
        totalBalance: totalBalance[0]?.total || 0
      },
      last24h: {
        newUsers: newUsers24h,
        newMarkets: newMarkets24h,
        newBets: newBets24h,
        volume: volume24h[0]?.total || 0,
        activeUsers: activeUsers24h
      },
      marketCategories
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all users
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.search) {
      filter.$or = [
        { username: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } }
      ];
    }
    if (req.query.isActive !== undefined) {
      filter.isActive = req.query.isActive === 'true';
    }

    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments(filter);

    res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Adjust user balance
router.post('/users/:id/balance', [
  body('amount')
    .isInt()
    .withMessage('Amount must be an integer'),
  body('reason')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Reason must be between 5 and 200 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    const { amount, reason } = req.body;
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const oldBalance = user.balance;
    user.balance += amount;
    
    if (user.balance < 0) {
      return res.status(400).json({ error: 'Insufficient balance for this adjustment' });
    }

    await user.save();

    // Create transaction
    await Transaction.createTransaction({
      userId,
      type: 'admin_adjustment',
      amount,
      description: `Admin adjustment: ${reason}`,
      adminId: req.user._id
    });

    res.json({
      message: 'Balance adjusted successfully',
      oldBalance,
      newBalance: user.balance,
      adjustment: amount
    });
  } catch (error) {
    console.error('Adjust balance error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Generate virtual currency
router.post('/generate-units', [
  body('amount')
    .isInt({ min: 1, max: 1000000 })
    .withMessage('Amount must be between 1 and 1,000,000'),
  body('userId')
    .optional()
    .isMongoId()
    .withMessage('Invalid user ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    const { amount, userId } = req.body;

    if (userId) {
      // Add to specific user
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const oldBalance = user.balance;
      user.balance += amount;
      await user.save();

      await Transaction.createTransaction({
        userId,
        type: 'admin_adjustment',
        amount,
        description: `Admin: Generated ${amount} units`,
        adminId: req.user._id
      });

      res.json({
        message: `Generated ${amount} units for user ${user.username}`,
        userId,
        oldBalance,
        newBalance: user.balance
      });
    } else {
      // Distribute equally to all users
      const users = await User.find({ isActive: true });
      const amountPerUser = Math.floor(amount / users.length);

      if (amountPerUser === 0) {
        return res.status(400).json({ error: 'Amount too small to distribute' });
      }

      for (const user of users) {
        user.balance += amountPerUser;
        await user.save();

        await Transaction.createTransaction({
          userId: user._id,
          type: 'admin_adjustment',
          amount: amountPerUser,
          description: `Admin: Generated ${amountPerUser} units (airdrop)`,
          adminId: req.user._id
        });
      }

      res.json({
        message: `Generated ${amountPerUser} units for each of ${users.length} users`,
        totalGenerated: amountPerUser * users.length,
        usersAffected: users.length
      });
    }
  } catch (error) {
    console.error('Generate units error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get system analytics
router.get('/analytics', async (req, res) => {
  try {
    const period = req.query.period || '7d';
    let startDate;

    switch (period) {
      case '24h':
        startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    }

    // User analytics
    const userGrowth = await User.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Volume analytics
    const volumeGrowth = await Bet.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          volume: { $sum: "$amount" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Market performance
    const marketPerformance = await Market.aggregate([
      { $match: { status: 'resolved' } },
      {
        $lookup: {
          from: 'bets',
          localField: '_id',
          foreignField: 'marketId',
          as: 'bets'
        }
      },
      {
        $project: {
          title: 1,
          category: 1,
          totalVolume: '$totalVolume',
          participantCount: '$participantCount',
          betCount: { $size: '$bets' }
        }
      },
      { $sort: { totalVolume: -1 } },
      { $limit: 10 }
    ]);

    // Top users
    const topUsers = await User.aggregate([
      {
        $project: {
          username: 1,
          balance: 1,
          totalBets: 1,
          winningBets: 1,
          winRate: 1,
          totalWinnings: 1
        }
      },
      { $sort: { totalWinnings: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      period,
      userGrowth,
      volumeGrowth,
      marketPerformance,
      topUsers
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get audit log
router.get('/audit-log', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.type) {
      filter.type = req.query.type;
    }
    if (req.query.userId) {
      filter.userId = req.query.userId;
    }

    const transactions = await Transaction.find(filter)
      .populate('userId', 'username')
      .populate('adminId', 'username')
      .populate('relatedMarketId', 'title')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Transaction.countDocuments(filter);

    res.json({
      transactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Audit log error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Toggle user status
router.post('/users/:id/toggle-status', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot change your own status' });
    }

    user.isActive = !user.isActive;
    await user.save();

    res.json({
      message: `User ${user.username} ${user.isActive ? 'activated' : 'deactivated'}`,
      isActive: user.isActive
    });
  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
