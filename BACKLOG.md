# HFT Trading System - Backlog

## Overview
This backlog tracks issues, improvements, and technical debt for the HFT trading system.

---

## 🔴 Critical Issues

### 1. Type Safety: `null as any` in trade-manager.ts
- **File**: `src/lib/trade-manager.ts:75`
- **Issue**: `createManagedPosition` returns `position: null as any` when trade is skipped
- **Impact**: Runtime errors if consumer expects position object
- **Fix**: Create proper nullable return type or discriminated union
- **Status**: ✅ FIXED (Cycle 1)

### 2. Sequential Price Fetching Performance
- **File**: `src/lib/trade-manager.ts:126-133`
- **Issue**: Fetches prices sequentially for each symbol
- **Impact**: Slow API responses for portfolios with multiple positions
- **Fix**: Parallel fetch with `Promise.all`
- **Status**: ✅ FIXED (Cycle 1)

---

## 🟠 High Priority

### 3. Missing Test Coverage
- **Affected files**: 
  - `src/lib/trade-manager.ts` ✅ (21 tests)
  - `src/lib/confidence.ts` ✅ (15 tests)
  - `src/lib/risk-engine.ts` ✅ (15 tests)
  - `src/lib/env.ts` ✅ (19 tests)
  - `src/lib/validation.ts` ✅ (36 tests)
  - `src/lib/api-auth.ts` ✅ (13 tests)
  - `src/lib/alpaca.ts` ✅ (27 tests)
  - All API routes (0 tests) - needs integration tests
- **Impact**: Regressions can go undetected
- **Status**: ✅ COMPLETE (445 tests across 20 suites)

### 4. No API Authentication
- **Files**: All `src/app/api/*/route.ts`
- **Issue**: No auth on trading endpoints
- **Impact**: Security vulnerability
- **Fix**: Add API key authentication middleware
- **Status**: ✅ FIXED (Cycle 2) - Added api-auth.ts with authentication + rate limiting to trade, orders, kill-switch routes

### 5. Environment Variable Validation
- **Files**: `src/lib/alpaca.ts`, `src/lib/db.ts`
- **Issue**: Uses `!` assertion without validation
- **Impact**: Cryptic errors if env vars missing
- **Status**: ✅ FIXED (Cycle 3) - Added env.ts with validation utilities

---

## 🟡 Medium Priority

### 6. Missing Error Boundaries
- **Files**: React components
- **Issue**: No granular error handling
- **Status**: ✅ FIXED (Cycle 4) - Added ErrorBoundary component, wrapped dashboard sections

### 7. No Request Rate Limiting
- **Files**: API routes
- **Impact**: DoS vulnerability
- **Status**: ✅ FIXED (Cycle 5) - Added rate limiting in api-auth.ts

### 8. Hardcoded Thresholds
- **File**: `src/lib/regime.ts`, `src/lib/confidence.ts`
- **Issue**: Magic numbers for thresholds
- **Fix**: Move to config/constants
- **Status**: ✅ FIXED (Cycle 5) - Constants moved to constants.ts with env override support

### 9. Missing API Documentation
- **Issue**: No OpenAPI/Swagger docs
- **Status**: ⏳ TODO

### 10. No Audit Logging
- **Issue**: No record of who did what
- **Status**: ✅ FIXED (Cycle 6) - Added audit-log.ts with buffered writes, query API, and helper functions

---

## 🟢 Low Priority / Nice to Have

### 11. Improve README
- Add architecture diagram
- Document API endpoints
- Setup instructions
- **Status**: ✅ DONE (Cycle 6)

### 12. Add WebSocket Support
- Real-time price updates
- **Status**: ⏳ TODO

### 13. Add E2E Tests
- Playwright/Cypress tests
- **Status**: ⏳ TODO

### 14. Database Indexes Optimization
- Review query patterns
- **Status**: ⏳ TODO

---

## Completed Items

| Item | Cycle | Date |
|------|-------|------|
| Type safety fix - null position return | 1 | 2026-02-02 |
| Performance fix - parallel price fetching | 1 | 2026-02-02 |
| Test coverage: confidence module (15 tests) | 2 | 2026-02-02 |
| Test coverage: risk-engine module (15 tests) | 2 | 2026-02-02 |
| Environment variable validation utilities | 3 | 2026-02-02 |
| Input validation utilities | 4 | 2026-02-02 |
| API authentication middleware | 5 | 2026-02-02 |
| Rate limiting | 5 | 2026-02-02 |
| Comprehensive README documentation | 6 | 2026-02-02 |
| API authentication + rate limiting for critical endpoints | 2 | 2026-02-02 |
| Test coverage: trade-manager module (21 tests) | 3 | 2026-02-02 |
| React error boundaries for dashboard sections | 4 | 2026-02-02 |
| Centralized configurable constants (regime, confidence, risk) | 5 | 2026-02-02 |
| Audit logging system with buffered writes | 6 | 2026-02-02 |
| Test coverage: audit-log module (23 tests) | 7 | 2026-02-02 |
| Options orders auth + audit logging | 8 | 2026-02-02 |
| Health check endpoint for monitoring | 9 | 2026-02-02 |
| Health check tests + final cleanup | 10 | 2026-02-02 |
| Alpaca API client tests (27 tests) | 11 | 2026-02-02 |
| Risk API auth + options type safety | 12 | 2026-02-02 |
| Auth for account, positions routes + div/0 fix | 13 | 2026-02-02 |
| Auth for stats, intents, managed positions | 14 | 2026-02-02 |
| Auth for alerts routes | 15 | 2026-02-02 |
| Alpaca options utility tests (28 tests) | 16 | 2026-02-02 |
| Lint fixes and type safety improvements | 17 | 2026-02-02 |
| React hook lint errors fixed (research/scanner) | 18 | 2026-02-02 |
| Unused variable cleanup + type safety | 19 | 2026-02-02 |
| More lint cleanup - unused variables | 20 | 2026-02-02 |
| React Hook useEffect dependencies | 21 | 2026-02-02 |
| Final lint cleanup (2 warnings remaining) | 22 | 2026-02-02 |
| ESLint config: exclude legacy JS project | 23 | 2026-02-02 |
| Auth for risk GET and trade GET endpoints | 24 | 2026-02-02 |
| Input validation for intents POST endpoint | 25 | 2026-02-02 |
| Input validation for orders POST endpoint | 26 | 2026-02-02 |
| Input validation for options orders POST | 27 | 2026-02-02 |
| Input validation for risk PUT endpoint | 28 | 2026-02-02 |
| Fix TypeScript error in intents route | 29 | 2026-02-02 |
| Fix withAuth type for Next.js 16 compat | 30 | 2026-02-02 |
| Portfolio Optimization: library + API + UI | 31 | 2026-02-02 |
| Comprehensive Risk Management System | 32 | 2026-02-02 |
| OMS State Machine (HFT-003) | 33 | 2026-02-02 |
| Fix alpaca-options UTC date generation | 33 | 2026-02-02 |

---

## ✅ OMS State Machine (Cycle 33 / HFT-003)

Added a formal Order Management System state machine for order lifecycle tracking:

### Module (`src/lib/oms-state-machine.ts`)
- **Order States**
  - CREATED → PENDING → VALIDATING → SUBMITTING → SUBMITTED → [PARTIAL|FILLED]
  - Terminal states: FILLED, CANCELLED, REJECTED, EXPIRED, FAILED
- **State Machine Features**
  - Validated state transitions
  - Transition history tracking
  - Event-driven architecture (QUEUE, VALIDATE, SUBMIT, ACKNOWLEDGE, FILL, CANCEL, REJECT, EXPIRE, FAIL)
- **Fill Tracking**
  - Partial and full fill recording
  - Average fill price calculation
  - Auto-transition on fill completion
- **Order Management**
  - Lookup by internal ID, client ID, or broker ID
  - Filter by state, symbol, active/completed
  - Statistics (fill rate, counts by state)
  - Pruning of old completed orders
- **Callbacks**
  - onStateChange callback for state transitions
  - onFill callback for fill events
- **Configuration**
  - validateTransitions: enforce valid state changes
  - trackHistory: maintain transition log
  - maxHistoryLength: limit history size

### Tests (`__tests__/lib/oms-state-machine.test.ts`)
- 60 comprehensive tests covering:
  - State validation helpers (isValidTransition, isTerminalState, isActiveState)
  - Order creation with all parameters
  - Full lifecycle state transitions
  - Fill recording and average price calculation
  - Cancel and reject workflows
  - Order lookup by multiple identifiers
  - Filtering and statistics
  - Pruning completed orders
  - State change and fill callbacks
  - Edge cases (zero quantity, validation bypass, multiple partial fills)

### Bug Fix
- Fixed `getExpirationDates()` to use UTC consistently, preventing Friday detection failures in tests

---

## ✅ Portfolio Optimization (Cycle 31)

Added comprehensive portfolio analysis and optimization features:

### Library (`src/lib/portfolio-optimizer.ts`)
- **Position Sizing Algorithms**
  - Kelly Criterion (full, half, quarter Kelly)
  - Risk Parity (inverse volatility weighting)
- **Risk Metrics**
  - Sharpe Ratio
  - Sortino Ratio
  - Maximum Drawdown
  - Value at Risk (VaR 95%)
  - Beta
  - Calmar Ratio
  - Annualized Volatility
- **Analysis Tools**
  - Correlation matrix with high-correlation detection
  - Sector allocation breakdown
  - Asset class allocation
  - Diversification scoring (HHI concentration)
  - Rebalancing suggestions

### API (`/api/portfolio`)
- GET endpoint with full portfolio analysis
- Protected with authentication middleware

### UI Components (`src/components/portfolio/`)
- RiskMetricsCard
- AllocationChart
- CorrelationMatrix
- RebalanceSuggestions
- PositionSizing
- DiversificationScore

### Page (`/portfolio`)
- Three-section dashboard: Overview, Position Sizing, Rebalancing
- Holdings table with sector classification
- Educational content for sizing methods

---

## ✅ Comprehensive Risk Management System (Cycle 32)

Added a complete risk management system with 5 integrated components:

### 1. Position Sizing (`src/risk/position_sizing.py`)
- **Kelly Criterion Calculation**
  - Full Kelly, Half Kelly, Quarter Kelly methods
  - Volatility-adjusted sizing
  - Fixed fractional sizing
- **Features**
  - Win rate and win/loss ratio analysis
  - Automatic trade stats calculation from history
  - Maximum position caps based on account size
  - Risk-per-trade limits (2% default)
  - Confidence scoring for sizing reliability

### 2. Drawdown Protection (`src/risk/drawdown_protection.py`)
- **5-Level Drawdown System**
  - NORMAL: Full trading (< 3%)
  - CAUTION: 50% position sizing (3-5%)
  - WARNING: No new positions (5-8%)
  - CRITICAL: Start liquidation (8-10%)
  - EMERGENCY: Full liquidation (> 10%)
- **Features**
  - Daily/weekly/monthly loss limits (absolute and %)
  - Automatic position liquidation (losers first)
  - Recovery mode with cooldown period
  - Peak equity tracking (high water mark)
  - Level change callbacks for alerts

### 3. Correlation-Based Limits (`src/risk/correlation_limits.py`)
- **Sector Exposure Limits**
  - 30% max per sector (configurable)
  - 90+ stocks mapped to 11 sectors
- **Correlation Group Limits**
  - 25% max per correlated group
  - Pre-defined groups: Magnificent 7, Semiconductors, FAANG, Banks, Oil Majors, Pharma, EV/Battery, Cloud, Streaming, Crypto-exposed, AI plays
- **Features**
  - Single stock position limits (15% default)
  - Max positions per sector
  - Diversification scoring (HHI-based)
  - Custom sector/group mappings
  - Automatic max position size calculation

### 4. Real-Time P&L Tracking (`src/risk/pnl_tracker.py`)
- **Alert Types**
  - Daily profit target / loss limit
  - Position-level profit/loss
  - Losing/winning streaks
  - P&L velocity (rapid changes)
  - Drawdown warnings
  - Recovery milestones
  - New high alerts
- **Features**
  - Per-position P&L tracking
  - Portfolio-level P&L summary
  - Win rate and streak tracking
  - Alert cooldowns (prevent spam)
  - Callback system for notifications

### 5. Integrated Risk Manager (`src/risk/integrated_risk_manager.py`)
- **Unified Interface**
  - Single entry point for all risk checks
  - Combines all 4 components
  - Trade evaluation with full decision report
- **Features**
  - Complete trade approval workflow
  - Position sizing with automatic adjustments
  - Status report with all metrics
  - Kill switch control
  - Alert aggregation
  - Factory function for quick setup

### Tests (`tests/test_risk_management.py`)
- 25+ comprehensive tests covering all modules
- Unit tests for each component
- Integration tests for full workflow
- Trading day simulation test

### Configuration for $500 Account
- Daily loss limit: $25 (5%)
- Weekly loss limit: $75 (15%)
- Max position: 10% of account
- Max risk per trade: 2%
- Kelly method: Quarter Kelly (conservative)
- Emergency threshold: 10% drawdown

---

## Notes

### Code Quality Metrics (Updated Cycle 30)
- **Test Coverage**: 445 tests across 20 test suites
- **Lint Status**: 2 warnings (reserved state for future feature), 0 errors
- **TypeScript Strictness**: High (strict mode enabled)
- **Security**: API auth + rate limiting on critical endpoints
- **Observability**: Audit logging + health checks
- **Error Handling**: Error boundaries + graceful failures

### Architecture
```
src/
├── app/
│   ├── api/          # Next.js API routes
│   │   ├── trade/    # Trade execution
│   │   ├── risk/     # Risk management
│   │   ├── regime/   # Market regime detection
│   │   ├── options/  # Options trading
│   │   └── ...
│   └── (pages)/      # UI pages
├── lib/
│   ├── alpaca.ts     # Alpaca API client
│   ├── risk-engine.ts    # Risk checks
│   ├── trade-manager.ts  # Position management
│   ├── confidence.ts     # Trade scoring
│   ├── regime.ts         # Market regime detection
│   └── regime/           # Regime detection modules
└── components/           # React components
```
