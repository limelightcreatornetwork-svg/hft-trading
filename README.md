# HFT Trading System

A high-frequency trading system built with Next.js, featuring market regime detection, confidence-based trade scoring, automated risk management, and options trading support.

**Live Demo**: [https://hft-trading-chi.vercel.app](https://hft-trading-chi.vercel.app)

## Features

### 📈 Market Regime Detection
Classifies market conditions into 4 regimes:
- **TREND** - Strong directional move (ride momentum)
- **CHOP** - Range-bound, mean-reverting (fade breakouts)
- **VOL_EXPANSION** - Volatility spike (reduce size, widen stops)
- **UNTRADEABLE** - Extreme conditions (stay flat)

Uses ADX, ATR, regression slope, and volume analysis to detect regime shifts in real-time.

### 🎯 Confidence-Based Trading
Scores each trade 1-10 based on:
- Technical signals (regime, momentum, volume)
- Risk/reward ratio
- Market conditions (VIX proxy)
- Time of day (avoid open/close volatility)

Automatically adjusts position sizing:
- Score 8-10: 20% of portfolio
- Score 6-7: 10% of portfolio
- Score 4-5: 5% of portfolio
- Score 1-3: Skip trade

### 🛡️ Risk Management
- **Kill Switch** - Instantly halt all trading and cancel orders
- **Position Limits** - Max position size per symbol
- **Order Limits** - Max single order size
- **Daily Loss Limits** - Auto-stop when daily P&L exceeds threshold
- **Symbol Allowlist** - Trade only approved symbols
- **Regime Gating** - Block trades in UNTRADEABLE conditions

### ⏰ Automated Trade Management
- **Take Profit / Stop Loss** - ATR-based dynamic levels
- **Time Stops** - Exit if TP/SL not hit within N hours
- **Trailing Stops** - Lock in profits on winning trades
- **Alert System** - Notifications for triggered conditions

### 📊 Options Trading
- Options chain viewer
- Greeks display (Delta, Gamma, Theta, Vega)
- Portfolio-level Greeks aggregation
- P&L simulator

## Architecture

```
src/
├── app/
│   ├── api/              # Next.js API routes
│   │   ├── trade/        # Trade execution with confidence scoring
│   │   ├── risk/         # Risk configuration
│   │   ├── kill-switch/  # Emergency trading halt
│   │   ├── regime/       # Market regime detection
│   │   ├── positions/    # Position management
│   │   ├── alerts/       # Alert system
│   │   └── options/      # Options trading
│   └── (pages)/          # UI pages
├── lib/
│   ├── alpaca.ts         # Alpaca API client
│   ├── risk-engine.ts    # Risk checks and limits
│   ├── trade-manager.ts  # Position lifecycle management
│   ├── confidence.ts     # Trade scoring system
│   ├── regime.ts         # Market regime detection
│   ├── env.ts            # Environment validation
│   ├── validation.ts     # Input validation
│   └── api-auth.ts       # API authentication
└── components/           # React components
```

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database (Neon recommended)
- Alpaca trading account

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/hft-trading.git
cd hft-trading

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate deploy

# Start development server
npm run dev
```

### Environment Variables

```env
# Required - Alpaca API
ALPACA_API_KEY=your_api_key
ALPACA_API_SECRET=your_api_secret
ALPACA_PAPER=true
ALPACA_BASE_URL=https://paper-api.alpaca.markets

# Required - Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Optional - API Security
HFT_API_KEY=your_secure_api_key
```

## API Reference

### Trade Execution

```bash
# Preview trade confidence
GET /api/trade?symbol=AAPL&side=buy&entryPrice=150

# Execute trade
POST /api/trade
{
  "symbol": "AAPL",
  "side": "buy",
  "quantity": 100,
  "entryPrice": 150.50,
  "takeProfitPct": 2.0,
  "stopLossPct": 1.0,
  "timeStopHours": 4
}
```

### Risk Management

```bash
# Get risk config and headroom
GET /api/risk

# Update risk config
PUT /api/risk
{
  "maxPositionSize": 1000,
  "maxOrderSize": 100,
  "maxDailyLoss": 1000,
  "tradingEnabled": true,
  "allowedSymbols": ["AAPL", "MSFT", "GOOGL"]
}
```

### Kill Switch

```bash
# Check kill switch status
GET /api/kill-switch

# Activate kill switch (cancels all orders)
POST /api/kill-switch
{
  "action": "activate",
  "cancelOrders": true
}

# Deactivate kill switch
POST /api/kill-switch
{
  "action": "deactivate"
}
```

### Market Regime

```bash
# Get regime for specific symbol
GET /api/regime/AAPL

# Get regime for SPY (default)
GET /api/regime
```

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- __tests__/lib/confidence.test.ts
```

Current test coverage: 139 tests across 7 test suites.

## Security

### API Authentication
When `HFT_API_KEY` is set, all trading endpoints require authentication:

```bash
# Using X-API-Key header
curl -H "X-API-Key: your-api-key" https://api.example.com/api/trade

# Using Bearer token
curl -H "Authorization: Bearer your-api-key" https://api.example.com/api/trade
```

### Rate Limiting
- 60 requests per minute per client
- Automatic rate limit headers in responses

## Development

### Project Structure
- `/src/lib/` - Core business logic (testable, framework-agnostic)
- `/src/app/api/` - API route handlers
- `/src/components/` - React UI components
- `/__tests__/` - Jest test suites

### Adding New Features
1. Write the core logic in `/src/lib/`
2. Add comprehensive tests in `/__tests__/lib/`
3. Create API routes in `/src/app/api/`
4. Update BACKLOG.md with progress

### Code Quality
- TypeScript strict mode
- Discriminated unions for type-safe returns
- Comprehensive input validation
- Environment variable validation at startup

## Deployment

### Vercel (Recommended)
```bash
vercel deploy
```

### Environment Setup
Set all required environment variables in your Vercel project settings.

## License

MIT

## Contributing

1. Check BACKLOG.md for open issues
2. Create a feature branch
3. Write tests for new functionality
4. Submit a pull request

---

Built with ❤️ using Next.js, Prisma, and Alpaca
