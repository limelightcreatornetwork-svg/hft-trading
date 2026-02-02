# HFT Trading Tool — Product Backlog

## Epic: Phase 0 - Bootstrap
*Goal: Minimal working pipeline in paper trading*

| ID | Story | Points | Status |
|----|-------|--------|--------|
| HFT-001 | As a developer, I need Alpaca paper account credentials to connect to the API | 1 | ⚪ TODO |
| HFT-002 | As the system, I need to connect to Market Data WebSocket and receive events | 5 | ⚪ TODO |
| HFT-003 | As the system, I need to parse and normalize market data events | 3 | ⚪ TODO |
| HFT-004 | As the system, I need to submit a single limit order via REST API | 3 | ⚪ TODO |
| HFT-005 | As the system, I need to receive trade_updates via WebSocket | 5 | ⚪ TODO |
| HFT-006 | As the system, I need to store orders and fills in PostgreSQL | 5 | ⚪ TODO |
| HFT-007 | As the system, I need automatic WS reconnection logic | 3 | ⚪ TODO |

**Exit Criteria:**
- Reliable WS connection + reconnect
- Successful order round-trip in paper

---

## Epic: Phase 1 - OMS + Risk MVP
*Goal: Safe gateway with deterministic execution*

| ID | Story | Points | Status |
|----|-------|--------|--------|
| HFT-010 | As the system, I need an order state machine (NEW→FILLED/CANCELED) | 5 | ⚪ TODO |
| HFT-011 | As an agent, I need idempotent POST /v1/intents endpoint | 5 | ⚪ TODO |
| HFT-012 | As the system, I need symbol allowlist risk check | 2 | ⚪ TODO |
| HFT-013 | As the system, I need max order size/notional risk check | 3 | ⚪ TODO |
| HFT-014 | As the system, I need max position per symbol risk check | 3 | ⚪ TODO |
| HFT-015 | As the system, I need max daily trades risk check | 2 | ⚪ TODO |
| HFT-016 | As the system, I need order rate limiter | 3 | ⚪ TODO |
| HFT-017 | As the system, I need a kill switch endpoint | 3 | ⚪ TODO |
| HFT-018 | As the system, I need reconciliation on startup | 5 | ⚪ TODO |

**Exit Criteria:**
- Zero duplicate orders in chaos testing
- Rate limit budget enforced

---

## Epic: Phase 2 - Strategy MVP + Replay
*Goal: First event-driven strategy with replayable tests*

| ID | Story | Points | Status |
|----|-------|--------|--------|
| HFT-020 | As a developer, I need a feature store for rolling windows | 5 | ⚪ TODO |
| HFT-021 | As a developer, I need a small universe strategy (5-20 symbols) | 8 | ⚪ TODO |
| HFT-022 | As a developer, I need raw event logging for replay | 3 | ⚪ TODO |
| HFT-023 | As a developer, I need a replay harness for strategy testing | 8 | ⚪ TODO |
| HFT-024 | As the system, I need slippage + transaction cost accounting | 5 | ⚪ TODO |

**Exit Criteria:**
- Strategy runs full sessions without failures
- Replay reproduces decisions deterministically

---

## Epic: Phase 3 - Production Hardening
*Goal: Ops-ready system*

| ID | Story | Points | Status |
|----|-------|--------|--------|
| HFT-030 | As an operator, I need latency metrics | 3 | ⚪ TODO |
| HFT-031 | As an operator, I need rejection rate metrics | 2 | ⚪ TODO |
| HFT-032 | As an operator, I need fill rate metrics | 2 | ⚪ TODO |
| HFT-033 | As an operator, I need WS lag detection metrics | 3 | ⚪ TODO |
| HFT-034 | As an operator, I need alerts for kill switch triggers | 3 | ⚪ TODO |
| HFT-035 | As an operator, I need alerts for 429 spikes | 2 | ⚪ TODO |
| HFT-036 | As the system, I need secrets management (vault/SSM) | 5 | ⚪ TODO |
| HFT-037 | As a developer, I need automated integration tests | 8 | ⚪ TODO |
| HFT-038 | As an operator, I need observability dashboard | 5 | ⚪ TODO |

**Exit Criteria:**
- Dashboards reflect reality
- Fault injection testing passes

---

## Epic: Phase 4 - Staged Live Rollout
*Goal: Controlled live trading with tight caps*

| ID | Story | Points | Status |
|----|-------|--------|--------|
| HFT-040 | As an operator, I need live trading configuration | 3 | ⚪ TODO |
| HFT-041 | As the system, I need tiny notional caps for initial live | 2 | ⚪ TODO |
| HFT-042 | As the system, I need strict daily loss limit | 2 | ⚪ TODO |
| HFT-043 | As an operator, I need post-trade analysis reports | 5 | ⚪ TODO |
| HFT-044 | As an operator, I need ability to expand symbols gradually | 2 | ⚪ TODO |

**Exit Criteria:**
- No risk limit breaches
- Consistent fills, acceptable slippage

---

## Technical Debt & Improvements

| ID | Item | Points | Priority |
|----|------|--------|----------|
| HFT-TD-001 | Add comprehensive error handling | 5 | Medium |
| HFT-TD-002 | Add request tracing | 3 | Low |
| HFT-TD-003 | Document API endpoints | 2 | Low |
