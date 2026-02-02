# Broker Scorecard: Alpaca vs Kalshi

**Last Updated:** 2026-02-02  
**Version:** 2.0 (Comprehensive Audit)

---

## Scoring Methodology

Each category is scored 1-5:
- **5** = Best-in-class, exceeds requirements
- **4** = Very good, minor gaps easily worked around
- **3** = Adequate, notable limitations but usable
- **2** = Significant issues requiring substantial workarounds
- **1** = Major blockers, consider alternatives

---

## Alpaca Scorecard

### Overall Score: 4.0/5.0 ⭐⭐⭐⭐

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| Order Types & Execution | 4.5 | 15% | 0.68 |
| Options Support | 4.0 | 10% | 0.40 |
| Streaming & Real-time | 5.0 | 15% | 0.75 |
| Paper Trading | 5.0 | 10% | 0.50 |
| Rate Limits & Scaling | 4.0 | 10% | 0.40 |
| Reliability & Uptime | 4.0 | 10% | 0.40 |
| Risk Controls | 2.0 | 10% | 0.20 |
| Documentation & SDKs | 4.0 | 5% | 0.20 |
| Operational Tooling | 3.0 | 5% | 0.15 |
| Cost & Fees | 5.0 | 5% | 0.25 |
| Compliance | 4.0 | 5% | 0.20 |
| **Weighted Total** | | **100%** | **4.13** |

---

### Detailed Alpaca Grades

#### Order Types & Execution: 4.5/5 ⭐⭐⭐⭐½
**What's Great:**
- Complete order type coverage (market, limit, stop, stop-limit, trailing stop)
- Bracket/OCO orders with automatic take-profit and stop-loss
- All time-in-force options (DAY, GTC, IOC, FOK, OPG, CLS)
- Extended hours trading (4 AM - 8 PM ET)
- Client order IDs for idempotent submission

**What's Missing:**
- Cancel/replace is NOT atomic (cancel-then-new)
- No conditional orders beyond bracket/OCO
- No advanced order types (iceberg, TWAP, VWAP)

**Impact:** Minor. Workaround: implement conditional logic in our code.

---

#### Options Support: 4.0/5 ⭐⭐⭐⭐
**What's Great:**
- Multi-leg orders (up to 4 legs)
- All spread types supported
- Real-time Greeks via data feed
- Options chains API

**What's Missing:**
- Exercise requires support ticket
- No portfolio margin for options
- Options trading levels require approval

**Impact:** Minor. Exercise requests are rare.

---

#### Streaming & Real-time: 5.0/5 ⭐⭐⭐⭐⭐
**What's Great:**
- WebSocket for quotes, trades, bars
- Separate trading stream for order updates
- Multiple feeds (IEX free, SIP $9/mo)
- Reliable reconnection
- Supports thousands of symbols

**What's Missing:**
- Nothing significant

**Impact:** None. Best-in-class for retail broker.

---

#### Paper Trading: 5.0/5 ⭐⭐⭐⭐⭐
**What's Great:**
- Full API parity with live
- Same endpoints, different keys
- Realistic fill simulation
- Same rate limits
- Free unlimited use

**What's Missing:**
- Fills slightly more optimistic than live

**Impact:** Negligible. Excellent for development.

---

#### Rate Limits & Scaling: 4.0/5 ⭐⭐⭐⭐
**What's Great:**
- Clear documentation: 200 req/min
- Consistent Retry-After header
- No penalty for hitting limits
- Streaming doesn't count against limits

**What's Missing:**
- No per-endpoint breakdown
- No burst allowance
- 200/min may be limiting at scale

**Impact:** Minor. Use streaming-first architecture.

---

#### Reliability & Uptime: 4.0/5 ⭐⭐⭐⭐
**What's Great:**
- 99.9%+ historical uptime
- Public status page
- WebSocket reconnection works well

**What's Missing:**
- Occasional issues during high volatility
- No SLA for retail accounts
- No guaranteed latency

**Impact:** Moderate. Plan for outages.

---

#### Risk Controls: 2.0/5 ⭐⭐
**What's Great:**
- PDT protection exists
- Margin requirements enforced
- Position closing endpoint

**What's Missing:**
- No max order size controls
- No max position controls
- No kill switch (manual only)
- No daily loss limits
- No symbol restrictions
- No pre-trade risk checks

**Impact:** CRITICAL. Must implement all risk controls ourselves.

**Our Mitigation:** Custom RiskEngine with:
- ✅ Pre-trade checks
- ✅ Position limits
- ✅ Loss limits
- ✅ Circuit breaker
- ✅ Kill switch
- ✅ Human approval workflow

---

#### Documentation & SDKs: 4.0/5 ⭐⭐⭐⭐
**What's Great:**
- Excellent REST API documentation
- Official Python SDK (alpaca-py)
- OpenAPI spec available
- Good examples

**What's Missing:**
- WebSocket docs could be clearer
- Options docs are newer, less mature
- Some edge cases undocumented

**Impact:** Minor. Fill gaps with testing.

---

#### Operational Tooling: 3.0/5 ⭐⭐⭐
**What's Great:**
- Activities API for audit trail
- Account history available
- Status page

**What's Missing:**
- No webhooks for fills
- No alerting built-in
- Must build monitoring yourself

**Impact:** Moderate. Implement StatusMonitor.

---

#### Cost & Fees: 5.0/5 ⭐⭐⭐⭐⭐
**What's Great:**
- $0 commission on stocks
- Competitive options fees ($0.015/contract)
- Free market data (IEX)
- Optional SIP ($9/mo)
- No account minimums
- No inactivity fees

**What's Missing:**
- Nothing significant

**Impact:** None. Best cost structure.

---

#### Compliance: 4.0/5 ⭐⭐⭐⭐
**What's Great:**
- SEC registered broker-dealer
- SIPC protected
- Clear regulatory compliance
- Proper tax reporting

**What's Missing:**
- Limited to US markets
- No crypto in some states

**Impact:** Minor for US-focused trading.

---

## Kalshi Scorecard

### Overall Score: 3.5/5.0 ⭐⭐⭐½

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| Order Types & Execution | 2.0 | 15% | 0.30 |
| Market Coverage | 4.0 | 10% | 0.40 |
| Streaming & Real-time | 4.0 | 15% | 0.60 |
| Paper Trading | 4.0 | 10% | 0.40 |
| Rate Limits & Scaling | 4.0 | 10% | 0.40 |
| Reliability & Uptime | 3.0 | 10% | 0.30 |
| Risk Controls | 2.5 | 10% | 0.25 |
| Documentation & SDKs | 3.0 | 5% | 0.15 |
| Operational Tooling | 2.0 | 5% | 0.10 |
| Cost & Fees | 3.5 | 5% | 0.18 |
| Compliance | 4.0 | 5% | 0.20 |
| **Weighted Total** | | **100%** | **3.28** |

---

### Detailed Kalshi Grades

#### Order Types & Execution: 2.0/5 ⭐⭐
**What's Great:**
- Limit orders work reliably
- Client order IDs for idempotency
- Order amendment supported

**What's Missing:**
- ONLY limit orders (no market orders)
- No bracket/OCO orders
- No conditional orders
- No multi-position management

**Impact:** Significant. Must implement pseudo-market orders.

**Our Mitigation:**
```python
# Pseudo-market buy
yes_price=99  # Pay up to 99¢

# Pseudo-market sell  
yes_price=1   # Accept as low as 1¢
```

---

#### Market Coverage: 4.0/5 ⭐⭐⭐⭐
**What's Great:**
- Unique prediction markets
- Political, economic, weather events
- Binary outcomes (clear resolution)
- 24/7 trading on most markets

**What's Missing:**
- Limited number of markets
- Some markets low liquidity
- No custom markets

**Impact:** Minor. Use for diversification.

---

#### Streaming & Real-time: 4.0/5 ⭐⭐⭐⭐
**What's Great:**
- WebSocket for orderbook
- Real-time fill notifications
- Sequence numbers for gap detection

**What's Missing:**
- Less mature than stock brokers
- Occasional disconnects
- No news feed

**Impact:** Minor. Implement robust reconnection.

---

#### Paper Trading: 4.0/5 ⭐⭐⭐⭐
**What's Great:**
- Full demo environment
- Same API structure
- Virtual currency

**What's Missing:**
- Fills are instant (unrealistic)
- Some markets not in demo

**Impact:** Minor. Account for in testing.

---

#### Rate Limits & Scaling: 4.0/5 ⭐⭐⭐⭐
**What's Great:**
- Clear: 10 req/sec
- WebSocket unlimited
- Retry-After header

**What's Missing:**
- Lower limits than stock brokers

**Impact:** Minor. Use WebSocket primarily.

---

#### Reliability & Uptime: 3.0/5 ⭐⭐⭐
**What's Great:**
- Generally stable
- Status page available

**What's Missing:**
- Younger platform
- Less track record
- Some downtime during high-profile events

**Impact:** Moderate. Monitor closely.

---

#### Risk Controls: 2.5/5 ⭐⭐½
**What's Great:**
- Platform max position ($25k)
- Collateral management

**What's Missing:**
- No custom risk controls
- No loss limits
- No kill switch

**Impact:** Significant. Use our RiskEngine.

---

#### Documentation & SDKs: 3.0/5 ⭐⭐⭐
**What's Great:**
- API documentation exists
- OpenAPI spec available

**What's Missing:**
- No official SDK
- Docs less polished
- Fewer examples

**Impact:** Moderate. More trial and error.

---

#### Operational Tooling: 2.0/5 ⭐⭐
**What's Great:**
- Basic activity history

**What's Missing:**
- Limited audit trail
- No webhooks
- Minimal monitoring tools

**Impact:** Significant. Build custom monitoring.

---

#### Cost & Fees: 3.5/5 ⭐⭐⭐½
**What's Great:**
- 7¢ per contract (competitive for prediction markets)

**What's Missing:**
- Fees on every trade
- Settlement fees
- Higher than $0 stock trading

**Impact:** Minor. Expected for the market type.

---

#### Compliance: 4.0/5 ⭐⭐⭐⭐
**What's Great:**
- CFTC regulated (DCM)
- First US regulated prediction market
- Proper KYC/AML

**What's Missing:**
- Different regulatory framework
- Geographic restrictions

**Impact:** Minor. Legitimate and legal.

---

## Comparison Matrix

| Requirement | Alpaca | Kalshi | Winner |
|-------------|--------|--------|--------|
| Order Types | ⭐⭐⭐⭐½ | ⭐⭐ | Alpaca |
| Streaming | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Alpaca |
| Paper Trading | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Alpaca |
| Rate Limits | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Tie |
| Reliability | ⭐⭐⭐⭐ | ⭐⭐⭐ | Alpaca |
| Risk Controls | ⭐⭐ | ⭐⭐½ | Kalshi (slightly) |
| Documentation | ⭐⭐⭐⭐ | ⭐⭐⭐ | Alpaca |
| Operations | ⭐⭐⭐ | ⭐⭐ | Alpaca |
| Cost | ⭐⭐⭐⭐⭐ | ⭐⭐⭐½ | Alpaca |
| Unique Value | Stocks/Options | Prediction Markets | Different |

---

## Final Recommendations

### Use Alpaca For:
- Primary stock and options trading
- Development and testing (excellent paper trading)
- Real-time streaming data
- Low-cost execution

### Use Kalshi For:
- Prediction market exposure
- Uncorrelated alpha
- Event-driven strategies
- Portfolio diversification

### Critical Gaps We've Addressed:

| Gap | Solution | Implementation |
|-----|----------|----------------|
| Risk Controls | Custom RiskEngine | ✅ Complete |
| Kill Switch | Portfolio close + flag | ✅ Complete |
| Human Approval | ApprovalWorkflow | ✅ Complete |
| Status Monitoring | StatusMonitor | ✅ Complete |
| Audit Trail | JournalTool | ✅ Complete |
| Rate Limiting | Token bucket limiter | ✅ Complete |
| Reconnection | Exponential backoff | ✅ Complete |

### Production Considerations:

1. **Keep Both Brokers:** Each serves a unique purpose
2. **Implement All Custom Risk Controls:** Neither broker provides adequate risk management
3. **Monitor Status Actively:** No SLA guarantees
4. **Consider IBKR for Scale:** If growing beyond Alpaca's limits
5. **Multi-Broker Redundancy:** Future enhancement for critical trading

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-02-02 | 2.0 | Comprehensive audit with detailed scoring |
| 2026-02-02 | 1.0 | Initial scorecard |
