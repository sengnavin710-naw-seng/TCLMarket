const mongoose = require('mongoose');

const betSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  marketId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Market',
    required: true
  },
  option: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 1
  },
  oddsAtTime: {
    type: Number,
    required: true
  },
  potentialPayout: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'won', 'lost', 'refunded'],
    default: 'active'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  settledAt: {
    type: Date,
    default: null
  },
  actualPayout: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes
betSchema.index({ userId: 1, status: 1 });
betSchema.index({ marketId: 1, status: 1 });
betSchema.index({ status: 1, createdAt: -1 });

// Method to calculate potential payout
betSchema.methods.calculatePotentialPayout = function() {
  this.potentialPayout = this.amount / this.oddsAtTime;
};

// Method to settle bet
betSchema.methods.settle = function(marketResolution) {
  this.settledAt = new Date();
  
  if (this.option === marketResolution) {
    this.status = 'won';
    this.actualPayout = this.potentialPayout;
  } else {
    this.status = 'lost';
    this.actualPayout = 0;
  }
};

// Method to refund bet
betSchema.methods.refund = function() {
  this.status = 'refunded';
  this.actualPayout = this.amount;
  this.settledAt = new Date();
};

module.exports = mongoose.model('Bet', betSchema);
