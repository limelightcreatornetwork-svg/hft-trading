# HFT Trading Backend

Event-driven trading system for Alpaca Markets. Provides a safe execution layer for AI agents to trade.

## Quick Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
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

3. **Start services:**
   ```bash
   docker-compose up -d
   ```

4. **Verify:**
   ```bash
   curl http://localhost:3000/health
   ```

## API Endpoints

### Equities Trading

#### GET /v1/state
Get current account state, positions, and risk headroom.

#### POST /v1/intents
Submit a trade intent (idempotent).

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

### POST /v1/orders/:orderId/cancel
Cancel an order.

### POST /v1/controls/kill_switch
Enable/disable kill switch.

```json
{
  "enabled": true,
  "mode": "cancel_only"
}
```

### GET /v1/risk/state
Get current risk limits and headroom.

### Options Trading

#### GET /api/options/chain
Get option chain for a symbol.

Query parameters:
- `symbol` (required): Underlying symbol (e.g., AAPL)
- `expiration_date_gte`: Min expiration date (YYYY-MM-DD)
- `expiration_date_lte`: Max expiration date (YYYY-MM-DD)
- `type`: Filter by `call` or `put`
- `strike_price_gte`: Min strike price
- `strike_price_lte`: Max strike price
- `limit`: Max results (default 100)

#### GET /api/options/positions
Get current options positions.

#### POST /api/options/orders
Place an options order.

```json
{
  "symbol": "AAPL240119C00190000",
  "qty": 1,
  "side": "buy",
  "type": "limit",
  "limit_price": 5.10
}
```

#### GET /api/options/orders
Get options orders. Query params: `status`, `limit`.

#### DELETE /api/options/orders/:orderId
Cancel an options order.

#### GET /api/options/account
Get account options trading level and buying power.

#### POST /api/options/positions/:symbol/exercise
Exercise an option position.

### Dashboard

Access the web dashboard at: `http://localhost:3000/dashboard`

Features:
- Real-time account info and buying power
- Options chain viewer with search filters
- Current options positions with P&L
- Quick trade form for options orders
- Order management (view, cancel)

## Architecture

```
Agent (OpenClaw)
    |
    v
Gateway API --> Risk Engine --> OMS --> Alpaca API
    |               |           |
    v               v           v
  Postgres      Postgres    WebSocket (trade_updates)
```

## Risk Controls

- **Symbol allowlist** - Only trade approved symbols
- **Max order notional** - Limit per-order size
- **Max position size** - Limit per-symbol exposure
- **Max daily trades** - Limit order count
- **Daily loss limit** - Auto kill switch on drawdown
- **Order rate limit** - Prevent runaway loops

## Development

```bash
# Install dependencies
npm install

# Run locally (requires .env)
npm run dev

# Run tests
npm test

# Lint
npm run lint
```

## Project Status

- [x] Gateway API scaffold
- [x] Risk engine with basic checks
- [x] OMS skeleton
- [x] Docker configuration
- [x] Database schema
- [x] **Options trading API** (NEW)
- [x] **Options trading dashboard** (NEW)
- [ ] Alpaca API integration (equities)
- [ ] WebSocket market data
- [ ] Strategy engine
- [ ] Production deployment

## License

MIT
