# HFT Trading System - Requirements Audit

**Last Updated:** 2026-02-02  
**Brokers:** Alpaca (stocks/options), Kalshi (prediction markets)  
**Status:** ✅ COMPLETE

---

## Executive Summary

This document provides a comprehensive audit of trading API requirements for the HFT system, comparing what Alpaca and Kalshi provide against what we need, and tracking implementation status.

| Category | Alpaca Support | Kalshi Support | Our Implementation |
|----------|----------------|----------------|-------------------|
| Order Types | ✅ Full | ⚠️ Limit only | ✅ Complete |
| Streaming | ✅ Full | ✅ Full | ✅ Complete |
| Rate Limits | ✅ 200/min | ✅ 10/sec | ✅ Handled |
| Risk Controls | ❌ Basic | ❌ Basic | ✅ Custom Engine |
| Auth/Security | ✅ Good | ✅ Good | ✅ Complete |
| Agent Tools | N/A | N/A | ✅ 5 Tools |
| Human Approval | N/A | N/A | ✅ Implemented |
| Status Monitoring | ⚠️ Status page | ⚠️ Status page | ✅ Automated |

---

## 1. Trading API Capabilities

### 1.1 Alpaca (Stocks/Options)

#### Order Types
| Feature | Supported | Implementation Status |
|---------|-----------|----------------------|
| Market | ✅ | ✅ `OrderType.MARKET` |
| Limit | ✅ | ✅ `OrderType.LIMIT` |
| Stop | ✅ | ✅ `OrderType.STOP` |
| Stop-Limit | ✅ | ✅ `OrderType.STOP_LIMIT` |
| Trailing Stop | ✅ | ✅ `trail_percent`/`trail_price` |
| Bracket/OCO | ✅ | ✅ `OrderClass.BRACKET`/`OCO` |

#### Time-in-Force
| TIF | Supported | Notes |
|-----|-----------|-------|
| DAY | ✅ | Cancel at market close |
| GTC | ✅ | Good til canceled (max 90 days) |
| IOC | ✅ | Immediate or Cancel |
| FOK | ✅ | Fill or Kill |
| OPG | ✅ | Market-on-Open |
| CLS | ✅ | Market-on-Close |
| Extended Hours | ✅ | Pre/post market (4:00 AM - 8:00 PM ET) |

#### Options Support
| Feature | Supported | Notes |
|---------|-----------|-------|
| Single-leg | ✅ | Standard options orders |
| Multi-leg | ✅ | Up to 4 legs per order |
| Spreads | ✅ | Vertical, horizontal, diagonal |
| Exercise | ⚠️ | Manual via support request |
| Assignment | ✅ | Auto-assignment on expiry |
| Greeks | ✅ | Via options data feed |
| Chains | ✅ | `get_options_contracts()` implemented |

#### Idempotency & Client Order IDs
| Feature | Status | Implementation |
|---------|--------|----------------|
| Client Order ID | ✅ | 48-char max, alphanumeric + hyphen/underscore |
| Idempotent Submit | ✅ | Same client_order_id = same order |
| Duplicate Detection | ✅ | `_submitted_orders` cache in AlpacaClient |
| Partial Fills | ✅ | `filled_qty` + `filled_avg_price` fields |
| Cancel/Replace | ⚠️ | **Non-atomic** (cancel-then-new) |

**⚠️ IMPORTANT:** Alpaca's `PATCH /v2/orders/{order_id}` is NOT atomic. It internally cancels the old order and creates a new one. This means:
- The original order may fill between cancel and new order creation
- Use with caution in fast-moving markets
- Consider manual cancel-then-new for critical orders

### 1.2 Kalshi (Prediction Markets)

#### Order Types
| Feature | Supported | Notes |
|---------|-----------|-------|
| Limit | ✅ | Only supported order type |
| Market | ❌ | Use limit at 99¢ for pseudo-market buy |

**Workaround for market orders:**
```python
# Pseudo-market buy (pays up to 99¢)
await kalshi.submit_order(ticker, side="yes", action="buy", count=10, yes_price=99)

# Pseudo-market sell (accepts as low as 1¢)
await kalshi.submit_order(ticker, side="yes", action="sell", count=10, yes_price=1)
```

#### Time-in-Force
| TIF | Supported | Notes |
|-----|-----------|-------|
| GTC | ✅ | Until event closes |
| IOC | ⚠️ | Via `action: immediate-or-cancel` parameter |
| Day/FOK | ❌ | Not supported |

#### Idempotency
| Feature | Status | Notes |
|---------|--------|-------|
| Client Order ID | ✅ | UUID format recommended |
| Idempotent Submit | ✅ | Resubmit returns existing order |

---

## 2. Realtime Data + Streaming

### 2.1 Alpaca WebSocket Streams

| Stream | Endpoint | Data | Implementation |
|--------|----------|------|----------------|
| Market Data | `wss://stream.data.alpaca.markets/v2/{feed}` | Quotes, trades, bars | ✅ `AlpacaStream` |
| Trading | `wss://api.alpaca.markets/stream` | Order updates, fills | ✅ `AlpacaStream` |
| News | `wss://stream.data.alpaca.markets/v1beta1/news` | Market news | ❌ Not implemented |

**Data Feeds:**
- `iex` - Free tier (IEX data only)
- `sip` - Paid ($9/mo) - Full consolidated NBBO

**Subscription Limits:**
- Up to 100 symbols per subscription message
- Unlimited total subscriptions (practical limit ~10k)
- 1 stream per API key (multiplexed)

**Implemented Features:**
- ✅ Automatic reconnection with exponential backoff
- ✅ Subscription management (subscribe/unsubscribe)
- ✅ Auto-resubscribe on reconnect
- ✅ Message parsing and callbacks
- ✅ Heartbeat monitoring

### 2.2 Kalshi WebSocket Streams

| Stream | Endpoint | Data | Implementation |
|--------|----------|------|----------------|
| Market | `wss://api.kalshi.co/trade-api/ws/v2` | Orderbook, trades | ✅ `KalshiStream` |
| Portfolio | Same connection | Positions, fills | ✅ `KalshiStream` |

**Implemented Features:**
- ✅ Single multiplexed connection
- ✅ Sequence numbers for gap detection
- ✅ Heartbeat handling
- ✅ Auto-reconnection

### 2.3 Paper Trading Parity

| Feature | Alpaca | Kalshi |
|---------|--------|--------|
| Paper Environment | ✅ Full parity | ✅ Demo mode |
| Simulated Fills | ✅ Realistic | ⚠️ Instant fills |
| Market Data | ✅ Same as live | ✅ Same as live |
| Rate Limits | ✅ Same | ✅ Same |
| WebSocket | ✅ Same | ✅ Same |

---

## 3. Rate Limits & Scaling

### 3.1 Alpaca Rate Limits

| Endpoint Type | Limit | Window | Implementation |
|---------------|-------|--------|----------------|
| Trading API | 200 req/min | Rolling | ✅ `RateLimiter` class |
| Data API | 200 req/min | Rolling | ✅ Shared limiter |
| Account API | 200 req/min | Rolling | ✅ Shared limiter |
| Historical Bars | 200 req/min | Per symbol | ✅ Handled |

**Burst Behavior:**
- 429 returned on limit exceeded
- `Retry-After` header provided
- No penalty for hitting limits (no ban)

### 3.2 Kalshi Rate Limits

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| REST API | 10 req/sec | Rolling |
| WebSocket | Unlimited | N/A |

### 3.3 Implementation

```python
# Rate limiter implementation (src/brokers/alpaca.py)
class RateLimiter:
    def __init__(self, requests_per_minute: int = 200):
        self.rate = requests_per_minute / 60
        self.tokens = requests_per_minute
        ...
```

**Features Implemented:**
- ✅ Token bucket rate limiter
- ✅ Exponential backoff on 429
- ✅ `Retry-After` header respect
- ✅ Request queue management
- ✅ Streaming-first architecture (0 rate limit impact for real-time data)
- ✅ Concurrency tracking

---

## 4. Auth & Security

### 4.1 Alpaca

| Feature | Status | Notes |
|---------|--------|-------|
| API Key + Secret | ✅ | Primary auth method |
| OAuth | ✅ | For third-party apps |
| Read-only Keys | ❌ | All keys have full access |
| Key Rotation | ✅ | Regenerate in dashboard |
| IP Allowlist | ❌ | Not supported by Alpaca |
| Paper vs Live Keys | ✅ | Separate key pairs |

### 4.2 Kalshi

| Feature | Status | Notes |
|---------|--------|-------|
| Email/Password | ✅ | Returns session token |
| API Key | ✅ | Alternative to email/password |
| Read-only | ❌ | All keys have full access |
| Key Rotation | ✅ | Via dashboard |
| IP Allowlist | ❌ | Not supported |

### 4.3 Our Implementation

**Security Best Practices:**
```yaml
# Load from environment (config/default.yaml)
alpaca:
  # API keys loaded from environment:
  # ALPACA_PAPER_API_KEY, ALPACA_PAPER_API_SECRET (paper)
  # ALPACA_API_KEY, ALPACA_API_SECRET (live)
```

**Implemented:**
- ✅ Environment variable storage (never in code)
- ✅ Separate paper/live key configuration
- ✅ Key rotation procedure documented
- ✅ Audit logging of all API calls
- ⚠️ Consider HashiCorp Vault for production

---

## 5. Risk Controls (CRITICAL)

### 5.1 Platform-Native Controls

#### Alpaca
| Control | Supported | Notes |
|---------|-----------|-------|
| Max Order Size | ❌ | Must implement |
| Max Position | ❌ | Must implement |
| Kill Switch | ⚠️ | `DELETE /v2/positions` closes all |
| Daily Loss Limit | ❌ | Must implement |
| Symbol Allowlist | ❌ | Must implement |

#### Kalshi
| Control | Supported | Notes |
|---------|-----------|-------|
| Max Order Size | ✅ | Platform max $25k per position |
| Position Limits | ✅ | Platform limits apply |
| Daily Loss | ❌ | Must implement |

### 5.2 Custom Risk Engine (IMPLEMENTED)

**Location:** `src/risk/engine.py`

```python
RiskEngine:
  ✅ Pre-trade checks (all orders pass through risk engine)
  ✅ Max order size (notional and shares)
  ✅ Max position size (per symbol & total)
  ✅ Max total exposure
  ✅ Concentration limits
  ✅ Max daily loss / weekly loss / drawdown
  ✅ Circuit breaker (reject rate, slippage thresholds)
  ✅ Symbol allowlist/blocklist
  ✅ Human approval thresholds
  ✅ Dry-run mode
  ✅ Spend limits (daily/weekly/monthly)
  ✅ Kill switch
```

### 5.3 Human Approval Workflow (IMPLEMENTED)

**Location:** `src/risk/approval.py`

```python
ApprovalWorkflow:
  ✅ Queue orders for approval
  ✅ Configurable timeout
  ✅ Notification callbacks
  ✅ Approve/reject API
  ✅ Blocking wait for decision
  ✅ History tracking
```

**Triggers for Human Approval:**
1. Order notional > $25,000 (configurable)
2. Trading while already down > $2,000 daily
3. Custom rules (extensible)

### 5.4 Risk Configuration

```yaml
# config/default.yaml
risk:
  max_order_notional: 10000
  max_order_shares: 1000
  max_position_notional: 50000
  max_position_shares: 5000
  max_total_exposure: 200000
  max_concentration_pct: 0.25
  max_daily_loss: 5000
  max_weekly_loss: 15000
  max_drawdown_pct: 0.10
  daily_spend_limit: 100000
  weekly_spend_limit: 300000
  monthly_spend_limit: 1000000
  approval_notional_threshold: 25000
  approval_loss_threshold: 2000
```

---

## 6. Data Requirements

### 6.1 Historical Data

| Data | Alpaca | Kalshi | Implementation |
|------|--------|--------|----------------|
| Trades | ✅ 7+ years | ✅ Since launch | ✅ `get_bars()` |
| Bars (1m-1D) | ✅ 7+ years | ✅ | ✅ Implemented |
| Quotes | ✅ 5 years | N/A | ✅ Snapshot API |
| Options Chains | ✅ | N/A | ✅ `get_options_contracts()` |
| Greeks | ✅ Real-time | N/A | ✅ Via options quote |

### 6.2 Corporate Actions

| Action | Alpaca | Notes |
|--------|--------|-------|
| Splits | ✅ | Auto-adjusted bars (use `adjustment="split"`) |
| Dividends | ✅ | Via announcements API |
| Mergers | ✅ | Symbol changes tracked |

---

## 7. Operational Requirements

### 7.1 Status & Monitoring

| Feature | Alpaca | Kalshi | Our Implementation |
|---------|--------|--------|-------------------|
| Status Page | ✅ status.alpaca.markets | ✅ status.kalshi.com | ✅ `StatusMonitor` |
| Webhooks | ❌ | ❌ | ⚠️ Future |
| Error Codes | ✅ | ✅ | ✅ Handled |
| Audit Trail | ✅ Activities API | ✅ | ✅ `JournalTool` |

**Status Monitoring Implementation:** `src/monitoring/status.py`

```python
StatusMonitor:
  ✅ Periodic health checks
  ✅ Alert generation on status changes
  ✅ Response time tracking
  ✅ Callback notifications
```

### 7.2 WebSocket Reconnection

| Feature | Implementation |
|---------|----------------|
| Exponential backoff | ✅ 1s → 60s max |
| Sequence number tracking | ✅ Kalshi |
| Gap detection | ✅ Kalshi |
| Heartbeat monitoring | ✅ Both |
| Auto-resubscribe | ✅ Both |

### 7.3 Error Handling

| Error | Handling |
|-------|----------|
| 429 Rate Limit | Exponential backoff with `Retry-After` |
| 401 Unauthorized | Re-authenticate (Kalshi) |
| 422 Unprocessable | Parse error, check idempotency |
| 5xx Server Error | Retry with backoff |
| Connection Lost | Reconnect with backoff |

---

## 8. Account Constraints

### 8.1 Alpaca

| Constraint | Details | Implementation |
|------------|---------|----------------|
| Margin | 2:1 day / 4:1 intraday | ✅ Respected |
| PDT | $25k min for 4+ day trades/week | ✅ Day trade tracking |
| Shorting | Available (easy-to-borrow) | ✅ Supported |
| Options Levels | 0-3 (approval required) | ✅ Account-based |
| Fees | $0 commission | ✅ |
| Trading Hours | 4:00 AM - 8:00 PM ET | ✅ Extended hours support |

### 8.2 Kalshi

| Constraint | Details | Implementation |
|------------|---------|----------------|
| Max Position | $25,000 per contract | ✅ Platform enforced |
| Settlement | T+0 (instant) | ✅ |
| Fees | 7¢ per contract | ✅ |
| Hours | Varies by market | ✅ Market-specific |

---

## 9. Agent Tools (IMPLEMENTED)

| Tool | Purpose | Location |
|------|---------|----------|
| `MarketDataTool` | Stream + snapshot quotes/bars, options chains | `src/tools/market_data.py` |
| `OrderTool` | Place/cancel/replace with idempotency + risk | `src/tools/order.py` |
| `PortfolioTool` | Positions, balances, P&L, kill switch | `src/tools/portfolio.py` |
| `RiskTool` | Pre-trade checks, limits, circuit breaker | `src/tools/risk.py` |
| `JournalTool` | Audit trail, decision logging, export | `src/tools/journal.py` |

### Tool Features

**MarketDataTool:**
- Real-time streaming (quotes, trades, bars)
- Snapshot queries with caching
- Historical bars with adjustments
- Options chain + Greeks access
- Kalshi orderbook support

**OrderTool:**
- All order types (market, limit, stop, bracket, trailing)
- Idempotent submission
- Pre-trade risk checks (automatic)
- Bracket/OCO order helpers
- Cancel/replace operations
- Kalshi order support

**PortfolioTool:**
- Account info with caching
- Position tracking with P&L
- Portfolio analytics
- Kill switch (close all)
- Kalshi balance/positions

**RiskTool:**
- Pre-trade order checks
- Kill switch control
- Circuit breaker status/reset
- Dry-run mode toggle
- Limit configuration
- Exposure analysis

**JournalTool:**
- Structured event logging
- Full order lifecycle tracking
- Risk event documentation
- File-based persistence (JSONL)
- Query and export capabilities

---

## 10. Implementation Status

### Completed ✅
- [x] Alpaca broker client with all order types
- [x] Kalshi broker client
- [x] WebSocket streaming for both
- [x] Rate limiting with backoff
- [x] Idempotent order submission
- [x] Custom risk engine with all controls
- [x] Circuit breaker
- [x] Kill switch
- [x] Human approval workflow
- [x] Status monitoring
- [x] All 5 agent tools
- [x] Audit logging (JournalTool)
- [x] Comprehensive test suite
- [x] Configuration system
- [x] Documentation

### Future Enhancements
- [ ] Key rotation automation
- [ ] Webhook server for fills (if brokers add support)
- [ ] HashiCorp Vault integration
- [ ] Multi-broker order routing
- [ ] FIX protocol for lowest latency
- [ ] Real-time P&L dashboard

---

## Appendix A: Quick Start

```bash
# 1. Set environment variables
export ALPACA_PAPER_API_KEY="your-key"
export ALPACA_PAPER_API_SECRET="your-secret"
export KALSHI_DEMO_EMAIL="your-email"
export KALSHI_DEMO_PASSWORD="your-password"

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run tests
pytest tests/ -v

# 4. Start in dry-run mode
python -m src.main dry-run
```

## Appendix B: Risk Engine Quick Reference

```python
from src.risk import RiskEngine, RiskLimits, get_risk_engine

# Configure
limits = RiskLimits(max_order_notional=10000, max_daily_loss=5000)
engine = RiskEngine(limits=limits, dry_run=True)

# Check order
result = await engine.check_order(order, positions, market_price)
if result.approved:
    # Safe to submit
    pass
elif result.action == RiskAction.REQUIRE_APPROVAL:
    # Queue for human approval
    pass
else:
    # Rejected - check result.checks_failed
    pass

# Kill switch
engine.activate_kill_switch("Emergency")
```

---

## Revision History

| Date | Change |
|------|--------|
| 2026-02-02 | Initial comprehensive audit |
| 2026-02-02 | Added human approval workflow |
| 2026-02-02 | Added status monitoring |
| 2026-02-02 | Completed implementation of all requirements |
