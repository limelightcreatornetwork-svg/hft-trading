# HFT Trading Backend

Event-driven trading system for Alpaca Markets. Provides a safe execution layer for AI agents to trade equities and options.

## Features

### Core Trading Infrastructure
- **Order Management System (OMS)** - Full order lifecycle management with idempotency guarantees
- **Risk Engine** - Multi-layered pre-trade and intraday risk checks
- **Regime Detector** - Market condition classification for strategy gating
- **Audit Log** - Comprehensive audit trail with config versioning

### Risk Controls
- **Kill Switch** - Emergency halt with multiple modes (block new, cancel all, flatten)
- **Position Limits** - Per-symbol and portfolio-wide exposure limits
- **Daily Loss Limits** - Automatic trading halt on drawdown breach
- **Order Rate Limiting** - Prevent runaway trading loops
- **Anomaly Detection** - Auto-halt on consecutive rejections or 429 storms

### Market Regime Detection
- **Trend Detection** - ADX-based directional strength analysis
- **Volatility Regimes** - Realized vol tracking and expansion detection
- **Liquidity Monitoring** - Spread and quote size checks
- **Strategy Eligibility** - Gate strategies by market conditions

### Options Trading
- **Option Chains** - Fetch contracts with strike/expiration filters
- **Greeks Support** - Delta, gamma, theta, vega, IV
- **Position Management** - Track options positions and P&L
- **Order Execution** - Market, limit, stop, stop-limit orders
- **Exercise Support** - Exercise option positions

## Quick Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose (optional)
- Alpaca paper trading account

### Setup

1. **Get Alpaca API keys:**
   - Go to https://app.alpaca.markets/paper/dashboard/overview
   - Create paper trading account if needed
   - Copy API Key and Secret

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your Alpaca credentials
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Start the server:**
   ```bash
   npm run dev
   ```

5. **Verify:**
   ```bash
   curl http://localhost:3000/health
   ```

## API Reference

### Health Check
```
GET /health
```
Returns service health status.

### Equities Trading

#### Get Account State
```
GET /v1/state
```
Returns current account state, positions, and risk headroom.

#### Submit Trade Intent
```
POST /v1/intents
```
Submit a trade intent (idempotent via `client_intent_id`).

**Request Body:**
```json
{
  "client_intent_id": "uuid",
  "symbol": "AAPL",
  "side": "buy",
  "qty": 10,
  "type": "limit",
  "limit_price": 189.12,
  "time_in_force": "day",
  "meta": {
    "strategy": "micro_momo_v1",
    "reason": "breakout",
    "confidence": 0.62
  }
}
```

**Response:**
```json
{
  "status": "accepted",
  "intent_id": "uuid",
  "order_id": "uuid",
  "risk": {
    "checks_passed": true,
    "headroom": {
      "remainingDailyTrades": 95,
      "remainingDailyLoss": 800.50
    }
  }
}
```

#### Cancel Order
```
POST /v1/orders/:orderId/cancel
```

#### Get Open Orders
```
GET /v1/orders
```

### Risk Controls

#### Toggle Kill Switch
```
POST /v1/controls/kill_switch
```

**Request Body:**
```json
{
  "enabled": true,
  "mode": "cancel_only"
}
```

**Modes:**
- `block_new` - Block new orders only
- `cancel_all` - Cancel all open orders
- `flatten` - Cancel and close all positions

#### Get Risk State
```
GET /v1/risk/state
```

### Options Trading

#### Get Option Chain
```
GET /api/options/chain
```

**Query Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `symbol` | Yes | Underlying symbol (e.g., AAPL) |
| `expiration_date` | No | Specific date (YYYY-MM-DD) |
| `expiration_date_gte` | No | Min expiration date |
| `expiration_date_lte` | No | Max expiration date |
| `type` | No | `call` or `put` |
| `strike_price_gte` | No | Min strike price |
| `strike_price_lte` | No | Max strike price |
| `limit` | No | Max results (default 100) |

#### Get Option Contract
```
GET /api/options/contract/:symbolOrId
```

#### Get Option Quotes
```
GET /api/options/quotes?symbols=AAPL240119C00190000
```

#### Get Options Positions
```
GET /api/options/positions
```

#### Place Options Order
```
POST /api/options/orders
```

**Request Body:**
```json
{
  "symbol": "AAPL240119C00190000",
  "qty": 1,
  "side": "buy",
  "type": "limit",
  "limit_price": 5.10
}
```

#### Get Options Orders
```
GET /api/options/orders
```

**Query Parameters:** `status`, `limit`, `after`, `until`

#### Cancel Options Order
```
DELETE /api/options/orders/:orderId
```

#### Get Account Options Level
```
GET /api/options/account
```

#### Exercise Option
```
POST /api/options/positions/:symbolOrId/exercise
```

### Dashboard

Access the web dashboard at: `http://localhost:3000/dashboard`

**Features:**
- Real-time account info and buying power
- Options chain viewer with search filters
- Current options positions with P&L
- Quick trade form for options orders
- Order management (view, cancel)

## Architecture

```
Agent (OpenClaw)
    │
    ▼
Gateway API ──► Risk Engine ──► OMS ──► Alpaca API
    │               │            │
    ▼               ▼            ▼
  Postgres      Postgres    WebSocket (trade_updates)
```

### Core Components

| Component | Description |
|-----------|-------------|
| `gateway/` | REST API server (Express) |
| `core/risk-engine` | Enhanced risk checks with kill switch |
| `core/oms-state-machine` | Order state machine with idempotency |
| `core/regime-detector` | Market regime classification |
| `core/audit-log` | Audit trail and config versioning |
| `options/` | Options trading service |
| `libs/` | Shared utilities (config, logger, simplified risk) |

## Risk Configuration

Default risk limits (configurable via environment or constructor):

| Limit | Default | Description |
|-------|---------|-------------|
| `maxPositionNotional` | $10,000 | Max per-symbol position |
| `maxGrossExposure` | $50,000 | Total long + short exposure |
| `maxNetExposure` | $25,000 | Net long/short exposure |
| `maxOrderNotional` | $5,000 | Single order max |
| `maxDailyLoss` | $1,000 | Daily P&L floor |
| `maxDrawdown` | $500 | Max intraday drawdown |
| `maxDailyTrades` | 100 | Trade count limit |
| `orderRateLimit` | 10/min | Orders per minute |
| `maxSpreadBps` | 30 | Max spread to trade |

## Development

```bash
# Install dependencies
npm install

# Run in development mode (with hot reload)
npm run dev

# Run production server
npm start

# Run tests
npm test

# Run tests with coverage
npm test -- --coverage

# Lint
npm run lint
```

## Testing

The test suite includes:
- **Risk Engine Tests** - 32 tests covering all risk checks, kill switch, anomaly detection
- **OMS State Machine Tests** - 25 tests for order lifecycle and idempotency
- **Regime Detector Tests** - 26 tests for market classification

Run with: `npm test`

## Project Status

- [x] Gateway API scaffold
- [x] Enhanced risk engine with layered controls
- [x] OMS state machine with idempotency
- [x] Regime detection system
- [x] Audit log with config versioning
- [x] Options trading API
- [x] Options trading dashboard
- [x] Comprehensive test suite (83 tests)
- [ ] Full Alpaca API integration (equities)
- [ ] WebSocket market data streaming
- [ ] Strategy engine
- [ ] Production deployment

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ALPACA_API_KEY` | Yes | Alpaca API key |
| `ALPACA_API_SECRET` | Yes | Alpaca API secret |
| `ALPACA_PAPER` | No | Use paper trading (default: true) |
| `PORT` | No | Server port (default: 3000) |
| `DATABASE_URL` | No | PostgreSQL connection URL |
| `REDIS_URL` | No | Redis connection URL |
| `MAX_POSITION_SIZE` | No | Max position notional |
| `MAX_DAILY_LOSS` | No | Daily loss limit |
| `MAX_ORDER_NOTIONAL` | No | Max order size |
| `MAX_DAILY_TRADES` | No | Daily trade limit |
| `ORDER_RATE_LIMIT` | No | Orders per minute |
| `SYMBOL_ALLOWLIST` | No | Comma-separated allowed symbols |
| `LOG_LEVEL` | No | Log level (default: info) |

## License

MIT
