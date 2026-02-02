# HFT Dashboard Audit Report

**Date:** February 2, 2026  
**Auditor:** Claude (Automated Analysis)  
**Project:** ~/projects/hft-trading

---

## Executive Summary

The dashboard (`ui/dashboard.html`) displays **100% dummy/hardcoded data**. Despite having well-implemented Python backend tools with real Alpaca/Kalshi API integrations, there is **no API server** to expose this data to the frontend. The dashboard is completely disconnected from the trading system.

### Severity: 🔴 CRITICAL

All dashboard values are fake. Users cannot monitor actual trading activity, positions, P&L, or risk metrics.

---

## Issue Categories

### 🔴 Critical (Data Completely Fake)

| Component | Current State | Real Data Source |
|-----------|--------------|------------------|
| Balance | Hardcoded `$300.00` | `PortfolioTool.get_account().equity` |
| Daily P&L | `Math.random()` simulation | `PortfolioTool.get_pnl()` |
| Positions | Empty table, no API call | `PortfolioTool.get_positions()` |
| Orders | Empty table, no API call | `OrderTool.list_orders()` |
| Exposure % | Starts at 0%, random update | `RiskTool.analyze_exposure()` |
| Daily Loss % | Calculated from fake P&L | `RiskTool.get_status()` |
| Drawdown | Hardcoded 0% | `risk_engine.loss_tracker.get_drawdown_pct()` |

### 🟡 Warning (Partially Implemented)

| Component | Issue | Fix Required |
|-----------|-------|--------------|
| Kill Switch | UI works but no backend call | Connect to `RiskTool.activate_kill_switch()` |
| Circuit Breaker | Shows "Closed" statically | Connect to `RiskEngine.circuit_breaker.state` |
| Dry Run Toggle | Local state only | Connect to `RiskEngine.dry_run` |
| Limits Modal | Saves to nothing | Connect to `RiskTool.update_limits()` |

### 🔵 Info (Hardcoded but Acceptable)

| Component | Current State | Notes |
|-----------|--------------|-------|
| Strategies | Hardcoded list | Could be dynamic but acceptable |
| Activity Feed | Static initial messages | Will be populated by real events |

---

## Detailed Findings

### 1. Frontend: `ui/dashboard.html`

**Lines 269-275 - Hardcoded Balance:**
```html
<div class="status-value" id="balance">$300.00</div>
```
- Never updated from backend
- Should fetch from `/api/account`

**Lines 508-516 - Fake P&L Simulation:**
```javascript
function updateDemoData() {
    const pnlChange = (Math.random() - 0.5) * 10;
    state.dailyPnl += pnlChange;
    ...
}
setInterval(updateDemoData, 5000);
```
- Completely fake random number generation
- Should poll or WebSocket from backend

**Lines 306-314 - Empty Positions:**
```html
<tbody id="positions-table">
    <tr>
        <td colspan="6" style="text-align: center; color: var(--text-secondary);">
            No open positions
        </td>
    </tr>
</tbody>
```
- No JavaScript to populate from API
- Should fetch from `/api/positions`

**Line 252 - Misleading Title:**
```html
<title>Kalshi AI Trading Agent - Dashboard</title>
```
- System supports both Alpaca and Kalshi
- Should reflect multi-broker capability

### 2. Backend: No API Server Exists

**Missing Component:** There is NO API server (FastAPI, Flask, etc.) to serve data.

The backend has excellent tools:
- `src/tools/portfolio.py` - Account, positions, P&L
- `src/tools/risk.py` - Risk metrics, kill switch
- `src/tools/order.py` - Order management
- `src/tools/market_data.py` - Market data
- `src/monitoring/status.py` - Service health

But these are **Python classes** with no HTTP endpoints to expose them.

### 3. Data Flow Analysis

**Current (Broken):**
```
Dashboard HTML → JavaScript state → Math.random() → Display
```

**Required (Working):**
```
Dashboard HTML → fetch('/api/*') → API Server → Python Tools → Broker APIs → Real Data
                     ↓
              WebSocket for updates
```

---

## Implementation Plan

### Phase 1: Create API Server (Priority: CRITICAL)

Create `src/api/server.py` with FastAPI:

```python
# Endpoints needed:
GET  /api/account     # Balance, equity, buying power
GET  /api/positions   # All positions with P&L
GET  /api/orders      # Open and recent orders
GET  /api/risk        # Risk status, limits, circuit breaker
POST /api/kill-switch # Activate/deactivate
POST /api/limits      # Update risk limits
GET  /api/status      # Service health (Alpaca, Kalshi)
WS   /ws             # Real-time updates
```

### Phase 2: Rewrite Dashboard Frontend

1. Remove all `Math.random()` simulation code
2. Add `fetch()` calls to API endpoints on load
3. Establish WebSocket connection for real-time updates
4. Add loading spinners and error states
5. Update title to reflect multi-broker system

### Phase 3: Testing

1. Verify against actual Alpaca paper account
2. Test real-time position updates
3. Test kill switch functionality end-to-end
4. Verify P&L calculations match broker

---

## Files to Modify/Create

| File | Action | Description |
|------|--------|-------------|
| `src/api/__init__.py` | CREATE | API package init |
| `src/api/server.py` | CREATE | FastAPI server with all endpoints |
| `src/api/websocket.py` | CREATE | WebSocket handler for real-time updates |
| `ui/dashboard.html` | MODIFY | Remove dummy data, add API calls |
| `requirements.txt` | MODIFY | Add fastapi, uvicorn, websockets |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Paper trading losses due to unmonitored positions | HIGH | MEDIUM | Fix dashboard immediately |
| Kill switch fails to activate | LOW | CRITICAL | Test with real backend |
| P&L displayed incorrectly | MEDIUM | HIGH | Validate against broker statements |

---

## Conclusion

The dashboard is non-functional for its intended purpose. All displayed data is fake. The backend infrastructure exists and is well-implemented, but lacks the API layer to connect to the frontend.

**Recommendation:** Implement the API server immediately before any live trading activity.

---

## Appendix: Code Snippets Showing Dummy Data

### Balance (Never Updated)
```javascript
let state = {
    ...
    balance: 300.00,  // Hardcoded, never fetched
    ...
};
```

### P&L (Random Number)
```javascript
const pnlChange = (Math.random() - 0.5) * 10;  // Totally fake
state.dailyPnl += pnlChange;
```

### Risk Metrics (Simulated)
```javascript
const exposurePct = Math.random() * 30;  // Random, not from risk engine
document.getElementById('exposure-pct').textContent = `${exposurePct.toFixed(0)}%`;
```
