const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['bet', 'win', 'refund', 'admin_adjustment', 'deposit', 'withdrawal'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  balanceBefore: {
    type: Number,
    required: true
  },
  balanceAfter: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    required: true,
    maxlength: 500
  },
  relatedBetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bet',
    default: null
  },
  relatedMarketId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Market',
    default: null
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

// Indexes
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ type: 1, createdAt: -1 });
transactionSchema.index({ relatedBetId: 1 });
transactionSchema.index({ relatedMarketId: 1 });

// Static method to create transaction
transactionSchema.statics.createTransaction = async function(data) {
  const User = mongoose.model('User');
  const user = await User.findById(data.userId);
  
  if (!user) {
    throw new Error('User not found');
  }

  const transaction = new this({
    ...data,
    balanceBefore: user.balance,
    balanceAfter: user.balance + data.amount
  });

  // Update user balance
  user.balance += data.amount;
  await user.save();

  return await transaction.save();
};

module.exports = mongoose.model('Transaction', transactionSchema);
