# Kalshi AI Trading Agent - Requirements Specification

**Version:** 1.0.0  
**Last Updated:** 2026-02-02  
**Status:** Implementation In Progress

---

## Executive Summary

This document specifies requirements for an AI-powered trading agent on Kalshi prediction markets. The agent will discover market opportunities, price contracts using probabilistic models, execute trades with robust risk controls, and provide full auditability.

### Key Capabilities
- **Market Discovery**: Automated ingestion, filtering, and thesis tracking
- **Pricing Engine**: Implied probability, forecast models, edge computation
- **Execution**: Order management with risk checks and reconciliation
- **Risk Controls**: Position limits, loss limits, circuit breakers, kill switch
- **Strategies**: Value, event-driven, market making, arbitrage
- **Observability**: Full audit trail, dashboard, alerts

---

## 1. Platform Assumptions

### 1.1 Kalshi Contract Model
| Attribute | Value | Notes |
|-----------|-------|-------|
| Contract Type | Binary | $1 if true, $0 if false |
| Price Range | 1¢ - 99¢ | Implied probability |
| Settlement | Event outcome | T+0 after resolution |
| Max Position | $25,000 | Per market |
| Fees | 7¢/contract | Both entry and exit |

### 1.2 API Architecture
- **REST API**: Orders, positions, markets, account
- **WebSocket**: Real-time orderbook, trades, fills
- **Rate Limits**: 10 req/sec REST, unlimited WebSocket
- **Auth**: Email/password or API key

### 1.3 Fee Impact on EV

For a trade at price `p` (probability in cents):
```
Buy YES at p:
  Cost = p + 7¢ fee
  Expected Value = (True Prob × 100) - Cost
  
Sell YES at p:
  Proceeds = p - 7¢ fee
  
Breakeven Edge = 7¢ / (100 - p) ≈ 7-15% depending on price
```

**Implication**: Minimum edge threshold must account for round-trip fees (14¢).

### 1.4 Compliance Kill Switch

The system must support immediate trading halt by:
- **Category**: Block specific market categories (politics, crypto, weather)
- **Jurisdiction**: Block markets not available in certain regions
- **Manual Override**: Human-triggered emergency stop

---

## 2. Agent Capabilities

### 2.1 Market Discovery

#### A. Market Ingestion
```yaml
Requirements:
  - Poll /markets endpoint every 5 minutes
  - Cache market metadata in Postgres
  - Track market lifecycle: open → closed → settled
  - Handle pagination (100+ markets)
  
Data to Capture:
  - ticker, title, category, series
  - open_time, close_time, settle_time
  - yes_price, no_price, volume, open_interest
  - rules_text (for NLP parsing)
```

#### B. Market Filtering
```yaml
Filter Criteria:
  - min_volume: 1000 contracts/day
  - min_open_interest: 500 contracts
  - min_days_to_close: 1 day
  - max_spread_pct: 20%
  - categories: [configurable allowlist]
  - liquidity_score: derived metric
  
Output:
  - Filtered market list
  - Reason for exclusion (logged)
```

#### C. Signal Research
```yaml
Signal Types:
  - price_momentum: 1h, 4h, 24h price changes
  - volume_spike: vs 7-day average
  - spread_compression: improving liquidity
  - external_data: news, polls, forecasts
  
Implementation:
  - Signal registry with pluggable providers
  - Signal strength normalization (0-1)
  - Signal decay over time
```

#### D. Thesis Tracking
```yaml
Thesis Structure:
  id: uuid
  market_ticker: string
  created_at: timestamp
  hypothesis: text (e.g., "Market underprices YES due to recency bias")
  supporting_signals: [signal_id, ...]
  target_price: int (1-99)
  confidence: float (0-1)
  status: active | invalidated | realized
  
Lifecycle:
  1. Create thesis from signal confluence
  2. Track price movement vs prediction
  3. Invalidate if signals reverse
  4. Realize on trade execution
  5. Score accuracy for model calibration
```

### 2.2 Pricing Engine

#### A. Implied Probability
```yaml
From Market Price:
  implied_prob_yes = yes_price / 100
  implied_prob_no = no_price / 100
  
Overround Check:
  overround = implied_prob_yes + implied_prob_no
  if overround > 1.10: market is illiquid, avoid
```

#### B. Forecast Models
```yaml
Model Types:
  1. Base Rate Model:
     - Historical frequency of similar events
     - Example: "How often does [X] happen?"
  
  2. Polling Aggregator:
     - For election/political markets
     - Bayesian update from multiple sources
  
  3. Time Decay Model:
     - For time-sensitive events
     - Exponential approach to outcome
  
  4. Ensemble Model:
     - Weighted combination of above
     - Weights trained on historical accuracy
```

#### C. Calibration
```yaml
Calibration Tracking:
  - Bin predictions by probability (0-10%, 10-20%, etc.)
  - Track realized outcomes per bin
  - Calculate Brier score
  - Adjust model confidence based on calibration
  
Target: Brier score < 0.20
```

#### D. Edge Computation
```yaml
Edge Calculation:
  model_prob: float  # Our estimated probability
  market_prob: float  # Implied from price
  
  raw_edge = model_prob - market_prob
  fee_adjusted_edge = raw_edge - (0.14 / (100 - market_price))
  
  Trade Signal:
    if fee_adjusted_edge > min_edge_threshold:
      direction = YES if model_prob > market_prob else NO
      size = kelly_fraction(edge, bankroll)
```

### 2.3 Execution Engine

#### A. Order Management
```yaml
Order Lifecycle:
  1. Generate order from strategy signal
  2. Pre-trade risk check (blocking)
  3. Submit with client_order_id (idempotency)
  4. Track in pending_orders map
  5. Receive WebSocket confirmation
  6. Update position and risk trackers
  7. Log to journal

Order Types:
  - Limit only (Kalshi limitation)
  - Pseudo-market: limit at 99 (buy YES) or 1 (buy NO)
```

#### B. Queue Position Estimation
```yaml
Orderbook Analysis:
  - Track our order's position in queue
  - Estimate fill probability based on:
    * Queue depth ahead of us
    * Historical fill rates at price level
    * Time in queue
  
  Actions:
  - Improve price if queue position deteriorating
  - Cancel if market moved away
```

#### C. WebSocket Updates
```yaml
Subscriptions:
  - orderbook_delta: Real-time book updates
  - trade: Public trade feed
  - fill: Our fills
  - order: Our order status changes

Handlers:
  - Update local orderbook replica
  - Detect sequence gaps → full refresh
  - Trigger strategy re-evaluation on fills
```

#### D. Position Reconciliation
```yaml
Reconciliation Process:
  every 5 minutes:
    1. Fetch positions from REST API
    2. Compare to local position tracker
    3. If mismatch > 0:
       - Log discrepancy
       - Alert if significant
       - Correct local state
    4. Update risk engine with actual positions
```

---

## 3. Risk Controls

### 3.1 Portfolio-Level Controls

| Control | Default | Range | Notes |
|---------|---------|-------|-------|
| max_total_notional | $10,000 | $1k-$25k | Total across all positions |
| max_position_per_market | $2,000 | $100-$5k | Per market limit |
| max_daily_loss | $500 | $100-$2k | Triggers halt |
| max_drawdown_pct | 10% | 5%-25% | From peak equity |
| max_open_positions | 20 | 5-50 | Diversification |

### 3.2 Order-Level Controls

| Control | Default | Notes |
|---------|---------|-------|
| max_order_size | $500 | Per order |
| max_spread_pct | 15% | Reject if spread too wide |
| min_liquidity | 100 contracts | At our price level |
| slippage_limit | 5¢ | Max price deviation |

### 3.3 Kill Switch

```yaml
Triggers:
  - Manual activation (human override)
  - Daily loss limit exceeded
  - Circuit breaker tripped
  - API errors > threshold
  - Compliance flag raised

Actions:
  1. Set kill_switch_active = true
  2. Cancel all open orders
  3. Log reason and timestamp
  4. Send alert notification
  5. Optionally close all positions

SLA: Kill switch must execute in < 5 seconds
```

### 3.4 Circuit Breakers

```yaml
Conditions:
  - Reject rate > 30% over 20 orders
  - Avg slippage > 5% over 20 orders
  - WebSocket disconnected > 60 seconds
  - Rate limit errors > 5 in 1 minute

States:
  - CLOSED: Normal operation
  - OPEN: Trading halted, cooldown active
  - HALF_OPEN: Testing with reduced size

Cooldown: 5 minutes, then auto-test
```

### 3.5 Human Approval Mode

```yaml
Thresholds:
  - Order notional > $1,000
  - Daily loss > $200
  - New market category
  - Position would exceed 50% of max

Workflow:
  1. Order queued for approval
  2. Notification sent to operator
  3. Operator reviews and approves/rejects
  4. Timeout: 15 minutes → auto-reject
```

---

## 4. Strategy Modules

### 4.1 Strategy Interface

```python
class Strategy(ABC):
    """Base class for all trading strategies."""
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Strategy identifier."""
        pass
    
    @property
    @abstractmethod
    def version(self) -> str:
        """Strategy version."""
        pass
    
    @abstractmethod
    async def evaluate(
        self, 
        market: Market,
        thesis: Optional[Thesis],
        context: StrategyContext,
    ) -> Optional[Signal]:
        """
        Evaluate market and return trading signal if any.
        
        Args:
            market: Market data and metadata
            thesis: Active thesis for this market (if any)
            context: Portfolio, risk, and execution context
        
        Returns:
            Signal with direction, size, and confidence, or None
        """
        pass
    
    @abstractmethod
    def get_parameters(self) -> Dict[str, Any]:
        """Return current strategy parameters."""
        pass
    
    @abstractmethod
    def set_parameters(self, params: Dict[str, Any]):
        """Update strategy parameters."""
        pass
```

### 4.2 Value/Mispricing Strategy

```yaml
Description: Identify markets where model probability differs significantly from market price

Parameters:
  min_edge: 0.10  # 10% edge after fees
  confidence_threshold: 0.7
  max_position_pct: 0.25  # of max per market

Logic:
  1. Run forecast model on market
  2. Calculate fee-adjusted edge
  3. If edge > min_edge and confidence > threshold:
     - Generate BUY signal
     - Size via Kelly criterion (capped)
  4. Create thesis linking signal to trade
```

### 4.3 Event-Driven Strategy

```yaml
Description: Trade on breaking news and events

Data Sources:
  - News feeds (RSS, APIs)
  - Social media sentiment
  - Official announcements

Parameters:
  reaction_window: 300  # seconds to react
  min_impact_score: 0.7
  position_decay: 0.1  # reduce size over time

Logic:
  1. Monitor news feeds for relevant events
  2. Match events to open markets
  3. Assess impact direction and magnitude
  4. Generate signal if impact > threshold
  5. Rapid execution with time decay on size
```

### 4.4 Market Making Strategy

```yaml
Description: Provide liquidity and earn spread

Parameters:
  target_spread: 0.08  # 8% spread
  max_inventory: 500  # contracts
  inventory_skew: 0.02  # price adjustment per 100 contracts

Logic:
  1. Calculate fair value from model
  2. Set bid = fair_value - (spread/2) - (inventory * skew)
  3. Set ask = fair_value + (spread/2) - (inventory * skew)
  4. Maintain orders at both prices
  5. Adjust for inventory risk

Risks:
  - Adverse selection (informed traders)
  - Inventory accumulation
  - Event risk
```

### 4.5 Arbitrage/Parity Strategy

```yaml
Description: Exploit pricing inconsistencies

Types:
  1. YES/NO Parity:
     - If yes_price + no_price < 100: buy both
     - If yes_price + no_price > 100: sell both (if possible)
  
  2. Related Markets:
     - Find correlated markets
     - Trade relative value

Parameters:
  min_arb_profit: 0.03  # 3% after fees
  max_exposure: 1000  # contracts

Logic:
  1. Scan for parity violations
  2. Calculate net profit after fees
  3. If profit > threshold: execute both legs
```

### 4.6 Hedging Strategy

```yaml
Description: Reduce portfolio risk through offsetting positions

Use Cases:
  - Correlated markets (hedge beta)
  - Event hedging (reduce event exposure)
  - Portfolio rebalancing

Parameters:
  hedge_ratio: model-derived
  max_hedge_cost: 0.05  # 5% of position value

Logic:
  1. Calculate portfolio exposures
  2. Identify hedging opportunities
  3. Execute if cost < threshold
```

---

## 5. Data & Tooling

### 5.1 Postgres Data Layer

```sql
-- Markets
CREATE TABLE markets (
    ticker VARCHAR(50) PRIMARY KEY,
    title TEXT,
    category VARCHAR(50),
    series_ticker VARCHAR(50),
    open_time TIMESTAMP,
    close_time TIMESTAMP,
    settle_time TIMESTAMP,
    status VARCHAR(20),
    rules_text TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Market Snapshots (time series)
CREATE TABLE market_snapshots (
    id BIGSERIAL PRIMARY KEY,
    ticker VARCHAR(50) REFERENCES markets(ticker),
    timestamp TIMESTAMP,
    yes_price INT,
    no_price INT,
    yes_volume INT,
    no_volume INT,
    open_interest INT,
    UNIQUE(ticker, timestamp)
);

-- Theses
CREATE TABLE theses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_ticker VARCHAR(50) REFERENCES markets(ticker),
    hypothesis TEXT,
    target_price INT,
    confidence FLOAT,
    status VARCHAR(20) DEFAULT 'active',
    supporting_signals JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    invalidated_at TIMESTAMP,
    realized_at TIMESTAMP
);

-- Orders
CREATE TABLE orders (
    order_id VARCHAR(50) PRIMARY KEY,
    client_order_id UUID,
    ticker VARCHAR(50),
    side VARCHAR(10),
    action VARCHAR(10),
    count INT,
    price INT,
    status VARCHAR(20),
    filled_count INT DEFAULT 0,
    thesis_id UUID REFERENCES theses(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Positions
CREATE TABLE positions (
    id SERIAL PRIMARY KEY,
    ticker VARCHAR(50),
    side VARCHAR(10),
    count INT,
    avg_price INT,
    market_value INT,
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(ticker, side)
);

-- Signals
CREATE TABLE signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_ticker VARCHAR(50),
    signal_type VARCHAR(50),
    signal_value FLOAT,
    strength FLOAT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Audit Log
CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(50),
    event_data JSONB,
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_snapshots_ticker_time ON market_snapshots(ticker, timestamp DESC);
CREATE INDEX idx_theses_market ON theses(market_ticker, status);
CREATE INDEX idx_orders_ticker ON orders(ticker, created_at DESC);
CREATE INDEX idx_signals_market ON signals(market_ticker, created_at DESC);
CREATE INDEX idx_audit_type_time ON audit_log(event_type, timestamp DESC);
```

### 5.2 Backtesting Framework

```yaml
Features:
  - Historical market data replay
  - Simulated order execution (configurable slippage)
  - Fee modeling
  - Position tracking
  - Performance metrics

Metrics:
  - Total return
  - Sharpe ratio
  - Max drawdown
  - Win rate
  - Profit factor
  - Brier score (for probability predictions)

Usage:
  backtest = Backtester(strategy, start_date, end_date)
  results = backtest.run()
  results.plot()
```

### 5.3 Observability

```yaml
Logging:
  - Structured JSON logs
  - Log levels: DEBUG, INFO, WARN, ERROR, CRITICAL
  - Request/response logging for API calls
  - Trade decision logging with full context

Metrics:
  - Order count, fill rate, latency
  - P&L (realized, unrealized)
  - Position exposure by market/category
  - Risk utilization percentages
  - API rate limit usage

Alerting:
  - Kill switch activated
  - Circuit breaker tripped
  - Daily loss threshold warning
  - API errors spike
  - Position reconciliation mismatch
```

---

## 6. UI Requirements

### 6.1 Live Dashboard

```yaml
Layout:
  Header:
    - Account balance
    - Daily P&L (with spark chart)
    - System status (Normal/Warning/Halted)
    - Kill switch button

  Main Grid:
    - Active positions table
    - Open orders table
    - Recent fills feed
    - Risk metrics panel

  Sidebar:
    - Strategy status cards
    - Quick actions

Refresh: WebSocket-driven, < 1 second latency
```

### 6.2 Market Screen

```yaml
Features:
  - Market search and filter
  - Orderbook visualization
  - Price chart (1m, 5m, 1h, 1D)
  - Thesis display (if exists)
  - One-click trading

Data:
  - Ticker, title, category
  - Current prices (yes/no)
  - Volume, open interest
  - Time to close
  - Our position (if any)
```

### 6.3 Trade Blotter

```yaml
Columns:
  - Timestamp
  - Market ticker
  - Side (YES/NO)
  - Action (BUY/SELL)
  - Quantity
  - Price
  - Fees
  - Status
  - Thesis link

Filters:
  - Date range
  - Market
  - Strategy
  - Status

Export: CSV, JSON
```

### 6.4 Risk Controls UI

```yaml
Panels:
  1. Kill Switch:
     - Big red button
     - Activation history
     
  2. Limits Configuration:
     - Editable limit values
     - Current utilization bars
     
  3. Circuit Breaker:
     - Current state
     - Trip history
     - Manual reset button
     
  4. Symbol Restrictions:
     - Allowlist management
     - Blocklist management
     
  5. Human Approval Queue:
     - Pending orders
     - Approve/Reject buttons
     - Auto-reject countdown
```

---

## 7. Security & Compliance

### 7.1 Key Management

```yaml
Options:
  1. Environment Variables (dev/test):
     - KALSHI_API_KEY
     - KALSHI_EMAIL, KALSHI_PASSWORD
     
  2. HashiCorp Vault (production):
     - Dynamic secrets
     - Automatic rotation
     - Audit logging

Requirements:
  - Keys never in code or logs
  - Separate keys for demo/production
  - Key rotation every 90 days
```

### 7.2 RBAC (Role-Based Access Control)

```yaml
Roles:
  viewer:
    - View dashboard
    - View positions
    - View trade history
    
  trader:
    - All viewer permissions
    - Place manual orders
    - Approve pending orders
    
  operator:
    - All trader permissions
    - Modify risk limits
    - Activate/deactivate kill switch
    - Manage strategies
    
  admin:
    - All permissions
    - User management
    - System configuration
```

### 7.3 Audit Logs

```yaml
Events to Log:
  - All API requests/responses (redacted)
  - Order submissions and outcomes
  - Risk check results
  - Configuration changes
  - Login/logout events
  - Kill switch activations
  - Approval decisions

Retention: 7 years (regulatory requirement)

Format:
  {
    "timestamp": "2026-02-02T15:30:00Z",
    "event_type": "order_submitted",
    "user": "trader@example.com",
    "data": { ... },
    "ip_address": "192.168.1.1"
  }
```

### 7.4 Jurisdiction Toggles

```yaml
Configurable Restrictions:
  blocked_categories:
    - "politics_us"  # Example
    
  blocked_markets:
    - "SPECIFIC-TICKER"
    
  geographic_restrictions:
    enabled: true
    check_ip: true
    
Implementation:
  - Pre-trade check filters blocked markets
  - Log attempted trades on blocked markets
  - Alert on repeated attempts
```

---

## 8. Acceptance Tests

### 8.1 End-to-End Demo Flow

```yaml
Test: Complete trading cycle
Steps:
  1. Start system in paper mode
  2. Load market data
  3. Generate thesis for test market
  4. Submit order via strategy
  5. Verify order appears in blotter
  6. Simulate fill
  7. Verify position update
  8. Verify P&L calculation
  9. Close position
  10. Verify settlement

Pass Criteria:
  - All steps complete without error
  - Journal contains full audit trail
  - Positions reconcile correctly
```

### 8.2 Rate Limit Resilience

```yaml
Test: System handles rate limits gracefully
Steps:
  1. Configure aggressive polling (>10 req/sec)
  2. Observe 429 responses
  3. Verify exponential backoff
  4. Verify no data loss
  5. Verify recovery to normal operation

Pass Criteria:
  - No unhandled exceptions
  - Backoff delays increase exponentially
  - System recovers within 60 seconds
```

### 8.3 Thesis Traceability

```yaml
Test: Every trade links to thesis
Steps:
  1. Create thesis manually
  2. Submit order referencing thesis
  3. Verify order.thesis_id set
  4. Query orders by thesis
  5. Calculate thesis P&L

Pass Criteria:
  - 100% of strategy orders have thesis_id
  - Thesis status updates on trade
  - P&L attribution correct
```

### 8.4 Kill Switch SLA

```yaml
Test: Kill switch executes within SLA
Steps:
  1. Create 10 open positions
  2. Create 5 open orders
  3. Start timer
  4. Activate kill switch
  5. Verify all orders canceled
  6. Stop timer

Pass Criteria:
  - Execution time < 5 seconds
  - All orders canceled
  - Trading blocked after activation
  - Alert notification sent
```

### 8.5 Circuit Breaker Test

```yaml
Test: Circuit breaker trips on failures
Steps:
  1. Set reject_rate_threshold = 0.30
  2. Simulate 10 order rejections in 20 attempts
  3. Verify circuit breaker trips
  4. Verify trading halted
  5. Wait for cooldown
  6. Verify half-open state
  7. Simulate successful order
  8. Verify closed state

Pass Criteria:
  - Breaker trips at 30% reject rate
  - No orders during OPEN state
  - Recovery works correctly
```

---

## 9. Implementation Status

### Completed ✅
- [x] Kalshi REST API client
- [x] Kalshi WebSocket streaming
- [x] Rate limiting with backoff
- [x] Basic risk engine
- [x] Kill switch
- [x] Circuit breaker
- [x] Order tool with risk checks
- [x] Journal/audit logging
- [x] Portfolio management

### In Progress 🚧
- [ ] Thesis tracking system
- [ ] Strategy interface
- [ ] EV calculations with fees
- [ ] UI dashboard
- [ ] Acceptance tests

### Planned 📋
- [ ] Postgres data layer
- [ ] Forecast models
- [ ] Backtesting framework
- [ ] RBAC implementation
- [ ] Vault integration

---

## 10. Appendix

### A. Kalshi API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| /login | POST | Authenticate |
| /portfolio/balance | GET | Get balance |
| /portfolio/positions | GET | Get positions |
| /portfolio/orders | GET/POST | List/create orders |
| /portfolio/orders/{id} | GET/DELETE | Get/cancel order |
| /portfolio/fills | GET | Get fills |
| /markets | GET | List markets |
| /markets/{ticker} | GET | Get market |
| /markets/{ticker}/orderbook | GET | Get orderbook |
| /events | GET | List events |

### B. Risk Limit Defaults

```yaml
kalshi_risk_limits:
  max_order_notional: 500
  max_position_per_market: 2000
  max_total_notional: 10000
  max_daily_loss: 500
  max_drawdown_pct: 0.10
  max_open_positions: 20
  min_edge_threshold: 0.10
  approval_threshold: 1000
```

### C. Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| 401 | Unauthorized | Re-authenticate |
| 403 | Forbidden | Check permissions |
| 404 | Not found | Verify ticker |
| 429 | Rate limited | Backoff and retry |
| 500 | Server error | Retry with backoff |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-02-02 | AI Agent | Initial specification |
