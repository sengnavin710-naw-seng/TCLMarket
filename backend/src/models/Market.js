const mongoose = require('mongoose');

const marketSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    maxlength: 2000
  },
  category: {
    type: String,
    required: true,
    enum: ['politics', 'sports', 'finance', 'technology', 'entertainment', 'other']
  },
  type: {
    type: String,
    required: true,
    enum: ['binary', 'multiple', 'range']
  },
  options: [{
    type: String,
    required: true
  }],
  endDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['open', 'closed', 'resolved', 'cancelled'],
    default: 'open'
  },
  currentOdds: {
    type: Map,
    of: Number,
    default: new Map()
  },
  totalVolume: {
    type: Number,
    default: 0,
    min: 0
  },
  liquidity: {
    type: Number,
    default: parseInt(process.env.DEFAULT_LIQUIDITY) || 10000,
    min: 1000
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  resolution: {
    type: String,
    default: null
  },
  resolutionDate: {
    type: Date,
    default: null
  },
  tags: [{
    type: String,
    trim: true
  }],
  image: {
    type: String,
    default: null
  },
  sourceUrl: {
    type: String,
    default: null
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  viewCount: {
    type: Number,
    default: 0
  },
  participantCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes
marketSchema.index({ status: 1, endDate: 1 });
marketSchema.index({ category: 1, status: 1 });
marketSchema.index({ totalVolume: -1 });
marketSchema.index({ isFeatured: 1, status: 1 });

// Method to calculate initial odds
marketSchema.methods.calculateInitialOdds = function() {
  const odds = {};
  if (this.type === 'binary') {
    odds[this.options[0]] = 0.5;
    odds[this.options[1]] = 0.5;
  } else {
    // For multiple choice, start with equal odds
    const equalOdds = 1 / this.options.length;
    this.options.forEach(option => {
      odds[option] = equalOdds;
    });
  }
  this.currentOdds = new Map(Object.entries(odds));
};

// Method to update odds based on betting
marketSchema.methods.updateOdds = async function() {
  const Bet = mongoose.model('Bet');
  const bets = await Bet.find({ marketId: this._id, status: 'active' });
  
  const poolByOption = {};
  bets.forEach(bet => {
    poolByOption[bet.option] = (poolByOption[bet.option] || 0) + bet.amount;
  });

  const totalPool = Object.values(poolByOption).reduce((a, b) => a + b, 0);
  const odds = {};
  
  if (totalPool === 0) {
    // If no bets, use initial odds
    this.calculateInitialOdds();
    return;
  }

  // Logarithmic Market Scoring Rule
  Object.keys(poolByOption).forEach(option => {
    const pool = poolByOption[option];
    const otherPool = totalPool - pool;
    
    odds[option] = 1 / (1 + Math.exp((otherPool - pool) / this.liquidity));
  });

  // Handle options with no bets
  this.options.forEach(option => {
    if (!odds[option]) {
      odds[option] = 1 / (1 + Math.exp((totalPool) / this.liquidity));
    }
  });

  this.currentOdds = new Map(Object.entries(odds));
  this.totalVolume = totalPool;
  
  await this.save();
};

// Method to check if market is still open
marketSchema.methods.isOpen = function() {
  return this.status === 'open' && new Date() < this.endDate;
};

// Method to resolve market
marketSchema.methods.resolve = function(resolution) {
  this.status = 'resolved';
  this.resolution = resolution;
  this.resolutionDate = new Date();
};

module.exports = mongoose.model('Market', marketSchema);
