"""
Risk Tool

Provides:
- Pre-trade risk checks
- Position and exposure monitoring
- Risk limit configuration
- Kill switch control
- Circuit breaker status
"""

import logging
from dataclasses import dataclass, asdict
from datetime import datetime
from decimal import Decimal
from typing import Optional, Dict, List, Any

from ..risk.engine import (
    RiskEngine, RiskLimits, RiskCheckResult, RiskAction,
    Order as RiskOrder, Position, CircuitState,
)

logger = logging.getLogger(__name__)


@dataclass
class RiskStatus:
    """Current risk engine status."""
    kill_switch_active: bool
    circuit_breaker_state: str
    dry_run_mode: bool
    
    # P&L
    daily_pnl: Decimal
    weekly_pnl: Decimal
    drawdown_pct: Decimal
    
    # Spend limits
    daily_spend_remaining: Decimal
    weekly_spend_remaining: Decimal
    monthly_spend_remaining: Decimal
    
    # Limits summary
    max_order_notional: Decimal
    max_position_notional: Decimal
    max_daily_loss: Decimal
    
    timestamp: datetime = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now()
    
    @property
    def can_trade(self) -> bool:
        return not self.kill_switch_active and self.circuit_breaker_state == "closed"


@dataclass 
class PreTradeCheck:
    """Result of a pre-trade risk check."""
    approved: bool
    action: str
    checks_passed: List[str]
    checks_failed: List[str]
    warnings: List[str]
    approval_required: bool
    approval_reason: Optional[str]
    order_notional: Decimal
    
    def to_dict(self) -> Dict:
        return {
            "approved": self.approved,
            "action": self.action,
            "checks_passed": self.checks_passed,
            "checks_failed": self.checks_failed,
            "warnings": self.warnings,
            "approval_required": self.approval_required,
            "approval_reason": self.approval_reason,
            "order_notional": str(self.order_notional),
        }


class RiskTool:
    """
    Agent tool for risk management.
    
    Usage:
        tool = RiskTool(risk_engine)
        
        # Check risk status
        status = tool.get_status()
        
        # Pre-trade check
        check = await tool.check_order("AAPL", "buy", 100, limit_price=Decimal("150"))
        
        # Emergency: activate kill switch
        tool.activate_kill_switch("Market volatility")
        
        # Update limits
        tool.update_limits(max_order_notional=Decimal("5000"))
    """
    
    def __init__(
        self,
        risk_engine: Optional[RiskEngine] = None,
        portfolio_tool=None,
        market_data_tool=None,
    ):
        self.risk_engine = risk_engine or RiskEngine()
        self.portfolio = portfolio_tool
        self.market_data = market_data_tool
    
    def get_status(self) -> RiskStatus:
        """
        Get current risk engine status.
        
        Returns:
            RiskStatus with all current limits and states
        """
        status = self.risk_engine.get_status()
        remaining = status["spend_remaining"]
        
        return RiskStatus(
            kill_switch_active=status["kill_switch"],
            circuit_breaker_state=status["circuit_breaker"],
            dry_run_mode=status["dry_run"],
            daily_pnl=Decimal(status["daily_pnl"]),
            weekly_pnl=Decimal(status["weekly_pnl"]),
            drawdown_pct=Decimal(status["drawdown_pct"]),
            daily_spend_remaining=Decimal(remaining["daily"]),
            weekly_spend_remaining=Decimal(remaining["weekly"]),
            monthly_spend_remaining=Decimal(remaining["monthly"]),
            max_order_notional=Decimal(status["limits"]["max_order_notional"]),
            max_position_notional=Decimal(status["limits"]["max_position_notional"]),
            max_daily_loss=Decimal(status["limits"]["max_daily_loss"]),
        )
    
    async def check_order(
        self,
        symbol: str,
        side: str,
        qty: int,
        order_type: str = "market",
        limit_price: Optional[Decimal] = None,
        stop_price: Optional[Decimal] = None,
    ) -> PreTradeCheck:
        """
        Run pre-trade risk check on a potential order.
        
        Args:
            symbol: Stock/contract symbol
            side: "buy" or "sell"
            qty: Order quantity
            order_type: "market", "limit", etc.
            limit_price: Limit price if applicable
            stop_price: Stop price if applicable
        
        Returns:
            PreTradeCheck with approval status and details
        """
        # Get market price
        market_price = Decimal("0")
        if self.market_data:
            try:
                quote = await self.market_data.get_quote(symbol)
                market_price = quote.ask_price if side == "buy" else quote.bid_price
            except Exception:
                if limit_price:
                    market_price = limit_price
        elif limit_price:
            market_price = limit_price
        
        # Get current positions
        positions: Dict[str, Position] = {}
        account_equity = None
        
        if self.portfolio:
            try:
                account = await self.portfolio.get_account()
                account_equity = account.equity
                
                for p in await self.portfolio.get_positions():
                    positions[p.symbol] = Position(
                        symbol=p.symbol,
                        qty=p.qty if p.side == "long" else -p.qty,
                        avg_entry_price=p.avg_entry_price,
                        current_price=p.current_price,
                        market_value=p.market_value,
                        unrealized_pnl=p.unrealized_pnl,
                    )
            except Exception as e:
                logger.warning(f"Could not get portfolio data: {e}")
        
        # Create risk order
        risk_order = RiskOrder(
            symbol=symbol,
            side=side,
            qty=qty,
            order_type=order_type,
            limit_price=limit_price,
            stop_price=stop_price,
        )
        
        # Run check
        result = await self.risk_engine.check_order(
            risk_order, positions, market_price, account_equity
        )
        
        notional = risk_order.notional(market_price)
        
        return PreTradeCheck(
            approved=result.approved,
            action=result.action.value,
            checks_passed=result.checks_passed,
            checks_failed=result.checks_failed,
            warnings=result.warnings,
            approval_required=result.action == RiskAction.REQUIRE_APPROVAL,
            approval_reason=result.approval_reason,
            order_notional=notional,
        )
    
    def can_trade(self) -> tuple[bool, Optional[str]]:
        """
        Quick check if trading is allowed.
        
        Returns:
            Tuple of (can_trade, reason_if_blocked)
        """
        if self.risk_engine.kill_switch_active:
            return False, "Kill switch active"
        
        can_trade, reason = self.risk_engine.circuit_breaker.can_trade()
        return can_trade, reason
    
    # Kill switch controls
    def activate_kill_switch(self, reason: str = "Manual activation"):
        """
        EMERGENCY: Activate kill switch to halt all trading.
        
        Args:
            reason: Reason for activation (logged)
        """
        logger.critical(f"KILL SWITCH ACTIVATED: {reason}")
        self.risk_engine.activate_kill_switch(reason)
    
    def deactivate_kill_switch(self):
        """Deactivate kill switch to resume trading."""
        logger.warning("Kill switch deactivated")
        self.risk_engine.deactivate_kill_switch()
    
    # Circuit breaker controls
    def reset_circuit_breaker(self):
        """Manually reset the circuit breaker."""
        self.risk_engine.circuit_breaker.reset()
    
    def get_circuit_breaker_state(self) -> str:
        """Get current circuit breaker state."""
        return self.risk_engine.circuit_breaker.state.value
    
    # Dry run mode
    def enable_dry_run(self):
        """Enable dry-run mode (orders simulated, not submitted)."""
        self.risk_engine.dry_run = True
        logger.info("Dry-run mode enabled")
    
    def disable_dry_run(self):
        """Disable dry-run mode (orders will be submitted)."""
        self.risk_engine.dry_run = False
        logger.info("Dry-run mode disabled")
    
    def is_dry_run(self) -> bool:
        """Check if dry-run mode is active."""
        return self.risk_engine.dry_run
    
    # Limit configuration
    def get_limits(self) -> Dict[str, Any]:
        """Get current risk limits."""
        limits = self.risk_engine.limits
        return {
            "max_order_notional": str(limits.max_order_notional),
            "max_order_shares": limits.max_order_shares,
            "max_position_notional": str(limits.max_position_notional),
            "max_position_shares": limits.max_position_shares,
            "max_total_exposure": str(limits.max_total_exposure),
            "max_concentration_pct": str(limits.max_concentration_pct),
            "max_daily_loss": str(limits.max_daily_loss),
            "max_weekly_loss": str(limits.max_weekly_loss),
            "max_drawdown_pct": str(limits.max_drawdown_pct),
            "daily_spend_limit": str(limits.daily_spend_limit),
            "weekly_spend_limit": str(limits.weekly_spend_limit),
            "monthly_spend_limit": str(limits.monthly_spend_limit),
            "approval_notional_threshold": str(limits.approval_notional_threshold),
            "approval_loss_threshold": str(limits.approval_loss_threshold),
            "allowed_symbols": list(limits.allowed_symbols) if limits.allowed_symbols else None,
            "blocked_symbols": list(limits.blocked_symbols),
        }
    
    def update_limits(
        self,
        max_order_notional: Optional[Decimal] = None,
        max_order_shares: Optional[int] = None,
        max_position_notional: Optional[Decimal] = None,
        max_position_shares: Optional[int] = None,
        max_total_exposure: Optional[Decimal] = None,
        max_concentration_pct: Optional[Decimal] = None,
        max_daily_loss: Optional[Decimal] = None,
        max_weekly_loss: Optional[Decimal] = None,
        max_drawdown_pct: Optional[Decimal] = None,
        daily_spend_limit: Optional[Decimal] = None,
        weekly_spend_limit: Optional[Decimal] = None,
        monthly_spend_limit: Optional[Decimal] = None,
        approval_notional_threshold: Optional[Decimal] = None,
        approval_loss_threshold: Optional[Decimal] = None,
    ):
        """
        Update risk limits.
        
        Only provided parameters are updated; others remain unchanged.
        """
        limits = self.risk_engine.limits
        
        if max_order_notional is not None:
            limits.max_order_notional = max_order_notional
        if max_order_shares is not None:
            limits.max_order_shares = max_order_shares
        if max_position_notional is not None:
            limits.max_position_notional = max_position_notional
        if max_position_shares is not None:
            limits.max_position_shares = max_position_shares
        if max_total_exposure is not None:
            limits.max_total_exposure = max_total_exposure
        if max_concentration_pct is not None:
            limits.max_concentration_pct = max_concentration_pct
        if max_daily_loss is not None:
            limits.max_daily_loss = max_daily_loss
        if max_weekly_loss is not None:
            limits.max_weekly_loss = max_weekly_loss
        if max_drawdown_pct is not None:
            limits.max_drawdown_pct = max_drawdown_pct
        if daily_spend_limit is not None:
            limits.daily_spend_limit = daily_spend_limit
        if weekly_spend_limit is not None:
            limits.weekly_spend_limit = weekly_spend_limit
        if monthly_spend_limit is not None:
            limits.monthly_spend_limit = monthly_spend_limit
        if approval_notional_threshold is not None:
            limits.approval_notional_threshold = approval_notional_threshold
        if approval_loss_threshold is not None:
            limits.approval_loss_threshold = approval_loss_threshold
        
        logger.info("Risk limits updated")
    
    def add_allowed_symbol(self, symbol: str):
        """Add symbol to allowlist (enables whitelist mode if first symbol)."""
        if self.risk_engine.limits.allowed_symbols is None:
            self.risk_engine.limits.allowed_symbols = set()
        self.risk_engine.limits.allowed_symbols.add(symbol)
    
    def remove_allowed_symbol(self, symbol: str):
        """Remove symbol from allowlist."""
        if self.risk_engine.limits.allowed_symbols:
            self.risk_engine.limits.allowed_symbols.discard(symbol)
    
    def clear_allowlist(self):
        """Clear symbol allowlist (disables whitelist mode)."""
        self.risk_engine.limits.allowed_symbols = None
    
    def add_blocked_symbol(self, symbol: str):
        """Add symbol to blocklist."""
        self.risk_engine.limits.blocked_symbols.add(symbol)
    
    def remove_blocked_symbol(self, symbol: str):
        """Remove symbol from blocklist."""
        self.risk_engine.limits.blocked_symbols.discard(symbol)
    
    # P&L tracking
    def update_equity(self, equity: Decimal, realized_pnl: Decimal = Decimal("0")):
        """Update equity and P&L tracking."""
        self.risk_engine.update_equity(equity, realized_pnl)
    
    def record_fill(self, notional: Decimal, realized_pnl: Decimal = Decimal("0")):
        """Record a filled order."""
        self.risk_engine.record_fill(notional, realized_pnl)
    
    def record_reject(self, reason: str = ""):
        """Record a rejected order (for circuit breaker)."""
        self.risk_engine.record_reject(reason)
    
    # Exposure analysis
    async def analyze_exposure(self) -> Dict[str, Any]:
        """
        Analyze current portfolio exposure vs limits.
        
        Returns:
            Dict with exposure metrics and limit utilization
        """
        if not self.portfolio:
            return {"error": "Portfolio tool required"}
        
        summary = await self.portfolio.get_portfolio_summary()
        limits = self.risk_engine.limits
        
        return {
            "total_exposure": str(summary.gross_exposure),
            "exposure_limit": str(limits.max_total_exposure),
            "exposure_utilization_pct": str(
                summary.gross_exposure / limits.max_total_exposure * 100
                if limits.max_total_exposure > 0 else Decimal("0")
            ),
            "net_exposure": str(summary.net_exposure),
            "long_exposure": str(summary.long_exposure),
            "short_exposure": str(summary.short_exposure),
            "largest_position_pct": str(summary.largest_position_pct * 100),
            "concentration_limit_pct": str(limits.max_concentration_pct * 100),
            "position_count": summary.position_count,
            "positions": [
                {
                    "symbol": p.symbol,
                    "market_value": str(p.market_value),
                    "pct_of_portfolio": str(
                        abs(p.market_value) / summary.account.equity * 100
                        if summary.account.equity > 0 else Decimal("0")
                    ),
                }
                for p in summary.positions
            ],
        }
