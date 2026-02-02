# Changelog

All notable changes to the HFT Trading Backend project.

## [Unreleased]

### Added
- **Enhanced Risk Engine** (`src/core/risk-engine.js`)
  - Multi-layered pre-trade risk checks (kill switch, symbol allowlist, position limits, exposure limits, spread/liquidity)
  - Intraday monitoring with daily loss limits and drawdown tracking
  - Automatic kill switch activation on anomalies (consecutive rejections, 429 storms, excessive reconnects)
  - Cancel/replace rate throttling
  - Position sizing with volatility and liquidity adjustments
  - Complete audit logging integration

- **OMS State Machine** (`src/core/oms-state-machine.js`)
  - Strict order state transition validation
  - Idempotency guarantees via client_order_id
  - Fill tracking with position updates
  - Reconciliation support for broker state sync
  - Event sourcing foundation for audit trail

- **Regime Detector** (`src/core/regime-detector.js`)
  - Market condition classification (CHOP, TREND, VOL_EXPANSION, UNTRADEABLE)
  - Realized volatility calculation
  - Directional strength analysis (ADX-like)
  - Strategy eligibility gating by regime
  - Symbol cooldown and disable controls
  - Regime smoothing to prevent whipsaws

- **Audit Log System** (`src/core/audit-log.js`)
  - Comprehensive event logging for all trading actions
  - Configuration versioning with diff support
  - Query methods by type, time range, symbol, correlation ID
  - Export functionality for compliance

- **Core Type Definitions** (`src/core/types.js`)
  - Order state enums and valid transitions
  - Market regime types
  - Risk decision statuses
  - Options trading types (contract, Greeks, quotes)
  - OCC symbol parsing and building utilities

- **Test Suite**
  - 32 risk engine tests covering all risk checks, kill switch, anomaly detection
  - 25 OMS state machine tests for order lifecycle and idempotency
  - 26 regime detector tests for market classification
  - Jest configuration with ES modules support

### Changed
- Risk engine now properly allows reducing positions even when over exposure limits
- Gross/net exposure checks correctly handle position-reducing trades
- Position limit checks allow selling to reduce oversized positions
- Updated README.md with comprehensive API documentation

### Fixed
- Position sizing tests now use order quantities within notional limits
- Exposure limit tests properly validate reducing trade scenarios

## [0.1.0] - 2024-12-XX (Initial Release)

### Added
- **Gateway API** (`src/gateway/index.js`)
  - REST API for trade intent submission
  - Order management endpoints (submit, cancel, list)
  - Kill switch controls
  - Risk state queries
  - Options trading endpoints
  - Static dashboard serving

- **Options Trading Service** (`src/options/index.js`)
  - Option chain retrieval with filters
  - Contract lookup by symbol/ID
  - Quote fetching with Greeks
  - Position tracking
  - Order placement and cancellation
  - Exercise functionality
  - Account options level queries

- **Simplified Risk Engine** (`src/libs/risk/index.js`)
  - Basic pre-trade checks
  - Symbol allowlist
  - Order notional limits
  - Position size limits
  - Daily trade limits
  - Order rate limiting
  - Kill switch

- **OMS Module** (`src/oms/index.js`)
  - Order lifecycle management
  - Intent processing
  - Alpaca order update handling

- **Configuration** (`src/libs/config.js`)
  - Environment variable parsing
  - Alpaca API configuration
  - Risk limit defaults
  - Validation

- **Logging** (`src/libs/logger.js`)
  - Structured logging with Pino
  - Pretty printing in development

### Infrastructure
- Express.js server setup
- Jest test configuration
- Docker support
- ESLint configuration

---

## Types of Changes

- **Added** - New features
- **Changed** - Changes in existing functionality
- **Deprecated** - Soon-to-be removed features
- **Removed** - Removed features
- **Fixed** - Bug fixes
- **Security** - Vulnerability fixes
