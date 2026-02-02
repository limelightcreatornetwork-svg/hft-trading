# Alpaca "HFT-style" Trading Backend — Proposal & Game Plan
*Target use: a fast, event-driven automated trading system on Alpaca that an agent ("open claw") can safely use as its execution layer.*

> **Reality check:** "true HFT" (microseconds, co-location, direct exchange access) is not feasible on Alpaca's standard REST Trading API. This proposal targets **event-driven, low-latency intraday automation** using **streaming market data** + a robust **OMS/risk gateway**, and optionally **FIX** for more professional execution plumbing.

## Tech Framework
- **Frontend/Dashboard:** Next.js 14+ (App Router, Server Components)
- **UI Components:** shadcn/ui + Tailwind CSS
- **Database:** Prisma ORM + PostgreSQL
- **Real-time:** WebSocket connections for market data and order updates

---

## 1) Objectives

### Primary goals
- **Fast reaction** to real-time market events (quotes/trades) using Alpaca **WebSockets**.
- **Safe execution layer** that an agent can call without holding broker keys.
- **Hard risk controls** (pre-trade & intraday) and an immediate **kill switch**.
- **Production-grade OMS**: deterministic order state machine, idempotency, retries, reconciliation.
- **Replayable event log** for debugging/backtesting on the same strategy code.
- Paper-first rollout, then **staged live deployment** with tight limits.

### Success metrics (initial)
- 99%+ uptime during market hours (defined by your deployment SLO).
- <250ms median "signal → order submission" on a stable VPS (not counting broker/exchange latency).
- Zero duplicated orders (idempotency).
- All trades attributable to an intent + risk decision log.
- Daily max-loss never violated in paper tests over 2+ weeks.

---

## 2) Non-goals (explicit)
- Co-location / sub-millisecond exchange routing.
- Market-making strategies requiring heavy cancel/replace traffic (likely to hit rate limits).
- Full depth order book strategies needing L2/L3 at ultra-low latency.
- High-frequency multi-venue arbitrage requiring direct market access.

---

## 3) Target Use Cases (what this system is built for)

### Equities
1. **Event-driven scalping / micro-momentum**
   - Trade bursts after rapid price/volume changes on a small symbol universe.

2. **Short-horizon mean reversion**
   - Z-score on short window returns; avoid over-trading.

3. **Breakout / volatility expansion**
   - Quick entries/exits when regime shifts.

4. **Execution quality tooling**
   - TWAP/VWAP-lite slicing; bracket exits; protective stops.

5. **Crypto automation (24/7)**
   - Similar architecture; different session rules.

### Options Trading
6. **Directional options plays**
   - Buy calls/puts on momentum signals
   - Defined risk with premium as max loss

7. **Premium selling strategies**
   - Covered calls on long equity positions
   - Cash-secured puts for entry
   - Credit spreads (vertical spreads)

8. **Volatility strategies**
   - Straddles/strangles around events
   - Iron condors for range-bound markets

9. **Options risk controls**
   - Max Greeks exposure (delta, gamma, theta, vega)
   - Position limits per underlying
   - Days-to-expiration filters (avoid holding through expiry)
   - Max premium at risk per trade

---

## 4) System Overview (High-Level Architecture)

**Key idea:** Separate "what to do" (signals/agent) from "whether we allow it" (risk) and "how we do it" (execution).

### Components

1. **Market Data Ingestor**
   - Alpaca Market Data WebSocket → normalize events → publish to internal bus.

2. **Feature Store / State**
   - Rolling windows, OHLC micro-bars, vol, spreads, etc.

3. **Strategy Engine**
   - Consumes events → produces `TradeIntent` messages.

4. **Risk Engine**
   - Hard gates (notional, exposure, order rate, drawdown, symbol allowlist).

5. **OMS / Execution Engine**
   - Order state machine, submit/replace/cancel, reconciliation, throttling.

6. **Broker Adapter (Alpaca)**
   - REST + Trading WebSocket (`trade_updates`), optionally FIX.

7. **Event Log + Storage**
   - Append-only event store; Postgres for orders/fills; time-series for metrics.

8. **Observability**
   - Metrics, tracing, logs, alerting, dashboards.

### Data flow (simplified)
Market WS → `MarketEvent` bus → Strategy → `TradeIntent` → Risk → `ApprovedIntent`/`RejectedIntent` → OMS → Alpaca submit → `trade_updates` → `OrderEvent` → storage/monitoring

---

## 5) "Open Claw" Integration Pattern (Safe Trading Gateway)

**Strong recommendation:** the agent never sees Alpaca keys.

### Gateway responsibilities
- Authenticate agent calls (API key, JWT, mTLS, etc.).
- Enforce **capabilities** and **budgets**:
  - Symbol allowlist
  - Max order size / max position per symbol
  - Max daily trades
  - Max daily loss / max drawdown
  - Trading hours/session rules
  - Rate limit budget (per minute)
- Provide idempotent endpoints for submit/cancel/replace.
- Persist every request + decision for auditability.

### Why this matters
- Limits blast radius if the agent is wrong, compromised, or hallucinating.
- Lets you swap brokers later without changing the agent interface.

---

## 6) Risk Controls (Minimum Viable Safety)

### Pre-trade checks (must-pass)
- **Symbol allowlist** + optional "restricted symbols" list.
- Max notional per order.
- Max position per symbol / gross exposure / net exposure.
- Max leverage (if margin enabled) and buying power checks.
- Price sanity checks (limit within X bps of mid; block stale quotes).
- Order rate budget and cooldown rules (to avoid throttles & runaway loops).

### Intraday controls
- **Daily loss limit** (hard stop for new orders).
- Max drawdown from peak intraday equity.
- Kill switch (manual + automatic triggers).
- Rejection spike detector (e.g., 5 rejects in 60s → pause).
- Data feed health (gap/lag detector; if market data stale → pause).

### Kill switch behavior
- Immediately disable new orders.
- Optionally cancel open orders.
- Optionally flatten positions (configurable and carefully limited).

---

## 7) OMS Design (Execution Engine)

### Core requirements
- Deterministic order state machine:
  - `NEW → SUBMITTED → ACCEPTED → PARTIAL → FILLED`
  - `… → CANCELED / REJECTED / EXPIRED`

- **Idempotency**
  - Agent supplies `client_intent_id`; OMS ensures "exactly-once" semantics.

- **Retry logic**
  - Retries only on safe transient failures; never duplicate orders.

- **Rate-limit aware**
  - Token bucket for REST calls; prefer WS updates over polling.

- **Reconciliation**
  - On restart: fetch open orders/positions → reconcile with local state.

- **Order types**
  - Limit for entries; bracket exits for protection; strict rules for market orders.

---

## 8) Tech Stack (Recommended)

### Frontend (Dashboard & Admin)
- **Next.js 14+** (App Router, React Server Components)
- **shadcn/ui** + **Tailwind CSS** for UI components
- **Prisma ORM** for database access
- **TanStack Query** for data fetching/caching

### Backend / Services
- **Next.js API Routes** for the trading gateway API
- **TypeScript** throughout for type safety
- **Python**: strategy research, backtesting, feature prototyping (separate service)

### Messaging
Pick one:
- NATS (simple, low-latency)
- Redis Streams (easy operationally)
- Kafka (heavier, best for large scale)

### Storage
- **PostgreSQL** (orders, fills, positions, configs, audit logs)
- **Prisma** as ORM with type-safe queries
- TimescaleDB (metrics/time-series) or ClickHouse (optional)
- Object storage (S3-compatible) for raw event logs and replays

### Observability
- OpenTelemetry + Prometheus + Grafana
- Sentry (errors)

### Deployment
- Start with a single VPS (NY region if possible) + Docker Compose
- Later: k8s or Vercel if you outgrow it

---

## 9) API Contract (Trading Gateway)

### Auth
- `Authorization: Bearer <token>` (JWT) or HMAC API key
- Rate limit at gateway level (independent from broker)

### Endpoints (minimal)

#### `GET /v1/state`
Returns:
- balances, buying power
- open positions
- open orders
- risk headroom (remaining notional, remaining daily loss, etc.)
- current mode (paper/live)

#### `POST /v1/intents`
Submit an intent (idempotent).

Request:
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

Response:
```json
{
  "status": "accepted",
  "intent_id": "uuid",
  "order_id": "alpaca_order_id_or_internal",
  "risk": {
    "checks_passed": true,
    "headroom": {}
  }
}
```

Or rejection:
```json
{
  "status": "rejected",
  "intent_id": "uuid",
  "reason": "max_position_exceeded",
  "details": "AAPL position would exceed 5,000 USD notional cap"
}
```

#### `POST /v1/orders/{order_id}/cancel`
Cancels an order (idempotent).

### Options Endpoints

#### `GET /v1/options/chain/{underlying}`
Get options chain for an underlying symbol.
```json
{
  "underlying": "AAPL",
  "expirations": ["2026-02-07", "2026-02-14", "2026-02-21"],
  "strikes": [185, 187.5, 190, 192.5, 195],
  "contracts": [
    {
      "symbol": "AAPL260207C00190000",
      "type": "call",
      "strike": 190,
      "expiration": "2026-02-07",
      "bid": 2.15,
      "ask": 2.20,
      "delta": 0.52,
      "iv": 0.28
    }
  ]
}
```

#### `POST /v1/options/intents`
Submit an options trade intent.
```json
{
  "client_intent_id": "uuid",
  "contract": "AAPL260207C00190000",
  "side": "buy_to_open",
  "qty": 1,
  "type": "limit",
  "limit_price": 2.18,
  "meta": {
    "strategy": "momentum_calls",
    "underlying_signal": "breakout",
    "max_premium_risk": 218
  }
}
```

#### `GET /v1/options/positions`
Get current options positions with Greeks.
```json
{
  "positions": [
    {
      "contract": "AAPL260207C00190000",
      "qty": 2,
      "avg_cost": 2.15,
      "current_price": 2.45,
      "pnl": 60,
      "delta": 1.04,
      "gamma": 0.08,
      "theta": -0.12,
      "vega": 0.15
    }
  ],
  "portfolio_greeks": {
    "net_delta": 104,
    "net_gamma": 8,
    "net_theta": -12,
    "net_vega": 15
  }
}
```

#### `POST /v1/controls/kill_switch`
```json
{
  "enabled": true,
  "mode": "cancel_only"
}
```

Modes:
- `block_new` (block new orders, keep existing)
- `cancel_only` (cancel open orders)
- `flatten` (flatten positions — optional, high risk)

### Webhooks / streaming to agent (optional)
- Provide a WS endpoint for agent to subscribe to:
  - `OrderEvent`, `FillEvent`, `RiskEvent`, `PnLEvent`

---

## 10) Data Model (Minimum)

### Tables (Postgres via Prisma)

**Core Trading**
- `intents`
- `risk_decisions`
- `orders`
- `fills`
- `positions_snapshots`
- `account_snapshots`
- `configs` (limits, allowlists, modes)
- `events` (append-only pointer to raw logs)

**Options-Specific**
- `options_contracts` (symbol, underlying, strike, expiration, type)
- `options_positions` (contract, qty, cost_basis, greeks)
- `options_chains_cache` (underlying, expiration, strikes, last_updated)
- `options_greeks_history` (position snapshots with Greeks over time)

### Event log (append-only)
- `MarketEvent`
- `TradeIntent`
- `RiskDecision`
- `OrderEvent`
- `FillEvent`
- `SystemHealthEvent`
- `OptionsGreeksEvent` (delta, gamma, theta, vega snapshots)

---

## 11) Build Plan (Phased Game Plan)

### Phase 0 — Bootstrap (Day 1–2)
**Deliverable:** minimal working pipeline in paper trading.
- Create Alpaca paper account + keys.
- Connect to Market Data WS; print/record events for 1–2 symbols.
- Submit a single limit order; receive `trade_updates` events.
- Store orders/fills in Postgres.

**Exit criteria**
- Reliable WS connection + reconnect.
- Successful order round-trip in paper.

### Phase 1 — OMS + Risk MVP (Week 1)
**Deliverable:** safe gateway with deterministic execution.
- Implement order state machine and idempotent `POST /intents`.
- Implement risk checks:
  - allowlist
  - max order size/notional
  - max position per symbol
  - max daily trades
  - order-rate limiter
- Add kill switch and cool-down rules.
- Add reconciliation on startup.

**Exit criteria**
- Zero duplicate orders in chaos testing.
- Rate limit budget enforced; no runaway request loops.

### Phase 2 — Strategy MVP + Replay (Week 2)
**Deliverable:** first event-driven strategy + replayable tests.
- Build "small universe" strategy (5–20 symbols).
- Log raw market events and build a replay harness feeding the same strategy code.
- Add slippage + transaction cost accounting (conservative).

**Exit criteria**
- Strategy runs for full sessions without failures in paper.
- Replay reproduces decisions deterministically.

### Phase 3 — Production Hardening (Week 3)
**Deliverable:** ops-ready system.
- Metrics (latency, rejects, fills, WS lag).
- Alerts (kill switch triggers, 429 spikes, data gaps).
- Secure secrets (vault/SSM), rotate keys, audit logs.
- Automated integration tests for OMS/risk.

**Exit criteria**
- Observability dashboards reflect reality.
- Fault injection: network drops, WS reconnects, 429 throttles.

### Phase 4 — Staged Live Rollout (Week 4+)
**Deliverable:** controlled live trading with tight caps.
- Start with tiny notional caps and strict daily loss limit.
- Gradually expand symbols and budgets as stability proven.
- Add second strategy only after post-trade analysis is consistent.

**Exit criteria**
- No risk limit breaches.
- Consistent fills and acceptable slippage.

---

## 12) Operational Checklist (Runbook)
- Before open:
  - WS healthy, clock sync, DB reachable, risk config loaded.
- During session:
  - watch 429/reject rates, WS lag, PnL drawdown, open orders.
- If anomaly:
  - enable kill switch → cancel open orders → investigate.
- After close:
  - archive logs, compute slippage, review rejects, update limits.

---

## 13) Security & Compliance Notes (Practical)
- Keep broker keys in a secret manager; never expose to agent.
- Separate paper and live environments completely (keys, endpoints, DB).
- Keep immutable audit logs of all intents and risk decisions.
- "Flatten positions" should require stronger authorization (human / multi-sig style approval).

---

## 14) Resources (Start Here)
- Alpaca Trading API: Orders, account, positions
  https://docs.alpaca.markets/docs/trading-api
- Market Data streaming (WebSocket)
  https://docs.alpaca.markets/docs/streaming-market-data
- Trading WebSocket (`trade_updates`)
  https://docs.alpaca.markets/docs/websocket-streaming
- Order types (limit, stop, bracket, etc.)
  https://docs.alpaca.markets/docs/orders-at-alpaca
- Paper trading environment
  https://docs.alpaca.markets/docs/paper-trading
- API usage limits / rate limiting guidance
  https://alpaca.markets/support/usage-limit-api-calls
- FIX API (optional)
  https://docs.alpaca.markets/docs/fix-api

---

## 15) Immediate Next Steps (Actionable)

1. Stand up the **paper gateway** service + Postgres (Docker Compose).
2. Implement WS ingestor + `trade_updates` listener.
3. Implement `POST /intents` with allowlist + notional caps + idempotency.
4. Add kill switch + startup reconciliation.
5. Run 3 full paper sessions; review slippage/rejects/latency.
6. Only then start integrating the agent on the intent API.

---

### Appendix A — Suggested Repo Structure

```
trading-backend/
  services/
    gateway/
    oms/
    strategy/
    marketdata/
  libs/
    schemas/
    risk/
    alpaca_adapter/
  infra/
    docker-compose.yml
    migrations/
  docs/
    proposal.md
    runbook.md
```

### Appendix B — Minimal Message Schemas

- `MarketEvent`: {ts, symbol, type, bid, ask, last, size}
- `TradeIntent`: {client_intent_id, symbol, side, qty, type, price, meta}
- `RiskDecision`: {intent_id, accepted, reason, limits_snapshot}
- `OrderEvent`: {order_id, state, filled_qty, avg_fill_price}
- `SystemHealthEvent`: {component, status, ws_lag_ms, errors}
