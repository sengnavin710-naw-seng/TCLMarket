const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Market = require('../models/Market');
const Bet = require('../models/Bet');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// Get all markets with filters
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('category').optional().isIn(['politics', 'sports', 'finance', 'technology', 'entertainment', 'other']).withMessage('Invalid category'),
  query('status').optional().isIn(['open', 'closed', 'resolved']).withMessage('Invalid status'),
  query('sortBy').optional().isIn(['createdAt', 'endDate', 'totalVolume', 'viewCount']).withMessage('Invalid sort field'),
  query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.featured === 'true') filter.isFeatured = true;

    // Build sort
    const sort = {};
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    sort[sortBy] = sortOrder;

    const markets = await Market.find(filter)
      .populate('creator', 'username')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Market.countDocuments(filter);

    res.json({
      markets,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get markets error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get specific market
router.get('/:id', async (req, res) => {
  try {
    const market = await Market.findById(req.params.id)
      .populate('creator', 'username');

    if (!market) {
      return res.status(404).json({ error: 'Market not found' });
    }

    // Increment view count
    market.viewCount += 1;
    await market.save();

    // Get recent bets for this market
    const recentBets = await Bet.find({ marketId: market._id })
      .populate('userId', 'username')
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      market,
      recentBets
    });
  } catch (error) {
    console.error('Get market error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create new market (admin only)
router.post('/', auth, adminAuth, [
  body('title')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Title must be between 5 and 200 characters'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Description must be between 10 and 2000 characters'),
  body('category')
    .isIn(['politics', 'sports', 'finance', 'technology', 'entertainment', 'other'])
    .withMessage('Invalid category'),
  body('type')
    .isIn(['binary', 'multiple', 'range'])
    .withMessage('Invalid market type'),
  body('options')
    .isArray({ min: 2 })
    .withMessage('At least 2 options are required'),
  body('endDate')
    .isISO8601()
    .withMessage('End date must be a valid date')
    .custom((value) => {
      if (new Date(value) <= new Date()) {
        throw new Error('End date must be in the future');
      }
      return true;
    })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    const { title, description, category, type, options, endDate, tags, image, sourceUrl, isFeatured } = req.body;

    const market = new Market({
      title,
      description,
      category,
      type,
      options,
      endDate: new Date(endDate),
      tags: tags || [],
      image: image || null,
      sourceUrl: sourceUrl || null,
      isFeatured: isFeatured || false,
      creator: req.user._id
    });

    // Calculate initial odds
    market.calculateInitialOdds();

    await market.save();

    const populatedMarket = await Market.findById(market._id)
      .populate('creator', 'username');

    res.status(201).json({
      message: 'Market created successfully',
      market: populatedMarket
    });
  } catch (error) {
    console.error('Create market error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update market (admin only)
router.put('/:id', auth, adminAuth, [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Title must be between 5 and 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Description must be between 10 and 2000 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    const market = await Market.findById(req.params.id);
    if (!market) {
      return res.status(404).json({ error: 'Market not found' });
    }

    // Update allowed fields
    const allowedUpdates = ['title', 'description', 'tags', 'image', 'sourceUrl', 'isFeatured'];
    const updates = {};
    
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    Object.assign(market, updates);
    await market.save();

    const updatedMarket = await Market.findById(market._id)
      .populate('creator', 'username');

    res.json({
      message: 'Market updated successfully',
      market: updatedMarket
    });
  } catch (error) {
    console.error('Update market error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Resolve market (admin only)
router.post('/:id/resolve', auth, adminAuth, [
  body('resolution')
    .notEmpty()
    .withMessage('Resolution is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    const market = await Market.findById(req.params.id);
    if (!market) {
      return res.status(404).json({ error: 'Market not found' });
    }

    if (market.status !== 'open' && market.status !== 'closed') {
      return res.status(400).json({ error: 'Market cannot be resolved' });
    }

    const { resolution } = req.body;

    // Check if resolution is valid
    if (!market.options.includes(resolution)) {
      return res.status(400).json({ error: 'Invalid resolution option' });
    }

    // Resolve market
    market.resolve(resolution);
    await market.save();

    // Settle all bets for this market
    const Bet = require('../models/Bet');
    const User = require('../models/User');
    const Transaction = require('../models/Transaction');

    const activeBets = await Bet.find({ marketId: market._id, status: 'active' });

    for (const bet of activeBets) {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        bet.settle(resolution);
        await bet.save({ session });

        const user = await User.findById(bet.userId).session(session);

        if (bet.status === 'won') {
          user.balance += bet.actualPayout;
          user.totalWinnings += bet.actualPayout - bet.amount;
          user.winningBets += 1;
          
          // Add achievement for first win
          if (user.winningBets === 1) {
            user.addAchievement('first_win');
          }
        }

        user.totalBets += 1;
        user.updateWinRate();
        await user.save({ session });

        // Create transaction
        await Transaction.createTransaction({
          userId: bet.userId,
          type: bet.status === 'won' ? 'win' : 'loss',
          amount: bet.actualPayout - bet.amount,
          description: `Bet ${bet.status === 'won' ? 'won' : 'lost'} on market: ${market.title}`,
          relatedBetId: bet._id,
          relatedMarketId: market._id
        });

        await session.commitTransaction();
        session.endSession();

      } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Error settling bet:', error);
      }
    }

    res.json({
      message: 'Market resolved successfully',
      market
    });
  } catch (error) {
    console.error('Resolve market error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get market statistics
router.get('/:id/stats', async (req, res) => {
  try {
    const market = await Market.findById(req.params.id);
    if (!market) {
      return res.status(404).json({ error: 'Market not found' });
    }

    const stats = await Bet.aggregate([
      { $match: { marketId: market._id } },
      {
        $group: {
          _id: '$option',
          totalAmount: { $sum: '$amount' },
          betCount: { $sum: 1 }
        }
      }
    ]);

    res.json({
      marketId: market._id,
      totalVolume: market.totalVolume,
      participantCount: market.participantCount,
      currentOdds: Object.fromEntries(market.currentOdds),
      optionStats: stats
    });
  } catch (error) {
    console.error('Get market stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
