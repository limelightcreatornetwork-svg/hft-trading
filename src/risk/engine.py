"""
Risk Engine - Pre-trade and runtime risk controls for HFT system.

Implements all required risk controls:
- Pre-trade checks
- Position limits
- Loss limits / drawdown
- Circuit breakers
- Human approval workflow
- Kill switch
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from decimal import Decimal
from enum import Enum
from typing import Optional, Dict, List, Set, Callable, Any
from collections import deque
import json

logger = logging.getLogger(__name__)


class RiskAction(Enum):
    APPROVE = "approve"
    REJECT = "reject"
    REQUIRE_APPROVAL = "require_approval"
    DRY_RUN = "dry_run"


class CircuitState(Enum):
    CLOSED = "closed"  # Normal operation
    OPEN = "open"      # Trading halted
    HALF_OPEN = "half_open"  # Testing recovery


@dataclass
class RiskLimits:
    """Configurable risk limits."""
    # Order limits
    max_order_notional: Decimal = Decimal("10000")  # Max single order value
    max_order_shares: int = 1000  # Max shares per order
    
    # Position limits
    max_position_notional: Decimal = Decimal("50000")  # Max position value per symbol
    max_position_shares: int = 5000  # Max shares per symbol
    max_total_exposure: Decimal = Decimal("200000")  # Max total portfolio exposure
    max_concentration_pct: Decimal = Decimal("0.25")  # Max % in single position
    
    # Loss limits
    max_daily_loss: Decimal = Decimal("5000")  # Max daily loss
    max_weekly_loss: Decimal = Decimal("15000")  # Max weekly loss
    max_drawdown_pct: Decimal = Decimal("0.10")  # Max drawdown from peak
    
    # Spend limits
    daily_spend_limit: Decimal = Decimal("100000")  # Max daily buys
    weekly_spend_limit: Decimal = Decimal("300000")  # Max weekly buys
    monthly_spend_limit: Decimal = Decimal("1000000")  # Max monthly buys
    
    # Human approval thresholds
    approval_notional_threshold: Decimal = Decimal("25000")  # Require approval above this
    approval_loss_threshold: Decimal = Decimal("2000")  # Require approval if losing this much
    
    # Circuit breaker thresholds
    max_reject_rate: float = 0.3  # 30% reject rate triggers breaker
    max_slippage_pct: float = 0.02  # 2% slippage triggers warning
    reject_window_size: int = 20  # Window for reject rate calculation
    
    # Symbol restrictions
    allowed_symbols: Optional[Set[str]] = None  # If set, whitelist mode
    blocked_symbols: Set[str] = field(default_factory=set)  # Blocklist


@dataclass
class Order:
    """Order representation for risk checks."""
    symbol: str
    side: str  # buy/sell
    qty: int
    order_type: str  # market/limit/stop/etc
    limit_price: Optional[Decimal] = None
    stop_price: Optional[Decimal] = None
    time_in_force: str = "day"
    client_order_id: Optional[str] = None
    extended_hours: bool = False
    
    def notional(self, market_price: Decimal) -> Decimal:
        """Calculate notional value."""
        price = self.limit_price or market_price
        return price * self.qty


@dataclass 
class Position:
    """Position representation."""
    symbol: str
    qty: int
    avg_entry_price: Decimal
    current_price: Decimal
    market_value: Decimal
    unrealized_pnl: Decimal


@dataclass
class RiskCheckResult:
    """Result of a risk check."""
    action: RiskAction
    checks_passed: List[str]
    checks_failed: List[str]
    warnings: List[str]
    approval_reason: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    @property
    def approved(self) -> bool:
        return self.action in (RiskAction.APPROVE, RiskAction.DRY_RUN)


class SpendTracker:
    """Tracks spending over time windows."""
    
    def __init__(self):
        self.daily_spend: Decimal = Decimal("0")
        self.weekly_spend: Decimal = Decimal("0")
        self.monthly_spend: Decimal = Decimal("0")
        self.daily_reset: datetime = datetime.now().replace(hour=0, minute=0, second=0)
        self.weekly_reset: datetime = self._get_week_start()
        self.monthly_reset: datetime = datetime.now().replace(day=1, hour=0, minute=0, second=0)
    
    def _get_week_start(self) -> datetime:
        now = datetime.now()
        return (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0)
    
    def _check_reset(self):
        now = datetime.now()
        
        # Daily reset
        if now >= self.daily_reset + timedelta(days=1):
            self.daily_spend = Decimal("0")
            self.daily_reset = now.replace(hour=0, minute=0, second=0)
        
        # Weekly reset
        if now >= self.weekly_reset + timedelta(weeks=1):
            self.weekly_spend = Decimal("0")
            self.weekly_reset = self._get_week_start()
        
        # Monthly reset
        next_month = (self.monthly_reset.replace(day=28) + timedelta(days=4)).replace(day=1)
        if now >= next_month:
            self.monthly_spend = Decimal("0")
            self.monthly_reset = now.replace(day=1, hour=0, minute=0, second=0)
    
    def record_spend(self, amount: Decimal):
        self._check_reset()
        self.daily_spend += amount
        self.weekly_spend += amount
        self.monthly_spend += amount
    
    def get_remaining(self, limits: RiskLimits) -> Dict[str, Decimal]:
        self._check_reset()
        return {
            "daily": limits.daily_spend_limit - self.daily_spend,
            "weekly": limits.weekly_spend_limit - self.weekly_spend,
            "monthly": limits.monthly_spend_limit - self.monthly_spend,
        }


class CircuitBreaker:
    """Circuit breaker for trading halts."""
    
    def __init__(self, limits: RiskLimits):
        self.limits = limits
        self.state = CircuitState.CLOSED
        self.recent_orders: deque = deque(maxlen=limits.reject_window_size)
        self.opened_at: Optional[datetime] = None
        self.cooldown_minutes: int = 5
    
    def record_order(self, success: bool, slippage_pct: float = 0.0):
        """Record order outcome."""
        self.recent_orders.append({
            "success": success,
            "slippage": slippage_pct,
            "time": datetime.now()
        })
        
        # Check if we should trip
        if len(self.recent_orders) >= 5:  # Minimum sample
            reject_rate = sum(1 for o in self.recent_orders if not o["success"]) / len(self.recent_orders)
            if reject_rate > self.limits.max_reject_rate:
                self._trip(f"High reject rate: {reject_rate:.1%}")
            
            avg_slippage = sum(o["slippage"] for o in self.recent_orders) / len(self.recent_orders)
            if avg_slippage > self.limits.max_slippage_pct:
                self._trip(f"High slippage: {avg_slippage:.2%}")
    
    def _trip(self, reason: str):
        """Trip the circuit breaker."""
        if self.state == CircuitState.CLOSED:
            logger.warning(f"Circuit breaker TRIPPED: {reason}")
            self.state = CircuitState.OPEN
            self.opened_at = datetime.now()
    
    def can_trade(self) -> tuple[bool, Optional[str]]:
        """Check if trading is allowed."""
        if self.state == CircuitState.CLOSED:
            return True, None
        
        if self.state == CircuitState.OPEN and self.opened_at:
            elapsed = datetime.now() - self.opened_at
            if elapsed > timedelta(minutes=self.cooldown_minutes):
                self.state = CircuitState.HALF_OPEN
                return True, "Circuit breaker in test mode"
        
        return False, "Circuit breaker OPEN - trading halted"
    
    def reset(self):
        """Manually reset the circuit breaker."""
        logger.info("Circuit breaker manually reset")
        self.state = CircuitState.CLOSED
        self.opened_at = None
        self.recent_orders.clear()


class LossTracker:
    """Tracks P&L and drawdown."""
    
    def __init__(self):
        self.daily_pnl: Decimal = Decimal("0")
        self.weekly_pnl: Decimal = Decimal("0")
        self.peak_equity: Decimal = Decimal("0")
        self.current_equity: Decimal = Decimal("0")
        self.daily_reset: datetime = datetime.now().replace(hour=0, minute=0, second=0)
        self.weekly_reset: datetime = self._get_week_start()
    
    def _get_week_start(self) -> datetime:
        now = datetime.now()
        return (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0)
    
    def _check_reset(self):
        now = datetime.now()
        if now >= self.daily_reset + timedelta(days=1):
            self.daily_pnl = Decimal("0")
            self.daily_reset = now.replace(hour=0, minute=0, second=0)
        
        if now >= self.weekly_reset + timedelta(weeks=1):
            self.weekly_pnl = Decimal("0")
            self.weekly_reset = self._get_week_start()
    
    def update(self, realized_pnl: Decimal, equity: Decimal):
        self._check_reset()
        self.daily_pnl += realized_pnl
        self.weekly_pnl += realized_pnl
        self.current_equity = equity
        self.peak_equity = max(self.peak_equity, equity)
    
    def get_drawdown_pct(self) -> Decimal:
        if self.peak_equity <= 0:
            return Decimal("0")
        return (self.peak_equity - self.current_equity) / self.peak_equity


class RiskEngine:
    """
    Main risk engine for pre-trade checks and runtime controls.
    
    Usage:
        engine = RiskEngine(limits)
        result = await engine.check_order(order, positions, market_data)
        if result.approved:
            # Submit order
        elif result.action == RiskAction.REQUIRE_APPROVAL:
            # Queue for human approval
        else:
            # Reject order
    """
    
    def __init__(
        self, 
        limits: Optional[RiskLimits] = None,
        dry_run: bool = False,
        approval_callback: Optional[Callable[[Order, str], bool]] = None
    ):
        self.limits = limits or RiskLimits()
        self.dry_run = dry_run
        self.approval_callback = approval_callback
        
        self.spend_tracker = SpendTracker()
        self.circuit_breaker = CircuitBreaker(self.limits)
        self.loss_tracker = LossTracker()
        
        self.kill_switch_active = False
        self._pending_approvals: Dict[str, Order] = {}
    
    async def check_order(
        self,
        order: Order,
        positions: Dict[str, Position],
        market_price: Decimal,
        account_equity: Optional[Decimal] = None
    ) -> RiskCheckResult:
        """
        Run all pre-trade risk checks on an order.
        
        Returns RiskCheckResult with action and details.
        """
        passed = []
        failed = []
        warnings = []
        
        # Kill switch check
        if self.kill_switch_active:
            return RiskCheckResult(
                action=RiskAction.REJECT,
                checks_passed=[],
                checks_failed=["KILL_SWITCH_ACTIVE"],
                warnings=[]
            )
        
        # Circuit breaker check
        can_trade, cb_reason = self.circuit_breaker.can_trade()
        if not can_trade:
            return RiskCheckResult(
                action=RiskAction.REJECT,
                checks_passed=[],
                checks_failed=[f"CIRCUIT_BREAKER: {cb_reason}"],
                warnings=[]
            )
        if cb_reason:
            warnings.append(cb_reason)
        
        notional = order.notional(market_price)
        
        # Symbol checks
        if self.limits.allowed_symbols and order.symbol not in self.limits.allowed_symbols:
            failed.append(f"SYMBOL_NOT_ALLOWED: {order.symbol}")
        else:
            passed.append("symbol_allowlist")
        
        if order.symbol in self.limits.blocked_symbols:
            failed.append(f"SYMBOL_BLOCKED: {order.symbol}")
        else:
            passed.append("symbol_blocklist")
        
        # Order size checks
        if notional > self.limits.max_order_notional:
            failed.append(f"ORDER_NOTIONAL_EXCEEDED: ${notional} > ${self.limits.max_order_notional}")
        else:
            passed.append("order_notional")
        
        if order.qty > self.limits.max_order_shares:
            failed.append(f"ORDER_SHARES_EXCEEDED: {order.qty} > {self.limits.max_order_shares}")
        else:
            passed.append("order_shares")
        
        # Position limits
        current_position = positions.get(order.symbol)
        current_qty = current_position.qty if current_position else 0
        new_qty = current_qty + order.qty if order.side == "buy" else current_qty - order.qty
        
        if abs(new_qty) > self.limits.max_position_shares:
            failed.append(f"POSITION_SHARES_EXCEEDED: {abs(new_qty)} > {self.limits.max_position_shares}")
        else:
            passed.append("position_shares")
        
        new_position_value = abs(new_qty) * market_price
        if new_position_value > self.limits.max_position_notional:
            failed.append(f"POSITION_NOTIONAL_EXCEEDED: ${new_position_value} > ${self.limits.max_position_notional}")
        else:
            passed.append("position_notional")
        
        # Total exposure check
        total_exposure = sum(p.market_value for p in positions.values())
        if order.side == "buy":
            total_exposure += notional
        
        if total_exposure > self.limits.max_total_exposure:
            failed.append(f"TOTAL_EXPOSURE_EXCEEDED: ${total_exposure} > ${self.limits.max_total_exposure}")
        else:
            passed.append("total_exposure")
        
        # Concentration check
        if account_equity and account_equity > 0:
            concentration = new_position_value / account_equity
            if concentration > self.limits.max_concentration_pct:
                failed.append(f"CONCENTRATION_EXCEEDED: {concentration:.1%} > {self.limits.max_concentration_pct:.0%}")
            else:
                passed.append("concentration")
        
        # Loss limit checks
        if self.loss_tracker.daily_pnl < -self.limits.max_daily_loss:
            failed.append(f"DAILY_LOSS_LIMIT: ${abs(self.loss_tracker.daily_pnl)} > ${self.limits.max_daily_loss}")
        else:
            passed.append("daily_loss_limit")
        
        if self.loss_tracker.weekly_pnl < -self.limits.max_weekly_loss:
            failed.append(f"WEEKLY_LOSS_LIMIT: ${abs(self.loss_tracker.weekly_pnl)} > ${self.limits.max_weekly_loss}")
        else:
            passed.append("weekly_loss_limit")
        
        drawdown = self.loss_tracker.get_drawdown_pct()
        if drawdown > self.limits.max_drawdown_pct:
            failed.append(f"DRAWDOWN_LIMIT: {drawdown:.1%} > {self.limits.max_drawdown_pct:.0%}")
        else:
            passed.append("drawdown_limit")
        
        # Spend limit checks (only for buys)
        if order.side == "buy":
            remaining = self.spend_tracker.get_remaining(self.limits)
            
            if notional > remaining["daily"]:
                failed.append(f"DAILY_SPEND_LIMIT: ${notional} > ${remaining['daily']} remaining")
            else:
                passed.append("daily_spend_limit")
            
            if notional > remaining["weekly"]:
                failed.append(f"WEEKLY_SPEND_LIMIT: ${notional} > ${remaining['weekly']} remaining")
            else:
                passed.append("weekly_spend_limit")
            
            if notional > remaining["monthly"]:
                failed.append(f"MONTHLY_SPEND_LIMIT: ${notional} > ${remaining['monthly']} remaining")
            else:
                passed.append("monthly_spend_limit")
        
        # Determine action
        if failed:
            action = RiskAction.REJECT
        elif self.dry_run:
            action = RiskAction.DRY_RUN
        else:
            # Check if approval required
            approval_reason = None
            
            if notional > self.limits.approval_notional_threshold:
                approval_reason = f"Large order: ${notional}"
            elif self.loss_tracker.daily_pnl < -self.limits.approval_loss_threshold:
                approval_reason = f"Trading while down ${abs(self.loss_tracker.daily_pnl)}"
            
            if approval_reason:
                action = RiskAction.REQUIRE_APPROVAL
            else:
                action = RiskAction.APPROVE
        
        return RiskCheckResult(
            action=action,
            checks_passed=passed,
            checks_failed=failed,
            warnings=warnings,
            approval_reason=approval_reason if action == RiskAction.REQUIRE_APPROVAL else None,
            metadata={
                "notional": str(notional),
                "market_price": str(market_price),
                "daily_pnl": str(self.loss_tracker.daily_pnl),
                "drawdown_pct": str(drawdown),
            }
        )
    
    def record_fill(self, notional: Decimal, realized_pnl: Decimal = Decimal("0")):
        """Record a filled order for tracking."""
        self.spend_tracker.record_spend(notional)
        self.circuit_breaker.record_order(success=True)
    
    def record_reject(self, reason: str = ""):
        """Record a rejected order for circuit breaker."""
        self.circuit_breaker.record_order(success=False)
    
    def update_equity(self, equity: Decimal, realized_pnl: Decimal = Decimal("0")):
        """Update equity and P&L tracking."""
        self.loss_tracker.update(realized_pnl, equity)
    
    def activate_kill_switch(self, reason: str = "Manual activation"):
        """Activate kill switch to halt all trading."""
        logger.critical(f"KILL SWITCH ACTIVATED: {reason}")
        self.kill_switch_active = True
    
    def deactivate_kill_switch(self):
        """Deactivate kill switch to resume trading."""
        logger.warning("Kill switch deactivated")
        self.kill_switch_active = False
    
    def get_status(self) -> Dict[str, Any]:
        """Get current risk engine status."""
        return {
            "kill_switch": self.kill_switch_active,
            "circuit_breaker": self.circuit_breaker.state.value,
            "dry_run": self.dry_run,
            "daily_pnl": str(self.loss_tracker.daily_pnl),
            "weekly_pnl": str(self.loss_tracker.weekly_pnl),
            "drawdown_pct": str(self.loss_tracker.get_drawdown_pct()),
            "spend_remaining": {
                k: str(v) for k, v in 
                self.spend_tracker.get_remaining(self.limits).items()
            },
            "limits": {
                "max_order_notional": str(self.limits.max_order_notional),
                "max_position_notional": str(self.limits.max_position_notional),
                "max_daily_loss": str(self.limits.max_daily_loss),
            }
        }


# Singleton instance for easy access
_risk_engine: Optional[RiskEngine] = None

def get_risk_engine() -> RiskEngine:
    global _risk_engine
    if _risk_engine is None:
        _risk_engine = RiskEngine()
    return _risk_engine

def configure_risk_engine(limits: RiskLimits, dry_run: bool = False) -> RiskEngine:
    global _risk_engine
    _risk_engine = RiskEngine(limits=limits, dry_run=dry_run)
    return _risk_engine
