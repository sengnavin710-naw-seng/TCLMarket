# TCLMarket - Polymarket Clone

A Polymarket-style prediction market platform with virtual currency betting system.

## Features

### Core Features
- **Virtual Currency System**: Users get virtual units for betting (no real money involved)
- **Market Creation**: Admin can create various types of prediction markets
- **Real-time Betting**: Place bets with live odds updates
- **Advanced Odds Calculation**: Logarithmic market scoring rule for dynamic pricing
- **Market Resolution**: Admin can resolve markets and distribute winnings
- **WebSocket Integration**: Real-time updates for odds and market changes

### User Features
- **User Authentication**: Secure JWT-based login/registration
- **Portfolio Tracking**: View active bets and potential returns
- **Transaction History**: Complete record of all betting activities
- **Achievement System**: Unlock achievements for various milestones
- **User Statistics**: Track win rate, total winnings, and betting history

### Admin Features
- **Admin Dashboard**: Comprehensive system overview
- **Market Management**: Create, update, and resolve markets
- **User Management**: View users and adjust balances
- **Currency Generation**: Generate virtual currency for users
- **System Analytics**: Detailed metrics and reporting
- **Audit Logs**: Track all system activities

## Tech Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - Database
- **Socket.io** - Real-time communication
- **JWT** - Authentication
- **bcryptjs** - Password hashing

### Frontend
- **React** - UI framework
- **Redux Toolkit** - State management
- **React Router** - Navigation
- **Socket.io Client** - Real-time updates
- **Styled Components** - Styling
- **Recharts** - Data visualization

## Installation

### Prerequisites
- Node.js (v16 or higher)
- MongoDB (v4.4 or higher)
- Git

### Setup Instructions

1. **Clone the repository**
```bash
git clone https://github.com/sengnavin710-naw-seng/TCLMarket.git
cd TCLMarket
```

2. **Install dependencies**
```bash
npm run install-all
```

3. **Environment Setup**
```bash
# Copy environment file
cp backend/.env.example backend/.env

# Edit backend/.env with your configuration
MONGODB_URI=mongodb://localhost:27017/polymarket
JWT_SECRET=your_jwt_secret_key_here
FRONTEND_URL=http://localhost:3000
```

4. **Start MongoDB**
```bash
# Make sure MongoDB is running on your system
# On Windows: net start MongoDB
# On macOS: brew services start mongodb-community
# On Linux: sudo systemctl start mongod
```

5. **Run the application**
```bash
# Start both frontend and backend
npm run dev

# Or start individually
npm run server  # Backend only
npm run client  # Frontend only
```

6. **Access the application**
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- Health Check: http://localhost:5000/health

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/profile` - Update profile

### Markets
- `GET /api/markets` - Get all markets (with filters)
- `GET /api/markets/:id` - Get specific market
- `POST /api/markets` - Create market (admin only)
- `PUT /api/markets/:id` - Update market (admin only)
- `POST /api/markets/:id/resolve` - Resolve market (admin only)

### Betting
- `POST /api/bets` - Place bet
- `GET /api/bets/my-bets` - Get user's bets
- `GET /api/bets/active` - Get active bets
- `GET /api/bets/history` - Get bet history

### Users
- `GET /api/users/profile` - Get user profile
- `GET /api/users/balance` - Get balance
- `GET /api/users/portfolio` - Get portfolio
- `GET /api/users/transactions` - Get transactions

### Admin
- `GET /api/admin/dashboard` - Dashboard overview
- `GET /api/admin/users` - Get all users
- `POST /api/admin/users/:id/balance` - Adjust user balance
- `POST /api/admin/generate-units` - Generate virtual currency
- `GET /api/admin/analytics` - System analytics

## Database Schema

### Users
```javascript
{
  username: String,
  email: String,
  password: String, // hashed
  balance: Number,
  totalWinnings: Number,
  totalBets: Number,
  winRate: Number,
  achievements: Array,
  isAdmin: Boolean
}
```

### Markets
```javascript
{
  title: String,
  description: String,
  category: String,
  type: String, // binary, multiple, range
  options: Array,
  endDate: Date,
  status: String, // open, closed, resolved
  currentOdds: Map,
  totalVolume: Number,
  creator: ObjectId
}
```

### Bets
```javascript
{
  userId: ObjectId,
  marketId: ObjectId,
  option: String,
  amount: Number,
  oddsAtTime: Number,
  potentialPayout: Number,
  status: String // active, won, lost, refunded
}
```

### Transactions
```javascript
{
  userId: ObjectId,
  type: String, // bet, win, refund, admin_adjustment
  amount: Number,
  description: String,
  relatedBetId: ObjectId,
  relatedMarketId: ObjectId
}
```

## WebSocket Events

### Client → Server
- `authenticate` - Authenticate with JWT token
- `join_market` - Join market room
- `leave_market` - Leave market room

### Server → Client
- `bet_update` - Market odds and volume updates
- `market_resolved` - Market resolution notification
- `balance_update` - User balance changes
- `user_update` - User profile updates
- `notification` - General notifications

## Odds Calculation

The system uses a **Logarithmic Market Scoring Rule (LMSR)** for dynamic odds calculation:

```
price = 1 / (1 + exp((otherPool - userPool) / liquidity))
```

This ensures:
- Liquidity provision
- Price stability
- Incentive for early betting
- Automated market making

## Security Features

- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: bcrypt with salt rounds
- **Rate Limiting**: API endpoint protection
- **Input Validation**: Comprehensive request validation
- **CORS Protection**: Cross-origin request security
- **Helmet.js**: Security headers

## Development

### Project Structure
```
TCLMarket/
├── backend/
│   ├── src/
│   │   ├── models/         # Database models
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic
│   │   ├── middleware/     # Express middleware
│   │   └── utils/          # Utility functions
│   ├── server.js           # Main server file
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/          # Page components
│   │   ├── store/          # Redux store
│   │   ├── services/       # API services
│   │   └── utils/          # Utility functions
│   └── package.json
└── README.md
```

### Environment Variables
```bash
# Server Configuration
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/polymarket

# JWT
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRE=7d

# Virtual Currency
STARTING_BALANCE=1000
DEFAULT_LIQUIDITY=10000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CORS
FRONTEND_URL=http://localhost:3000
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:
- Create an issue on GitHub
- Contact the development team

## Future Enhancements

- [ ] Mobile app development
- [ ] Advanced charting and analytics
- [ ] Social features and comments
- [ ] API for third-party integrations
- [ ] Multi-language support
- [ ] Dark mode theme
- [ ] Advanced user profiles
- [ ] Market creation by users (with approval)
- [ ] Automated market resolution via oracles
