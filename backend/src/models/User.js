const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  balance: {
    type: Number,
    default: parseInt(process.env.STARTING_BALANCE) || 1000,
    min: 0
  },
  totalWinnings: {
    type: Number,
    default: 0
  },
  totalLosses: {
    type: Number,
    default: 0
  },
  totalBets: {
    type: Number,
    default: 0
  },
  winningBets: {
    type: Number,
    default: 0
  },
  winRate: {
    type: Number,
    default: 0
  },
  avatar: {
    type: String,
    default: null
  },
  bio: {
    type: String,
    maxlength: 500
  },
  achievements: [{
    type: {
      type: String,
      enum: ['first_bet', 'first_win', 'streak_5', 'profit_1000', 'volume_10000']
    },
    unlockedAt: {
      type: Date,
      default: Date.now
    }
  }],
  preferences: {
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true }
    },
    theme: {
      type: String,
      enum: ['light', 'dark'],
      default: 'light'
    }
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastActive: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for performance
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({ balance: -1 });
userSchema.index({ winRate: -1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Update win rate method
userSchema.methods.updateWinRate = function() {
  if (this.totalBets > 0) {
    this.winRate = (this.winningBets / this.totalBets) * 100;
  }
};

// Add achievement method
userSchema.methods.addAchievement = function(achievementType) {
  const existingAchievement = this.achievements.find(a => a.type === achievementType);
  if (!existingAchievement) {
    this.achievements.push({
      type: achievementType,
      unlockedAt: new Date()
    });
  }
};

module.exports = mongoose.model('User', userSchema);
