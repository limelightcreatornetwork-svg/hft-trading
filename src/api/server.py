"""
FastAPI Server for HFT Trading Dashboard

Provides REST and WebSocket endpoints connecting the dashboard
to the trading system backend.
"""

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime
from decimal import Decimal
from typing import Optional, Dict, Any, List, Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from ..brokers.alpaca import AlpacaClient, AlpacaConfig, AlpacaEnvironment
from ..brokers.kalshi import KalshiClient, KalshiConfig, KalshiEnvironment
from ..tools.portfolio import PortfolioTool
from ..tools.market_data import MarketDataTool
from ..tools.order import OrderTool
from ..tools.risk import RiskTool
from ..risk.engine import RiskEngine, RiskLimits, configure_risk_engine
from ..monitoring.status import StatusMonitor, get_status_monitor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ============================================================================
# Pydantic Models for API
# ============================================================================

class AccountResponse(BaseModel):
    account_id: str
    equity: str
    cash: str
    buying_power: str
    portfolio_value: str
    daytrade_count: int
    pattern_day_trader: bool
    trading_blocked: bool
    timestamp: str

class PositionResponse(BaseModel):
    symbol: str
    qty: int
    side: str
    avg_entry_price: str
    current_price: str
    market_value: str
    cost_basis: str
    unrealized_pnl: str
    unrealized_pnl_pct: str
    change_today: str

class OrderResponse(BaseModel):
    order_id: str
    client_order_id: Optional[str]
    symbol: str
    side: str
    qty: int
    filled_qty: int
    order_type: str
    limit_price: Optional[str]
    status: str
    created_at: str

class RiskStatusResponse(BaseModel):
    kill_switch_active: bool
    circuit_breaker_state: str
    dry_run_mode: bool
    daily_pnl: str
    drawdown_pct: str
    exposure_pct: str
    daily_loss_pct: str
    can_trade: bool
    limits: Dict[str, str]

class ServiceStatusResponse(BaseModel):
    service: str
    status: str
    response_time_ms: Optional[float]
    error: Optional[str]
    last_check: Optional[str]

class KillSwitchRequest(BaseModel):
    active: bool
    reason: Optional[str] = "Dashboard control"

class LimitsUpdateRequest(BaseModel):
    max_order_notional: Optional[str] = None
    max_position_notional: Optional[str] = None
    max_daily_loss: Optional[str] = None
    max_total_exposure: Optional[str] = None

class PortfolioSummaryResponse(BaseModel):
    account: AccountResponse
    positions: List[PositionResponse]
    total_unrealized_pnl: str
    position_count: int
    long_exposure: str
    short_exposure: str
    net_exposure: str
    gross_exposure: str


# ============================================================================
# Global State (initialized on startup)
# ============================================================================

class TradingState:
    """Global trading system state."""
    
    def __init__(self):
        self.alpaca_client: Optional[AlpacaClient] = None
        self.kalshi_client: Optional[KalshiClient] = None
        self.portfolio_tool: Optional[PortfolioTool] = None
        self.market_data_tool: Optional[MarketDataTool] = None
        self.order_tool: Optional[OrderTool] = None
        self.risk_tool: Optional[RiskTool] = None
        self.risk_engine: Optional[RiskEngine] = None
        self.status_monitor: Optional[StatusMonitor] = None
        self.initialized: bool = False
        self.paper_mode: bool = True
        
        # WebSocket connections
        self.websocket_connections: Set[WebSocket] = set()
        
        # Activity log
        self.activity_log: List[Dict[str, Any]] = []
    
    def log_activity(self, message: str, level: str = "info"):
        """Add activity to log and broadcast to WebSockets."""
        entry = {
            "time": datetime.now().isoformat(),
            "message": message,
            "level": level,
        }
        self.activity_log.append(entry)
        # Keep last 100 entries
        if len(self.activity_log) > 100:
            self.activity_log = self.activity_log[-100:]
        
        # Broadcast to WebSockets (will be done async)
        asyncio.create_task(self.broadcast({
            "type": "activity",
            "data": entry
        }))
    
    async def broadcast(self, message: Dict):
        """Broadcast message to all WebSocket connections."""
        dead_connections = set()
        for ws in self.websocket_connections:
            try:
                await ws.send_json(message)
            except Exception:
                dead_connections.add(ws)
        
        # Clean up dead connections
        self.websocket_connections -= dead_connections


state = TradingState()


# ============================================================================
# Startup/Shutdown
# ============================================================================

async def initialize_trading_system():
    """Initialize all trading components."""
    logger.info("Initializing trading system...")
    
    # Determine mode from environment
    state.paper_mode = os.environ.get("TRADING_MODE", "paper").lower() == "paper"
    
    # Initialize risk engine
    limits = RiskLimits(
        max_order_notional=Decimal("10000"),
        max_position_notional=Decimal("50000"),
        max_daily_loss=Decimal("5000"),
    )
    state.risk_engine = configure_risk_engine(limits, dry_run=True)
    
    # Initialize Alpaca client
    try:
        prefix = "ALPACA_PAPER_" if state.paper_mode else "ALPACA_"
        api_key = os.environ.get(f"{prefix}API_KEY")
        api_secret = os.environ.get(f"{prefix}API_SECRET")
        
        if api_key and api_secret:
            config = AlpacaConfig(
                api_key=api_key,
                api_secret=api_secret,
                environment=AlpacaEnvironment.PAPER if state.paper_mode else AlpacaEnvironment.LIVE,
            )
            state.alpaca_client = AlpacaClient(config)
            logger.info(f"Alpaca client initialized (paper={state.paper_mode})")
            state.log_activity(f"Connected to Alpaca API ({'paper' if state.paper_mode else 'live'})")
        else:
            logger.warning("Alpaca credentials not found")
            state.log_activity("Alpaca API credentials not configured", "warning")
    except Exception as e:
        logger.error(f"Alpaca initialization failed: {e}")
        state.log_activity(f"Alpaca connection failed: {e}", "error")
    
    # Initialize Kalshi client
    try:
        prefix = "KALSHI_DEMO_" if state.paper_mode else "KALSHI_"
        email = os.environ.get(f"{prefix}EMAIL", "")
        password = os.environ.get(f"{prefix}PASSWORD", "")
        api_key = os.environ.get(f"{prefix}API_KEY")
        
        if api_key or (email and password):
            config = KalshiConfig(
                email=email,
                password=password,
                api_key=api_key,
                environment=KalshiEnvironment.DEMO if state.paper_mode else KalshiEnvironment.PRODUCTION,
            )
            state.kalshi_client = KalshiClient(config)
            await state.kalshi_client.authenticate()
            logger.info(f"Kalshi client initialized (demo={state.paper_mode})")
            state.log_activity(f"Connected to Kalshi API ({'demo' if state.paper_mode else 'production'})")
        else:
            logger.warning("Kalshi credentials not found")
    except Exception as e:
        logger.error(f"Kalshi initialization failed: {e}")
        state.log_activity(f"Kalshi connection failed: {e}", "warning")
    
    # Initialize tools
    state.market_data_tool = MarketDataTool(
        alpaca_client=state.alpaca_client,
        kalshi_client=state.kalshi_client,
    )
    
    state.portfolio_tool = PortfolioTool(
        alpaca_client=state.alpaca_client,
        kalshi_client=state.kalshi_client,
        risk_engine=state.risk_engine,
    )
    
    state.order_tool = OrderTool(
        alpaca_client=state.alpaca_client,
        kalshi_client=state.kalshi_client,
        risk_engine=state.risk_engine,
        market_data_tool=state.market_data_tool,
    )
    
    state.risk_tool = RiskTool(
        risk_engine=state.risk_engine,
        portfolio_tool=state.portfolio_tool,
        market_data_tool=state.market_data_tool,
    )
    
    # Initialize status monitor
    state.status_monitor = get_status_monitor()
    await state.status_monitor.start()
    
    state.initialized = True
    state.log_activity("Trading system initialized")
    logger.info("Trading system initialized successfully")


async def shutdown_trading_system():
    """Clean shutdown of trading components."""
    logger.info("Shutting down trading system...")
    
    if state.status_monitor:
        await state.status_monitor.stop()
    
    if state.alpaca_client:
        await state.alpaca_client.close()
    
    if state.kalshi_client:
        await state.kalshi_client.close()
    
    # Close all WebSocket connections
    for ws in state.websocket_connections.copy():
        try:
            await ws.close()
        except Exception:
            pass
    
    logger.info("Trading system shutdown complete")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle."""
    await initialize_trading_system()
    yield
    await shutdown_trading_system()


# ============================================================================
# FastAPI App
# ============================================================================

app = FastAPI(
    title="HFT Trading Dashboard API",
    description="API for the Alpaca/Kalshi HFT Trading Dashboard",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Helper Functions
# ============================================================================

def decimal_to_str(d: Decimal) -> str:
    """Convert Decimal to string for JSON serialization."""
    return f"{d:.2f}"


# ============================================================================
# REST Endpoints
# ============================================================================

@app.get("/")
async def root():
    """Serve the dashboard HTML."""
    dashboard_path = os.path.join(os.path.dirname(__file__), "..", "..", "ui", "dashboard.html")
    if os.path.exists(dashboard_path):
        return FileResponse(dashboard_path)
    return {"message": "HFT Trading API", "status": "running"}


@app.get("/api/status")
async def get_system_status():
    """Get overall system status."""
    return {
        "initialized": state.initialized,
        "paper_mode": state.paper_mode,
        "alpaca_connected": state.alpaca_client is not None,
        "kalshi_connected": state.kalshi_client is not None,
        "timestamp": datetime.now().isoformat(),
    }


@app.get("/api/account", response_model=AccountResponse)
async def get_account():
    """Get account information."""
    if not state.portfolio_tool or not state.alpaca_client:
        raise HTTPException(status_code=503, detail="Portfolio service not available")
    
    try:
        account = await state.portfolio_tool.get_account(use_cache=False)
        return AccountResponse(
            account_id=account.account_id,
            equity=decimal_to_str(account.equity),
            cash=decimal_to_str(account.cash),
            buying_power=decimal_to_str(account.buying_power),
            portfolio_value=decimal_to_str(account.portfolio_value),
            daytrade_count=account.daytrade_count,
            pattern_day_trader=account.pattern_day_trader,
            trading_blocked=account.trading_blocked,
            timestamp=datetime.now().isoformat(),
        )
    except Exception as e:
        logger.error(f"Error getting account: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/positions", response_model=List[PositionResponse])
async def get_positions():
    """Get all open positions."""
    if not state.portfolio_tool:
        raise HTTPException(status_code=503, detail="Portfolio service not available")
    
    try:
        positions = await state.portfolio_tool.get_positions(use_cache=False)
        return [
            PositionResponse(
                symbol=p.symbol,
                qty=p.qty,
                side=p.side,
                avg_entry_price=decimal_to_str(p.avg_entry_price),
                current_price=decimal_to_str(p.current_price),
                market_value=decimal_to_str(p.market_value),
                cost_basis=decimal_to_str(p.cost_basis),
                unrealized_pnl=decimal_to_str(p.unrealized_pnl),
                unrealized_pnl_pct=decimal_to_str(p.unrealized_pnl_pct * 100),
                change_today=decimal_to_str(p.change_today),
            )
            for p in positions
        ]
    except Exception as e:
        logger.error(f"Error getting positions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/portfolio", response_model=PortfolioSummaryResponse)
async def get_portfolio_summary():
    """Get complete portfolio summary."""
    if not state.portfolio_tool:
        raise HTTPException(status_code=503, detail="Portfolio service not available")
    
    try:
        summary = await state.portfolio_tool.get_portfolio_summary()
        return PortfolioSummaryResponse(
            account=AccountResponse(
                account_id=summary.account.account_id,
                equity=decimal_to_str(summary.account.equity),
                cash=decimal_to_str(summary.account.cash),
                buying_power=decimal_to_str(summary.account.buying_power),
                portfolio_value=decimal_to_str(summary.account.portfolio_value),
                daytrade_count=summary.account.daytrade_count,
                pattern_day_trader=summary.account.pattern_day_trader,
                trading_blocked=summary.account.trading_blocked,
                timestamp=datetime.now().isoformat(),
            ),
            positions=[
                PositionResponse(
                    symbol=p.symbol,
                    qty=p.qty,
                    side=p.side,
                    avg_entry_price=decimal_to_str(p.avg_entry_price),
                    current_price=decimal_to_str(p.current_price),
                    market_value=decimal_to_str(p.market_value),
                    cost_basis=decimal_to_str(p.cost_basis),
                    unrealized_pnl=decimal_to_str(p.unrealized_pnl),
                    unrealized_pnl_pct=decimal_to_str(p.unrealized_pnl_pct * 100),
                    change_today=decimal_to_str(p.change_today),
                )
                for p in summary.positions
            ],
            total_unrealized_pnl=decimal_to_str(summary.total_unrealized_pnl),
            position_count=summary.position_count,
            long_exposure=decimal_to_str(summary.long_exposure),
            short_exposure=decimal_to_str(summary.short_exposure),
            net_exposure=decimal_to_str(summary.net_exposure),
            gross_exposure=decimal_to_str(summary.gross_exposure),
        )
    except Exception as e:
        logger.error(f"Error getting portfolio summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/orders", response_model=List[OrderResponse])
async def get_orders(
    status: str = Query("open", description="Order status filter"),
    limit: int = Query(50, ge=1, le=500),
):
    """Get orders."""
    if not state.order_tool:
        raise HTTPException(status_code=503, detail="Order service not available")
    
    try:
        orders = await state.order_tool.list_orders(status=status, limit=limit)
        return [
            OrderResponse(
                order_id=o.get("id", ""),
                client_order_id=o.get("client_order_id"),
                symbol=o.get("symbol", ""),
                side=o.get("side", ""),
                qty=int(o.get("qty", 0)),
                filled_qty=int(o.get("filled_qty", 0)),
                order_type=o.get("type", ""),
                limit_price=o.get("limit_price"),
                status=o.get("status", ""),
                created_at=o.get("created_at", ""),
            )
            for o in orders
        ]
    except Exception as e:
        logger.error(f"Error getting orders: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/orders/{order_id}")
async def cancel_order(order_id: str):
    """Cancel an order."""
    if not state.order_tool:
        raise HTTPException(status_code=503, detail="Order service not available")
    
    try:
        result = await state.order_tool.cancel_order(order_id)
        if result.success:
            state.log_activity(f"Cancelled order {order_id}")
            return {"success": True, "order_id": order_id}
        raise HTTPException(status_code=400, detail=result.error)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/orders")
async def cancel_all_orders():
    """Cancel all open orders."""
    if not state.order_tool:
        raise HTTPException(status_code=503, detail="Order service not available")
    
    try:
        results = await state.order_tool.cancel_all_orders()
        state.log_activity(f"Cancelled {len(results)} orders")
        return {"success": True, "cancelled_count": len(results)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/risk", response_model=RiskStatusResponse)
async def get_risk_status():
    """Get risk engine status."""
    if not state.risk_tool:
        raise HTTPException(status_code=503, detail="Risk service not available")
    
    try:
        status = state.risk_tool.get_status()
        limits = state.risk_tool.get_limits()
        
        # Calculate exposure percentage
        exposure_pct = Decimal("0")
        daily_loss_pct = Decimal("0")
        
        if state.portfolio_tool:
            try:
                summary = await state.portfolio_tool.get_portfolio_summary()
                max_exposure = Decimal(limits.get("max_total_exposure", "200000"))
                if max_exposure > 0:
                    exposure_pct = (summary.gross_exposure / max_exposure) * 100
                
                max_daily_loss = Decimal(limits.get("max_daily_loss", "5000"))
                if max_daily_loss > 0 and status.daily_pnl < 0:
                    daily_loss_pct = (abs(status.daily_pnl) / max_daily_loss) * 100
            except Exception:
                pass
        
        can_trade, _ = state.risk_tool.can_trade()
        
        return RiskStatusResponse(
            kill_switch_active=status.kill_switch_active,
            circuit_breaker_state=status.circuit_breaker_state,
            dry_run_mode=status.dry_run_mode,
            daily_pnl=decimal_to_str(status.daily_pnl),
            drawdown_pct=decimal_to_str(status.drawdown_pct * 100),
            exposure_pct=decimal_to_str(exposure_pct),
            daily_loss_pct=decimal_to_str(daily_loss_pct),
            can_trade=can_trade,
            limits={
                "max_order_notional": limits.get("max_order_notional", "10000"),
                "max_position_notional": limits.get("max_position_notional", "50000"),
                "max_daily_loss": limits.get("max_daily_loss", "5000"),
                "max_total_exposure": limits.get("max_total_exposure", "200000"),
            }
        )
    except Exception as e:
        logger.error(f"Error getting risk status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/kill-switch")
async def toggle_kill_switch(request: KillSwitchRequest):
    """Activate or deactivate the kill switch."""
    if not state.risk_tool:
        raise HTTPException(status_code=503, detail="Risk service not available")
    
    try:
        if request.active:
            state.risk_tool.activate_kill_switch(request.reason or "Dashboard control")
            state.log_activity(f"KILL SWITCH ACTIVATED: {request.reason}", "critical")
        else:
            state.risk_tool.deactivate_kill_switch()
            state.log_activity("Kill switch deactivated", "warning")
        
        # Broadcast to all WebSocket clients
        await state.broadcast({
            "type": "kill_switch",
            "data": {"active": request.active}
        })
        
        return {"success": True, "active": request.active}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/dry-run")
async def toggle_dry_run(enable: bool = Query(...)):
    """Toggle dry-run mode."""
    if not state.risk_tool:
        raise HTTPException(status_code=503, detail="Risk service not available")
    
    try:
        if enable:
            state.risk_tool.enable_dry_run()
            state.log_activity("Dry-run mode enabled")
        else:
            state.risk_tool.disable_dry_run()
            state.log_activity("Dry-run mode DISABLED - orders will execute", "warning")
        
        return {"success": True, "dry_run": enable}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/limits")
async def update_limits(request: LimitsUpdateRequest):
    """Update risk limits."""
    if not state.risk_tool:
        raise HTTPException(status_code=503, detail="Risk service not available")
    
    try:
        updates = {}
        if request.max_order_notional:
            updates["max_order_notional"] = Decimal(request.max_order_notional)
        if request.max_position_notional:
            updates["max_position_notional"] = Decimal(request.max_position_notional)
        if request.max_daily_loss:
            updates["max_daily_loss"] = Decimal(request.max_daily_loss)
        if request.max_total_exposure:
            updates["max_total_exposure"] = Decimal(request.max_total_exposure)
        
        if updates:
            state.risk_tool.update_limits(**updates)
            state.log_activity(f"Risk limits updated: {updates}")
        
        return {"success": True, "updated": list(updates.keys())}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/circuit-breaker/reset")
async def reset_circuit_breaker():
    """Reset the circuit breaker."""
    if not state.risk_tool:
        raise HTTPException(status_code=503, detail="Risk service not available")
    
    try:
        state.risk_tool.reset_circuit_breaker()
        state.log_activity("Circuit breaker reset")
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/positions/close-all")
async def close_all_positions():
    """Close all positions (EMERGENCY)."""
    if not state.portfolio_tool:
        raise HTTPException(status_code=503, detail="Portfolio service not available")
    
    try:
        result = await state.portfolio_tool.close_all_positions(
            cancel_orders=True,
            reason="Dashboard close all"
        )
        state.log_activity("CLOSED ALL POSITIONS", "critical")
        return {"success": True, "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/services", response_model=List[ServiceStatusResponse])
async def get_service_status():
    """Get status of external services."""
    if not state.status_monitor:
        raise HTTPException(status_code=503, detail="Status monitor not available")
    
    try:
        statuses = state.status_monitor.get_all_status()
        return [
            ServiceStatusResponse(
                service=s.service,
                status=s.status.value,
                response_time_ms=s.response_time_ms,
                error=s.error_message,
                last_check=s.last_check.isoformat() if s.last_check else None,
            )
            for s in statuses.values()
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/activity")
async def get_activity(limit: int = Query(50, ge=1, le=100)):
    """Get recent activity log."""
    return state.activity_log[-limit:]


@app.get("/api/kalshi/balance")
async def get_kalshi_balance():
    """Get Kalshi account balance."""
    if not state.portfolio_tool or not state.kalshi_client:
        raise HTTPException(status_code=503, detail="Kalshi service not available")
    
    try:
        balance = await state.portfolio_tool.get_kalshi_balance()
        return {
            "balance": decimal_to_str(balance["balance"]),
            "available_balance": decimal_to_str(balance["available_balance"]),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/kalshi/positions")
async def get_kalshi_positions():
    """Get Kalshi positions."""
    if not state.portfolio_tool or not state.kalshi_client:
        raise HTTPException(status_code=503, detail="Kalshi service not available")
    
    try:
        positions = await state.portfolio_tool.get_kalshi_positions()
        return positions
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# WebSocket Endpoint
# ============================================================================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket for real-time updates."""
    await websocket.accept()
    state.websocket_connections.add(websocket)
    
    logger.info(f"WebSocket connected. Total connections: {len(state.websocket_connections)}")
    
    try:
        # Send initial state
        await websocket.send_json({
            "type": "connected",
            "data": {
                "initialized": state.initialized,
                "paper_mode": state.paper_mode,
            }
        })
        
        # Keep connection alive and listen for messages
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_json(), timeout=30.0)
                
                # Handle client messages
                if data.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
                
                elif data.get("type") == "subscribe":
                    # Client wants real-time updates
                    pass
                    
            except asyncio.TimeoutError:
                # Send keepalive
                await websocket.send_json({"type": "ping"})
                
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        state.websocket_connections.discard(websocket)


# ============================================================================
# Background Tasks
# ============================================================================

async def broadcast_updates():
    """Background task to broadcast periodic updates."""
    while True:
        try:
            if state.initialized and state.websocket_connections:
                # Get current portfolio state
                if state.portfolio_tool:
                    try:
                        account = await state.portfolio_tool.get_account()
                        positions = await state.portfolio_tool.get_positions()
                        
                        await state.broadcast({
                            "type": "portfolio_update",
                            "data": {
                                "equity": decimal_to_str(account.equity),
                                "cash": decimal_to_str(account.cash),
                                "buying_power": decimal_to_str(account.buying_power),
                                "position_count": len(positions),
                            }
                        })
                    except Exception as e:
                        logger.error(f"Error broadcasting update: {e}")
                
                # Get risk status
                if state.risk_tool:
                    try:
                        risk_status = state.risk_tool.get_status()
                        await state.broadcast({
                            "type": "risk_update",
                            "data": {
                                "kill_switch_active": risk_status.kill_switch_active,
                                "circuit_breaker_state": risk_status.circuit_breaker_state,
                                "daily_pnl": decimal_to_str(risk_status.daily_pnl),
                            }
                        })
                    except Exception:
                        pass
            
            await asyncio.sleep(5)  # Update every 5 seconds
            
        except Exception as e:
            logger.error(f"Broadcast task error: {e}")
            await asyncio.sleep(5)


@app.on_event("startup")
async def start_background_tasks():
    """Start background tasks on startup."""
    asyncio.create_task(broadcast_updates())


# ============================================================================
# Create App Factory
# ============================================================================

def create_app() -> FastAPI:
    """Factory function to create the FastAPI app."""
    return app


# Expose router for testing
api_router = app.router


# ============================================================================
# Run with uvicorn
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "src.api.server:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
