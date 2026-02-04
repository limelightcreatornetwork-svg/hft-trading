# Trading Strategies Breakdown

This document covers every trading strategy, signal generation method, position sizing algorithm, and exit mechanism currently implemented in the HFT system.

---

## Table of Contents

1. [Confidence-Based Trading System](#1-confidence-based-trading-system)
2. [Market Regime Detection](#2-market-regime-detection)
3. [Momentum Scanner](#3-momentum-scanner)
4. [Position Sizing](#4-position-sizing)
5. [Exit Strategies](#5-exit-strategies)
6. [Portfolio Optimization](#6-portfolio-optimization)
7. [Risk Controls](#7-risk-controls)

---

## 1. Confidence-Based Trading System

**Location:** `src/lib/confidence.ts`
**Type:** Multi-factor scoring
**Market:** Alpaca equities & options

Rates every trade 1–10 by combining four weighted components.

### Scoring Components

#### 3a. Technical Score (35% weight)

Driven by market regime detection:

| Regime | Score Range | Interpretation |
|--------|------------|----------------|
| TREND | 8–10 | Favorable for momentum trades |
| CHOP | 5–6 | Range-bound, proceed with caution |
| VOL_EXPANSION | 3–4 | Elevated volatility, reduce size |
| UNTRADEABLE | 1 | Extreme conditions, skip trade |

Adjustments:
- **+0.5** if regression slope > 0.1 (strong momentum)
- **+0.5** if volume anomaly 1.5–3x average (confirming move)
- **-1.0** if volume anomaly > 3x (potential exhaustion)

#### 3b. Risk/Reward Score (25% weight)

Based on take-profit and stop-loss levels:

| R:R Ratio | Score | Verdict |
|-----------|-------|---------|
| >= 3:1 | 10 | Excellent |
| >= 2.5:1 | 9 | Very good |
| >= 2:1 | 8 | Good |
| >= 1.5:1 | 6 | Acceptable |
| >= 1:1 | 4 | Marginal |
| < 1:1 | 2 | Poor — negative EV |

If no TP/SL provided, defaults to 2:1 (score 6).

#### 3c. Market Conditions Score (25% weight)

Uses SPY's ATR% as a VIX proxy (ATR% * 12 ≈ VIX estimate):

| VIX Estimate | Score | Interpretation |
|-------------|-------|----------------|
| < 15 | 9 | Calm markets |
| 15–20 | 8 | Normal |
| 20–25 | 6 | Elevated, increased caution |
| 25–30 | 4 | High, reduce exposure |
| > 30 | 2 | Extreme, consider staying out |

#### 3d. Time of Day Score (15% weight)

All times Eastern:

| Window | Score | Reason |
|--------|-------|--------|
| 9:45–11:30 AM | 9 | Mid-morning — optimal conditions |
| 2:00–3:00 PM | 8 | Afternoon session |
| 3:00–3:45 PM | 7 | Power hour — good volume |
| 11:30 AM–2:00 PM | 6 | Lunch lull — choppy |
| Pre-market | 5 | Limited liquidity |
| 9:30–9:45 AM (open) | 4 | Opening volatility |
| 3:45–4:00 PM (close) | 4 | Closing rush |
| After-hours | 3 | Wider spreads |
| Weekend | 1 | Markets closed |

### Final Score → Position Size

| Total Score | Recommendation | % of Portfolio |
|-------------|---------------|----------------|
| 8–10 | FULL | 20% |
| 6–7 | MEDIUM | 10% |
| 4–5 | SMALL | 5% |
| 1–3 | SKIP | 0% |

### ATR-Based TP/SL Suggestions

When a trade is scored, the system also suggests TP/SL levels:

- **Take Profit:** 2x ATR (clamped to 1.5%–5%)
- **Stop Loss:** 1x ATR (clamped to 0.5%–3%)
- **Fallback:** Fixed 2% TP / 1% SL if regime data unavailable

---

## 2. Market Regime Detection

**Location:** `src/lib/regime/regimeDetector.ts`
**Type:** Market environment classifier

Classifies the current market into one of four regimes to guide strategy selection and position sizing.

### Regime Types

| Regime | Characteristics | Trading Guidance |
|--------|----------------|------------------|
| **TREND** | ADX > 25, clear directional bias, moderate vol | Ride momentum, 2.0x stop multiplier, full size |
| **CHOP** | ADX < 20, no directional bias, low vol ratio | Mean-reversion, 1.0x stop multiplier, 70% size |
| **VOL_EXPANSION** | Vol ratio > threshold, elevated volume, wider spreads | Wider stops (2.5x), 50% size |
| **UNTRADEABLE** | Halted stock, stale data, extreme spreads, open/close auctions | No trading, 0% size |

### Classification Algorithm

Priority order: `UNTRADEABLE > VOL_EXPANSION > TREND > CHOP`

**UNTRADEABLE score** accumulates from:
- Stock halted (+1.0, instant)
- Stale data (+0.4)
- Extreme spreads (+0.4)
- Gap > 2% (+0.3)
- Open/close auction (+0.5/+0.3)
- Pre/post market (+0.5)
- Extreme volume (+0.2)

**TREND score** accumulates from:
- ADX above trend threshold (+0.6, scaled to ADX/50)
- Clear +DI vs -DI separation (+0.3, scaled to diff/30)
- Moderate vol ratio (+0.1)

**CHOP score** (inverse of trend):
- Low ADX (+0.6, inversely scaled)
- No directional bias (+0.3)
- Low vol ratio (+0.1)

**VOL_EXPANSION score**:
- Vol ratio above expansion threshold (+0.5, scaled)
- Wide but tradeable spreads (+0.2)
- Elevated volume (+0.2)

### Indicators Used

| Indicator | Period | Source |
|-----------|--------|--------|
| ADX (Average Directional Index) | 14 bars | Alpaca daily bars |
| ATR (Average True Range) | 14 bars | Alpaca daily bars |
| +DI / -DI (Directional Indicators) | 14 bars | Computed from ADX |
| Regression Slope | 20 bars | Linear regression on closes |
| Volume Z-Score | Rolling | Deviation from average volume |
| Spread Ratio | Real-time | Current spread vs historical average |
| Vol Ratio | Real-time | Current ATR vs historical ATR |

### Confidence Scoring

The classification confidence is calculated as:

```
confidence = 0.5 + (margin_between_top_two_scores * 0.5)
```

Clamped to [0.3, 1.0]. Higher margin between the winning regime and runner-up = higher confidence.

---

## 3. Momentum Scanner

**Location:** `src/lib/momentum-scanner.ts`
**Type:** Technical signal generation
**Market:** Alpaca equities

Scans a universe of symbols for breakout/momentum signals using multiple technical indicators.

### Indicators Calculated

| Indicator | Implementation | Signal |
|-----------|---------------|--------|
| **RSI (14)** | Wilder smoothing | Oversold (<30) / Overbought (>70) + divergence detection |
| **MACD (12,26,9)** | EMA crossover | Bullish/bearish crossover detection |
| **SMA 20/50/200** | Simple moving averages | Golden cross (SMA20 > SMA50) / Death cross |
| **ATR (14)** | True range average | Volatility measurement |
| **Relative Volume** | Current vs 20-day avg | Confirms moves (>1.5x = elevated) |
| **Breakout Detection** | 20-period high/low | Price breaking above recent high or below recent low |

### Regime Filter

Each scanner hit includes a regime classification:
- `trending_up`: Price above SMA20 and SMA50, SMA20 > SMA50, spread > 2%
- `trending_down`: Price below both MAs, SMA20 < SMA50, spread > 2%
- `ranging`: Everything else

### Signal Strength

Each hit is scored 0–100 based on indicator confluence. Scanner results are sorted by signal strength descending.

### Alert Types Generated

| Alert Type | Trigger | Severity |
|-----------|---------|----------|
| Breakout | Signal strength > 80 + volume confirmation | High |
| RSI Divergence | Price/RSI diverging | Medium |
| MACD Crossover | Signal line cross | Medium |
| Volume Spike | Relative volume > 3x | Medium |

---

## 4. Position Sizing

Three position sizing approaches are used depending on context:

### 4a. Confidence-Based Sizing (Alpaca Equities)

Driven by the 1–10 confidence score:

| Score | Tier | % of Portfolio |
|-------|------|----------------|
| 8–10 | HIGH | 20% |
| 6–7 | MEDIUM | 10% |
| 4–5 | LOW | 5% |
| 1–3 | SKIP | 0% |

Configurable via environment variables: `POS_HIGH_PCT`, `POS_MED_PCT`, `POS_LOW_PCT`.

### 4b. Risk Parity Sizing (Portfolio Level)

Uses inverse-volatility weighting:

```
target_weight(i) = (1 / volatility(i)) / sum(1 / volatility(j) for all j)
```

Lower-volatility positions get higher weight. Volatility is estimated by annualizing the standard deviation of daily returns (sqrt(252) scaling).

### 4c. Regime-Adjusted Sizing

The regime detector provides a `suggestedPositionSize` multiplier:

| Regime | Size Multiplier |
|--------|----------------|
| TREND | 1.0 (full) |
| CHOP | 0.7 |
| VOL_EXPANSION | 0.5 |
| UNTRADEABLE | 0.0 |

Further reduced by:
- **0.7x** if within 15 minutes of market open
- **0.8x** if within 15 minutes of market close

---

## 5. Exit Strategies

### 5a. Fixed Take-Profit / Stop-Loss

**Location:** `src/lib/trade-manager.ts`

Default levels from `src/lib/constants.ts`:
- TP: 2% (min 1.5%, max 5%)
- SL: 1% (min 0.5%, max 3%)
- Time stop: 4 hours

ATR-based suggestions override defaults when regime data is available:
- TP = 2x ATR%
- SL = 1x ATR%

### 5b. Trailing Stop

**Location:** `src/lib/trailing-stop.ts`

Tracks a high-water mark and adjusts the stop level as price moves in the position's favor.

**Configuration per position:**
- `trailPercent` — percentage trail (e.g., 5%)
- `trailAmount` — fixed dollar trail
- `activationPercent` — only activate after X% profit

**Lifecycle:**
1. Position opened → initial stop calculated from entry price
2. Price rises → high-water mark updated → stop ratchets up
3. If activation threshold set → stop only becomes active after reaching the profit target
4. Price drops below stop → market sell order submitted → position closed
5. Alert created: `TRAILING_TRIGGERED`

**Monitoring:** `monitorTrailingStops()` runs periodically, fetching live quotes for all active stops, updating HWMs, and triggering exits.

### 5c. Scaled Exits

**Location:** `src/lib/scaled-exits.ts`

Splits a position into multiple exit tranches at different profit targets, with an optional trailing take-profit for the remaining "runner."

**Presets:**

| Preset | Targets | Runner |
|--------|---------|--------|
| **Conservative** | 50% at +3%, 30% at +5% | 20% trailing after +8% (2% trail) |
| **Balanced** | 33% at +5%, 33% at +10% | 34% trailing after +15% (3% trail) |
| **Aggressive** | 25% at +5%, 25% at +10% | 50% trailing after +20% (5% trail) |
| **Day Trade** | 50% at +1%, 50% at +2% | None |

**Monitoring:** `monitorScaledExits()` checks each active plan against live prices, triggers exits when targets are hit, activates trailing TP when the activation threshold is reached, and generates alerts for each execution.

### 5d. Time Stop

Positions that have been open longer than the configured `TIME_STOP_HOURS` (default 4 hours) without hitting TP or SL are flagged for exit. This prevents capital from being tied up in stagnant trades.

---

## 6. Portfolio Optimization

**Location:** `src/lib/portfolio-optimizer.ts`

### Risk Metrics Calculated

| Metric | Formula | Purpose |
|--------|---------|---------|
| **Sharpe Ratio** | (Rp - Rf) / σp | Risk-adjusted return |
| **Sortino Ratio** | (Rp - Rf) / downside σ | Penalizes only downside volatility |
| **Max Drawdown** | Peak to trough decline | Worst-case loss |
| **Value at Risk (95%)** | Historical percentile method | Daily loss at 95% confidence |
| **Beta** | Correlation * (σp / σm) | Market sensitivity |
| **Calmar Ratio** | Annual return / max drawdown | Return per unit of drawdown risk |
| **Volatility** | Annualized std dev of daily returns | Total risk |

### Correlation Analysis

Builds an N x N correlation matrix across all positions. Flags pairs with correlation > 0.7 as concentration risk. Used in diversification scoring.

### Diversification Score (0–100)

Weighted combination:
- **Position concentration (35%)** — Herfindahl-Hirschman Index of portfolio weights
- **Sector concentration (35%)** — maximum single-sector weight
- **Correlation risk (30%)** — count and magnitude of high-correlation pairs

Generates actionable recommendations (e.g., "Heavy Technology exposure at 60%. Consider diversifying.")

### Rebalancing

Given target weights and a tolerance band (default 5%), generates buy/sell suggestions with priority levels:
- **High** — deviation > 2x tolerance
- **Medium** — deviation > tolerance
- **Low** — within tolerance but drifting

Supports equal-weight targets as a baseline allocation method.

---

## 7. Risk Controls

These are not strategies per se, but they gate every strategy's execution.

### Pre-Trade Checks

| Check | Default Limit |
|-------|--------------|
| Max position size | 1,000 shares |
| Max order size | 100 shares |
| Max daily loss | $1,000 |
| Allowed symbols | AAPL, MSFT, GOOGL, AMZN, TSLA, SPY, QQQ, NVDA, META, AMD |
| Trading enabled | `false` by default (must be explicitly enabled) |

### Options-Specific Limits

| Check | Default |
|-------|---------|
| Max contracts | 10 |
| Max premium at risk | $500 |
| Max delta exposure | 100 |
| Min days to expiration | 1 |

### Kill Switch

Instantly halts all trading. Cancels open orders. Persisted in both memory and database. No trades can execute while active.

### Circuit Breaker

Monitors reject rate and slippage. Auto-trips on excessive failures. Includes auto-recovery with reset mechanism.

### Human Approval Workflow

Trades above configurable thresholds are queued for human review. Timeout-based with full audit trail.

---

## Strategy Interaction Map

```
Market Data (Alpaca)
    │
    ├──► Regime Detection ──► TREND / CHOP / VOL_EXPANSION / UNTRADEABLE
    │         │
    │         ▼
    ├──► Confidence Scoring (1-10)
    │    ├── Technical (regime, momentum, volume)   35%
    │    ├── Risk/Reward (TP/SL ratio)              25%
    │    ├── Market Conditions (VIX proxy)          25%
    │    └── Time of Day                            15%
    │         │
    │         ▼
    ├──► Position Sizing
    │    ├── Confidence tiers (FULL/MEDIUM/SMALL/SKIP)
    │    ├── Kelly criterion
    │    ├── Risk parity weights
    │    └── Regime size multiplier
    │         │
    │         ▼
    ├──► Risk Engine (pre-trade gate)
    │    ├── Position limits
    │    ├── Daily loss limits
    │    ├── Kill switch check
    │    └── Human approval (if needed)
    │         │
    │         ▼
    ├──► Order Execution (Alpaca)
    │         │
    │         ▼
    └──► Exit Management
         ├── Fixed TP/SL monitoring
         ├── Trailing stop (HWM tracking)
         ├── Scaled exits (multi-target)
         └── Time stop (4h default)
```
