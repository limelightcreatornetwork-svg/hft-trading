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
- **Status**: ✅ COMPLETE (241 tests across 12 suites)

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

---

## Notes

### Code Quality Metrics (Updated Cycle 28)
- **Test Coverage**: 296 tests across 14 test suites
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
