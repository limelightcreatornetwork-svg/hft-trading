# HFT Trading Platform — Requirements Backlog

*Compiled 2026-02-02*

## A. Strategy Requirements

### A1) Regime Detection and Strategy Gating
- Regime classifier (per symbol + market-wide)
  - Inputs: realized vol, directional strength, spread, volume anomaly, gap/halts flags
  - Output: REGIME ∈ {CHOP, TREND, VOL_EXPANSION, NEWSY/UNTRADEABLE}
- Strategy eligibility matrix (e.g., mean reversion only in CHOP with tight spreads)
- Per-symbol cooldown & "no-trade windows"
- Data quality gates (stale quotes, wide spreads → block entries)

### A2) Clear Alpha Definitions (parameterized & testable)
Per strategy needs:
- Signal definition (exact inputs, trigger logic)
- Entry rules (marketable limit vs limit, max slippage, confirmation)
- Exit rules (TP/SL brackets, trailing, time stop, kill on spread widening)
- Position sizing function
- Re-entry rules
- "Do nothing" conditions

### A3) Risk-Adjusted Sizing
- Risk-per-trade sizing: `risk_dollars = equity * risk_pct`, size from stop distance + volatility
- Volatility scaling (ATR/realized vol)
- Liquidity scaling (cap based on quote size)
- Portfolio exposure limits (gross, net, per-sector)

### A4) Slippage-Aware Execution
- Pre-trade quote checks (max spread bps, min book size)
- Order type policy per strategy
- Partial fill policy
- Cancel/replace throttling

### A5) Options Strategy Family
- Separate risk limits (max premium, max delta, max contracts, max legs)
- Liquidity gates (min volume/OI, max bid-ask, stale block)
- Assignment/early exercise policies
- Time horizon rules (intraday vs multi-day separation)

## B. System Architecture Requirements

### B1) Event-Driven Core
Schemas (versioned):
- MarketEvent, FeatureSnapshot, TradeIntent, RiskDecision, OrderCommand, OrderEvent, PositionSnapshot
- Every message: event_id, timestamp, symbol, strategy_id, correlation_id
- Persist "golden log" for replay

### B2) OMS State Machine
States: NEW → SUBMITTED → ACCEPTED → PARTIAL → FILLED / CANCELED / REJECTED / EXPIRED / REPLACED
- Idempotency: mandatory client_order_id, OMS dedupes
- Reconciliation loop: periodic fetch open orders + positions, repair drift
- "Flatten" functionality: cancel all, staged liquidation

### B3) Risk Engine (Layered)
Pre-trade:
- Allowlist, size caps, exposure caps, notional caps
- Spread/liquidity caps, max orders/minute

In-trade:
- Daily loss limit (realized + unrealized)
- Max drawdown from intraday peak
- Slippage/latency anomaly detection

Kill switch:
- Manual (UI) + automatic triggers
- Triggers: 429 storms, WS disconnect loops, consecutive rejects, loss limit breach
- All decisions logged + explainable

### B4) Data Ingestion Reliability
- WS connection manager (reconnect with backoff, resubscribe, resync on reconnect)
- Staleness detection (no quotes for X ms → mark untradeable)
- Market hours awareness (halts, closed, early closes)

## C. Testing & Research

### C1) Replay-Driven Backtesting
- Event replay harness (feed recorded events, produce intents, simulate execution)
- Slippage + spread model (bid/ask fills, partial fills)
- Latency model (configurable delay)
- Walk-forward evaluation

### C2) Metrics
Strategy: win rate, avg win/loss, expectancy, sharpe, MAE, MFE
Execution: slippage bps, fill rate, time-to-fill, cancel rate
Risk: exposure time, tail loss frequency, stop-out clusters
Stability: WS uptime, reconnect count, 429 count, error rates

## D. Observability & Dashboard

### D1) Monitoring + Alerting
Alerts for: daily loss breach, drawdown, stuck orders, cancel/reject storms, staleness, WS disconnects
Dashboards: regime per symbol, exposure/PnL, order lifecycle, risk rejects

### D2) UI for Safety-First Control
- One-click: Pause strategies, Disable symbol, Flatten all
- Config management with versioning, staged rollout (shadow → paper → small-live)
- Audit log for all changes

## E. Security
- Keys never exposed to UI (trading service holds keys)
- RBAC (admin vs viewer)
- Secure secret storage
- Rate limiter at gateway with safety reserve

## F. Deployment
- Always-on service (not serverless)
- Health checks + auto-restart
- Blue/green or staged release
- Persistent storage for logs, state, configs, audit

---

## Priority: Top 10 If Limited Time
1. Regime detection + strategy gating
2. Risk-per-trade sizing
3. OMS state machine + idempotency
4. Reconciliation loop (orders/positions)
5. Quote-based spread/liquidity gates
6. Cancel/replace throttling
7. Replay testing with spreads + latency
8. Automatic kill switch triggers
9. Audit log + config versioning
10. Ops dashboard: Pause / Disable symbol / Flatten
