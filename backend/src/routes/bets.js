const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Bet = require('../models/Bet');
const Market = require('../models/Market');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Place a bet
router.post('/', auth, [
  body('marketId')
    .notEmpty()
    .withMessage('Market ID is required')
    .isMongoId()
    .withMessage('Invalid market ID'),
  body('option')
    .notEmpty()
    .withMessage('Option is required'),
  body('amount')
    .isInt({ min: 1 })
    .withMessage('Amount must be at least 1')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    const { marketId, option, amount } = req.body;
    const user = req.user;

    // Check if user has sufficient balance
    if (user.balance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Find and validate market
    const market = await Market.findById(marketId);
    if (!market) {
      return res.status(404).json({ error: 'Market not found' });
    }

    if (!market.isOpen()) {
      return res.status(400).json({ error: 'Market is not open for betting' });
    }

    // Check if option is valid
    if (!market.options.includes(option)) {
      return res.status(400).json({ error: 'Invalid betting option' });
    }

    // Check if user already has a bet on this market (optional rule)
    const existingBet = await Bet.findOne({ 
      userId: user._id, 
      marketId, 
      status: 'active' 
    });

    if (existingBet) {
      return res.status(400).json({ error: 'You already have an active bet on this market' });
    }

    // Get current odds for the option
    const currentOdds = market.currentOdds.get(option);
    if (!currentOdds) {
      return res.status(400).json({ error: 'Odds not available for this option' });
    }

    // Start transaction for atomicity
    const session = await require('mongoose').startSession();
    session.startTransaction();

    try {
      // Create bet
      const bet = new Bet({
        userId: user._id,
        marketId,
        option,
        amount,
        oddsAtTime: currentOdds
      });

      // Calculate potential payout
      bet.calculatePotentialPayout();

      // Deduct from user balance
      user.balance -= amount;
      user.totalBets += 1;
      await user.save({ session });

      // Save bet
      await bet.save({ session });

      // Create transaction
      await Transaction.createTransaction({
        userId: user._id,
        type: 'bet',
        amount: -amount,
        description: `Bet ${amount} units on ${option} for market: ${market.title}`,
        relatedBetId: bet._id,
        relatedMarketId: marketId
      });

      // Update market odds
      await market.updateOdds();

      // Update participant count
      const participantCount = await Bet.distinct('userId', { marketId });
      market.participantCount = participantCount.length;
      await market.save({ session });

      await session.commitTransaction();
      session.endSession();

      // Add achievement for first bet
      if (user.totalBets === 1) {
        user.addAchievement('first_bet');
        await user.save();
      }

      // Emit real-time update
      const WebSocketService = require('../services/websocketService');
      const wsService = new WebSocketService();
      wsService.broadcastBetUpdate(bet, market);

      res.status(201).json({
        message: 'Bet placed successfully',
        bet: await Bet.findById(bet._id)
          .populate('marketId', 'title currentOdds')
      });

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }

  } catch (error) {
    console.error('Place bet error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's bets
router.get('/my-bets', auth, [
  query('status')
    .optional()
    .isIn(['active', 'won', 'lost', 'refunded'])
    .withMessage('Invalid status'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
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

    const filter = { userId: req.user._id };
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const bets = await Bet.find(filter)
      .populate('marketId', 'title category endDate status resolution')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Bet.countDocuments(filter);

    res.json({
      bets,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get user bets error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get active bets
router.get('/active', auth, async (req, res) => {
  try {
    const activeBets = await Bet.find({ 
      userId: req.user._id, 
      status: 'active' 
    })
      .populate('marketId', 'title category endDate currentOdds')
      .sort({ createdAt: -1 });

    res.json({ activeBets });
  } catch (error) {
    console.error('Get active bets error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get bet history
router.get('/history', auth, [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
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

    const bets = await Bet.find({ 
      userId: req.user._id, 
      status: { $in: ['won', 'lost', 'refunded'] }
    })
      .populate('marketId', 'title category resolution')
      .sort({ settledAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Bet.countDocuments({ 
      userId: req.user._id, 
      status: { $in: ['won', 'lost', 'refunded'] }
    });

    res.json({
      bets,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get bet history error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get specific bet
router.get('/:id', auth, async (req, res) => {
  try {
    const bet = await Bet.findById(req.params.id)
      .populate('marketId', 'title description category endDate status resolution currentOdds')
      .populate('userId', 'username');

    if (!bet) {
      return res.status(404).json({ error: 'Bet not found' });
    }

    // Check if user owns this bet or is admin
    if (bet.userId._id.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ bet });
  } catch (error) {
    console.error('Get bet error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Cancel bet (only if market is still open and bet is recent)
router.delete('/:id', auth, async (req, res) => {
  try {
    const bet = await Bet.findById(req.params.id);

    if (!bet) {
      return res.status(404).json({ error: 'Bet not found' });
    }

    // Check if user owns this bet
    if (bet.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if bet is still active
    if (bet.status !== 'active') {
      return res.status(400).json({ error: 'Cannot cancel settled bet' });
    }

    // Check if market is still open
    const market = await Market.findById(bet.marketId);
    if (!market.isOpen()) {
      return res.status(400).json({ error: 'Cannot cancel bet after market has closed' });
    }

    // Check if bet is recent (within 5 minutes)
    const betAge = Date.now() - bet.createdAt.getTime();
    if (betAge > 5 * 60 * 1000) {
      return res.status(400).json({ error: 'Can only cancel bets within 5 minutes of placement' });
    }

    // Start transaction
    const session = await require('mongoose').startSession();
    session.startTransaction();

    try {
      // Refund bet
      bet.refund();
      await bet.save({ session });

      // Refund user balance
      const user = await User.findById(req.user._id).session(session);
      user.balance += bet.amount;
      await user.save({ session });

      // Create transaction
      await Transaction.createTransaction({
        userId: user._id,
        type: 'refund',
        amount: bet.amount,
        description: `Refunded bet on market: ${market.title}`,
        relatedBetId: bet._id,
        relatedMarketId: market._id
      });

      // Update market odds
      await market.updateOdds();

      await session.commitTransaction();
      session.endSession();

      res.json({
        message: 'Bet cancelled successfully',
        bet
      });

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }

  } catch (error) {
    console.error('Cancel bet error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
