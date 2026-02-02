# HFT Trading Strategy — Alpaca

*Event-driven, low-latency intraday automation*

---

## Reality Check

This is NOT true HFT (microsecond co-location). We're targeting **<250ms signal-to-order** on Alpaca's API — fast retail automation, not institutional speed.

---

## Target Strategies

### Equities

| Strategy | Description | Edge |
|----------|-------------|------|
| **Micro-momentum scalping** | Trade bursts after rapid price/volume changes | React to momentum before retail crowd |
| **Short-horizon mean reversion** | Z-score on short window returns | Fade overextensions |
| **Breakout / volatility expansion** | Quick entries when regime shifts | Catch moves early |
| **Execution tools** | TWAP/VWAP slicing, bracket exits | Better fills, defined risk |

### Options

| Strategy | Description | Risk Profile |
|----------|-------------|--------------|
| **Directional plays** | Buy calls/puts on momentum signals | Premium = max loss |
| **Covered calls** | Sell calls on long positions | Income, capped upside |
| **Cash-secured puts** | Sell puts for entry | Get paid to wait |
| **Credit spreads** | Vertical spreads | Defined risk premium selling |
| **Straddles/strangles** | Event volatility plays | Profit from big moves either way |
| **Iron condors** | Range-bound markets | Collect theta in sideways action |

---

## Architecture

```
Market WS → Feature Store → Strategy Engine → Risk Engine → OMS → Alpaca
               ↓                   ↓                ↓            ↓
         Rolling windows     TradeIntent     ApprovedIntent   Orders
         OHLC micro-bars                     RejectedIntent   Fills
         Vol, spreads
```

### Key Principle

**Separation of concerns:**
- Strategy → "what to do"
- Risk → "whether we allow it"
- OMS → "how we do it"

Agent never sees broker keys. Gateway enforces all limits.

---

## Risk Controls

### Pre-Trade (Must Pass)

- [ ] Symbol on allowlist
- [ ] Order size ≤ max notional
- [ ] Position ≤ max per symbol
- [ ] Gross/net exposure within limits
- [ ] Buying power sufficient
- [ ] Price within X bps of mid (no stale quotes)
- [ ] Order rate under budget

### Intraday Controls

- [ ] Daily loss limit (hard stop)
- [ ] Max drawdown from peak
- [ ] Rejection spike detector (5 rejects/60s → pause)
- [ ] Data feed health (stale → pause)

### Options-Specific

- [ ] Max Greeks exposure (delta, gamma, theta, vega)
- [ ] Position limits per underlying
- [ ] DTE filters (no holding through expiry)
- [ ] Max premium at risk per trade

### Kill Switch

Triggers:
- Manual activation
- Daily loss limit hit
- Rejection spike
- Data feed failure

Actions:
1. Block new orders
2. Cancel open orders
3. (Optional) Flatten positions

---

## OMS Design

### Order State Machine

```
NEW → SUBMITTED → ACCEPTED → PARTIAL → FILLED
                      ↓
              CANCELED / REJECTED / EXPIRED
```

### Requirements

- **Idempotency**: `client_intent_id` ensures exactly-once
- **Retry logic**: Only on safe transient failures
- **Rate-limit aware**: Token bucket for REST, prefer WS updates
- **Reconciliation**: On restart, fetch/reconcile open orders

---

## API Contract

### Submit Intent

```json
POST /v1/intents
{
  "client_intent_id": "uuid",
  "symbol": "AAPL",
  "side": "buy",
  "qty": 10,
  "type": "limit",
  "limit_price": 189.12,
  "meta": {
    "strategy": "micro_momo_v1",
    "reason": "breakout",
    "confidence": 0.62
  }
}
```

### Response (Accepted)

```json
{
  "status": "accepted",
  "intent_id": "uuid",
  "order_id": "alpaca_order_id"
}
```

### Response (Rejected)

```json
{
  "status": "rejected",
  "reason": "max_position_exceeded",
  "details": "AAPL would exceed 5,000 USD cap"
}
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Uptime during market hours | 99%+ |
| Signal → order submission | <250ms median |
| Duplicate orders | Zero |
| Daily max-loss violations | Zero |

---

## Build Phases

### Phase 0 — Bootstrap (Day 1-2)
- Paper account setup
- Market Data WS connected
- Single order round-trip working

### Phase 1 — OMS + Risk MVP (Week 1)
- Order state machine
- Risk checks implemented
- Kill switch working

### Phase 2 — Strategy + Replay (Week 2)
- First strategy running (small universe)
- Event replay for testing
- Transaction cost accounting

### Phase 3 — Production Hardening (Week 3)
- Metrics & alerting
- Fault injection testing
- Security audit

### Phase 4 — Live Rollout (Week 4+)
- Tiny caps initially
- Gradual expansion
- Post-trade analysis

---

## Tech Stack

| Component | Choice |
|-----------|--------|
| Frontend | Next.js 14+, shadcn/ui, Tailwind |
| Database | PostgreSQL + Prisma |
| Messaging | NATS or Redis Streams |
| Time-series | TimescaleDB (optional) |
| Observability | OpenTelemetry + Prometheus + Grafana |

---

## Resources

- [Alpaca Trading API](https://docs.alpaca.markets/docs/trading-api)
- [Market Data WebSocket](https://docs.alpaca.markets/docs/streaming-market-data)
- [Trading WebSocket](https://docs.alpaca.markets/docs/websocket-streaming)
- [Order Types](https://docs.alpaca.markets/docs/orders-at-alpaca)
- [Paper Trading](https://docs.alpaca.markets/docs/paper-trading)

---

*Live dashboard: https://hft-trading-chi.vercel.app*
