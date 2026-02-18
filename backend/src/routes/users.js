const express = require('express');
const { auth } = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Bet = require('../models/Bet');

const router = express.Router();

// Get user profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password');

    res.json({ user });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user balance
router.get('/balance', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('balance');
    res.json({ balance: user.balance });
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user transactions
router.get('/transactions', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const transactions = await Transaction.find({ userId: req.user._id })
      .populate('relatedBetId', 'amount option')
      .populate('relatedMarketId', 'title')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Transaction.countDocuments({ userId: req.user._id });

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
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user portfolio (active bets)
router.get('/portfolio', auth, async (req, res) => {
  try {
    const activeBets = await Bet.find({ 
      userId: req.user._id, 
      status: 'active' 
    })
      .populate('marketId', 'title category endDate currentOdds status')
      .sort({ createdAt: -1 });

    // Calculate portfolio stats
    const totalInvested = activeBets.reduce((sum, bet) => sum + bet.amount, 0);
    const potentialReturn = activeBets.reduce((sum, bet) => sum + bet.potentialPayout, 0);
    const potentialProfit = potentialReturn - totalInvested;

    res.json({
      activeBets,
      stats: {
        totalBets: activeBets.length,
        totalInvested,
        potentialReturn,
        potentialProfit
      }
    });
  } catch (error) {
    console.error('Get portfolio error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user achievements
router.get('/achievements', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('achievements totalBets winningBets totalWinnings winRate');

    res.json({
      achievements: user.achievements,
      stats: {
        totalBets: user.totalBets,
        winningBets: user.winningBets,
        totalWinnings: user.totalWinnings,
        winRate: user.winRate
      }
    });
  } catch (error) {
    console.error('Get achievements error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user statistics
router.get('/stats', auth, async (req, res) => {
  try {
    const userId = req.user._id;

    // Basic stats from user
    const user = await User.findById(userId)
      .select('totalBets winningBets totalWinnings totalLosses winRate balance');

    // Market participation stats
    const marketStats = await Bet.aggregate([
      { $match: { userId: userId } },
      {
        $group: {
          _id: null,
          uniqueMarkets: { $addToSet: '$marketId' },
          totalVolume: { $sum: '$amount' }
        }
      }
    ]);

    // Category performance
    const categoryStats = await Bet.aggregate([
      { $match: { userId: userId } },
      {
        $lookup: {
          from: 'markets',
          localField: 'marketId',
          foreignField: '_id',
          as: 'market'
        }
      },
      { $unwind: '$market' },
      {
        $group: {
          _id: '$market.category',
          totalBets: { $sum: 1 },
          winningBets: {
            $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] }
          },
          totalAmount: { $sum: '$amount' },
          totalWinnings: { $sum: '$actualPayout' }
        }
      }
    ]);

    // Recent activity
    const recentBets = await Bet.find({ userId })
      .populate('marketId', 'title')
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      basicStats: {
        totalBets: user.totalBets,
        winningBets: user.winningBets,
        totalWinnings: user.totalWinnings,
        totalLosses: user.totalLosses,
        winRate: user.winRate,
        currentBalance: user.balance
      },
      marketStats: {
        uniqueMarkets: marketStats[0]?.uniqueMarkets?.length || 0,
        totalVolume: marketStats[0]?.totalVolume || 0
      },
      categoryStats,
      recentBets
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
