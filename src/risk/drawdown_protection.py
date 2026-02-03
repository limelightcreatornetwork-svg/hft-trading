"""
Drawdown Protection Module - Auto-liquidation and Capital Protection

Implements:
- Real-time drawdown monitoring
- Automatic position liquidation on max drawdown
- Staged drawdown responses (warning, reduce, liquidate)
- Daily/weekly loss limits with automatic trading halt
- Recovery mode after drawdowns
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional, Dict, List, Callable, Any, Awaitable
from enum import Enum

logger = logging.getLogger(__name__)


class DrawdownLevel(Enum):
    """Drawdown severity levels."""
    NORMAL = "normal"           # < 5% - Normal operation
    CAUTION = "caution"         # 5-8% - Reduce position sizes
    WARNING = "warning"         # 8-12% - Stop new trades
    CRITICAL = "critical"       # 12-15% - Start liquidation
    EMERGENCY = "emergency"     # > 15% - Full liquidation


class LossLimitType(Enum):
    """Types of loss limits."""
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    TRAILING = "trailing"


@dataclass
class DrawdownConfig:
    """Configuration for drawdown protection."""
    # Drawdown thresholds (as decimals, e.g., 0.05 = 5%)
    caution_threshold: float = 0.05      # Start caution mode
    warning_threshold: float = 0.08      # Stop new trades
    critical_threshold: float = 0.12     # Start liquidation
    emergency_threshold: float = 0.15    # Full liquidation
    
    # Loss limits (absolute dollar amounts)
    daily_loss_limit: Decimal = Decimal("25")      # $25 for small account
    weekly_loss_limit: Decimal = Decimal("75")     # $75 weekly
    monthly_loss_limit: Decimal = Decimal("150")   # $150 monthly
    
    # As percentage of account
    daily_loss_pct: float = 0.05     # 5% daily loss limit
    weekly_loss_pct: float = 0.10    # 10% weekly
    monthly_loss_pct: float = 0.20   # 20% monthly
    
    # Recovery settings
    recovery_cooldown_hours: int = 24     # Hours to wait after emergency
    reduced_sizing_pct: float = 0.50      # 50% size during recovery
    
    # Auto-liquidation settings
    liquidate_on_emergency: bool = True
    liquidate_losers_first: bool = True   # Liquidate losing positions first
    preserve_winners: bool = True          # Keep profitable positions longer


@dataclass
class DrawdownState:
    """Current drawdown state."""
    level: DrawdownLevel
    current_drawdown_pct: float
    peak_equity: Decimal
    current_equity: Decimal
    
    # Loss tracking
    daily_loss: Decimal
    weekly_loss: Decimal
    monthly_loss: Decimal
    
    # Status
    trading_allowed: bool
    new_positions_allowed: bool
    sizing_multiplier: float  # 1.0 = normal, 0.5 = half size
    
    # Recovery
    in_recovery: bool
    recovery_until: Optional[datetime]
    
    # Last update
    timestamp: datetime = field(default_factory=datetime.now)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "level": self.level.value,
            "current_drawdown_pct": f"{self.current_drawdown_pct:.2%}",
            "peak_equity": str(self.peak_equity),
            "current_equity": str(self.current_equity),
            "daily_loss": str(self.daily_loss),
            "weekly_loss": str(self.weekly_loss),
            "monthly_loss": str(self.monthly_loss),
            "trading_allowed": self.trading_allowed,
            "new_positions_allowed": self.new_positions_allowed,
            "sizing_multiplier": self.sizing_multiplier,
            "in_recovery": self.in_recovery,
            "timestamp": self.timestamp.isoformat(),
        }


@dataclass
class LiquidationOrder:
    """Order to liquidate a position."""
    symbol: str
    side: str  # "sell" to close long, "buy" to close short
    qty: int
    reason: str
    priority: int  # Lower = higher priority
    unrealized_pnl: Decimal


class DrawdownProtector:
    """
    Drawdown protection and auto-liquidation system.
    
    Monitors equity and triggers protective actions:
    1. CAUTION: Reduce position sizes by 50%
    2. WARNING: Block new positions, only allow risk reduction
    3. CRITICAL: Start liquidating losing positions
    4. EMERGENCY: Liquidate all positions (kill switch)
    
    Usage:
        protector = DrawdownProtector(config, initial_equity)
        
        # Update with current equity
        state = protector.update_equity(current_equity)
        
        # Check before trading
        if state.trading_allowed:
            # Trade with state.sizing_multiplier
        
        # Get liquidation orders if needed
        orders = protector.get_liquidation_orders(positions)
    """
    
    def __init__(
        self,
        config: Optional[DrawdownConfig] = None,
        initial_equity: Decimal = Decimal("0"),
        on_level_change: Optional[Callable[[DrawdownLevel, DrawdownLevel], Awaitable[None]]] = None,
        on_liquidation_required: Optional[Callable[[List[LiquidationOrder]], Awaitable[None]]] = None,
    ):
        self.config = config or DrawdownConfig()
        self._on_level_change = on_level_change
        self._on_liquidation_required = on_liquidation_required
        
        # State
        self._peak_equity = initial_equity
        self._current_equity = initial_equity
        self._current_level = DrawdownLevel.NORMAL
        
        # Loss tracking
        self._daily_loss = Decimal("0")
        self._weekly_loss = Decimal("0")
        self._monthly_loss = Decimal("0")
        self._daily_start_equity = initial_equity
        self._weekly_start_equity = initial_equity
        self._monthly_start_equity = initial_equity
        
        # Reset timestamps
        self._daily_reset = datetime.now().replace(hour=0, minute=0, second=0)
        self._weekly_reset = self._get_week_start()
        self._monthly_reset = datetime.now().replace(day=1, hour=0, minute=0, second=0)
        
        # Recovery state
        self._in_recovery = False
        self._recovery_until: Optional[datetime] = None
        
        # History for analysis
        self._equity_history: List[tuple[datetime, Decimal]] = []
        self._max_history_size = 1000
    
    def _get_week_start(self) -> datetime:
        now = datetime.now()
        return (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0)
    
    def _check_period_resets(self):
        """Check and reset period-based trackers."""
        now = datetime.now()
        
        # Daily reset
        if now >= self._daily_reset + timedelta(days=1):
            self._daily_loss = Decimal("0")
            self._daily_start_equity = self._current_equity
            self._daily_reset = now.replace(hour=0, minute=0, second=0)
            logger.info("Daily loss tracker reset")
        
        # Weekly reset
        if now >= self._weekly_reset + timedelta(weeks=1):
            self._weekly_loss = Decimal("0")
            self._weekly_start_equity = self._current_equity
            self._weekly_reset = self._get_week_start()
            logger.info("Weekly loss tracker reset")
        
        # Monthly reset
        next_month = (self._monthly_reset.replace(day=28) + timedelta(days=4)).replace(day=1)
        if now >= next_month:
            self._monthly_loss = Decimal("0")
            self._monthly_start_equity = self._current_equity
            self._monthly_reset = now.replace(day=1, hour=0, minute=0, second=0)
            logger.info("Monthly loss tracker reset")
    
    def _calculate_drawdown(self) -> float:
        """Calculate current drawdown percentage."""
        if self._peak_equity <= 0:
            return 0.0
        return float((self._peak_equity - self._current_equity) / self._peak_equity)
    
    def _determine_level(self, drawdown_pct: float) -> DrawdownLevel:
        """Determine drawdown level based on current drawdown."""
        if drawdown_pct >= self.config.emergency_threshold:
            return DrawdownLevel.EMERGENCY
        elif drawdown_pct >= self.config.critical_threshold:
            return DrawdownLevel.CRITICAL
        elif drawdown_pct >= self.config.warning_threshold:
            return DrawdownLevel.WARNING
        elif drawdown_pct >= self.config.caution_threshold:
            return DrawdownLevel.CAUTION
        else:
            return DrawdownLevel.NORMAL
    
    def _check_loss_limits(self) -> tuple[bool, Optional[str]]:
        """
        Check if any loss limits are breached.
        
        Returns:
            (limits_ok, breach_reason)
        """
        # Calculate current losses
        daily_loss = self._daily_start_equity - self._current_equity
        weekly_loss = self._weekly_start_equity - self._current_equity
        monthly_loss = self._monthly_start_equity - self._current_equity
        
        # Update trackers
        self._daily_loss = max(Decimal("0"), daily_loss)
        self._weekly_loss = max(Decimal("0"), weekly_loss)
        self._monthly_loss = max(Decimal("0"), monthly_loss)
        
        # Check absolute limits
        if daily_loss >= self.config.daily_loss_limit:
            return False, f"Daily loss limit hit: ${daily_loss}"
        
        if weekly_loss >= self.config.weekly_loss_limit:
            return False, f"Weekly loss limit hit: ${weekly_loss}"
        
        if monthly_loss >= self.config.monthly_loss_limit:
            return False, f"Monthly loss limit hit: ${monthly_loss}"
        
        # Check percentage limits
        if self._peak_equity > 0:
            daily_pct = float(daily_loss / self._peak_equity)
            weekly_pct = float(weekly_loss / self._peak_equity)
            monthly_pct = float(monthly_loss / self._peak_equity)
            
            if daily_pct >= self.config.daily_loss_pct:
                return False, f"Daily loss {daily_pct:.1%} exceeds {self.config.daily_loss_pct:.0%}"
            
            if weekly_pct >= self.config.weekly_loss_pct:
                return False, f"Weekly loss {weekly_pct:.1%} exceeds {self.config.weekly_loss_pct:.0%}"
            
            if monthly_pct >= self.config.monthly_loss_pct:
                return False, f"Monthly loss {monthly_pct:.1%} exceeds {self.config.monthly_loss_pct:.0%}"
        
        return True, None
    
    async def update_equity(
        self,
        equity: Decimal,
        realized_pnl: Decimal = Decimal("0")
    ) -> DrawdownState:
        """
        Update with current equity and get protection state.
        
        Args:
            equity: Current account equity
            realized_pnl: Realized P&L since last update
        
        Returns:
            Current DrawdownState
        """
        self._check_period_resets()
        
        # Update equity
        self._current_equity = equity
        
        # Update peak (new high water mark)
        if equity > self._peak_equity:
            self._peak_equity = equity
            # Exit recovery mode on new peak
            if self._in_recovery:
                self._in_recovery = False
                self._recovery_until = None
                logger.info("Recovery complete - new peak equity")
        
        # Track history
        self._equity_history.append((datetime.now(), equity))
        if len(self._equity_history) > self._max_history_size:
            self._equity_history = self._equity_history[-self._max_history_size:]
        
        # Calculate drawdown
        drawdown_pct = self._calculate_drawdown()
        new_level = self._determine_level(drawdown_pct)
        
        # Check loss limits
        limits_ok, breach_reason = self._check_loss_limits()
        if not limits_ok:
            logger.warning(f"Loss limit breached: {breach_reason}")
            # Escalate to at least WARNING
            if new_level.value < DrawdownLevel.WARNING.value:
                new_level = DrawdownLevel.WARNING
        
        # Handle level change
        if new_level != self._current_level:
            old_level = self._current_level
            self._current_level = new_level
            
            logger.warning(
                f"Drawdown level changed: {old_level.value} -> {new_level.value} "
                f"(drawdown: {drawdown_pct:.2%})"
            )
            
            if self._on_level_change:
                await self._on_level_change(old_level, new_level)
            
            # Enter recovery mode after critical/emergency
            if new_level in (DrawdownLevel.CRITICAL, DrawdownLevel.EMERGENCY):
                self._in_recovery = True
                self._recovery_until = datetime.now() + timedelta(
                    hours=self.config.recovery_cooldown_hours
                )
        
        # Determine trading permissions
        trading_allowed = True
        new_positions_allowed = True
        sizing_multiplier = 1.0
        
        if new_level == DrawdownLevel.EMERGENCY:
            trading_allowed = False
            new_positions_allowed = False
            sizing_multiplier = 0.0
        elif new_level == DrawdownLevel.CRITICAL:
            new_positions_allowed = False
            sizing_multiplier = 0.25
        elif new_level == DrawdownLevel.WARNING:
            new_positions_allowed = False
            sizing_multiplier = 0.5
        elif new_level == DrawdownLevel.CAUTION:
            sizing_multiplier = 0.5
        
        # Apply recovery mode restrictions
        if self._in_recovery and self._recovery_until:
            if datetime.now() < self._recovery_until:
                sizing_multiplier *= self.config.reduced_sizing_pct
                new_positions_allowed = False
            else:
                self._in_recovery = False
                self._recovery_until = None
        
        return DrawdownState(
            level=new_level,
            current_drawdown_pct=drawdown_pct,
            peak_equity=self._peak_equity,
            current_equity=self._current_equity,
            daily_loss=self._daily_loss,
            weekly_loss=self._weekly_loss,
            monthly_loss=self._monthly_loss,
            trading_allowed=trading_allowed,
            new_positions_allowed=new_positions_allowed,
            sizing_multiplier=sizing_multiplier,
            in_recovery=self._in_recovery,
            recovery_until=self._recovery_until,
        )
    
    def get_liquidation_orders(
        self,
        positions: Dict[str, Dict[str, Any]],
        target_reduction_pct: float = 0.5,
    ) -> List[LiquidationOrder]:
        """
        Generate liquidation orders based on current drawdown level.
        
        Args:
            positions: Dict of symbol -> position data with keys:
                       qty, side, market_value, unrealized_pnl
            target_reduction_pct: How much to reduce (0.5 = 50%)
        
        Returns:
            List of LiquidationOrder objects
        """
        orders = []
        
        if self._current_level == DrawdownLevel.EMERGENCY:
            # Full liquidation
            target_reduction_pct = 1.0
        elif self._current_level == DrawdownLevel.CRITICAL:
            target_reduction_pct = 0.5
        elif self._current_level != DrawdownLevel.WARNING:
            # No liquidation needed
            return orders
        
        # Sort positions by unrealized P&L (losers first if configured)
        sorted_positions = sorted(
            positions.items(),
            key=lambda x: x[1].get("unrealized_pnl", Decimal("0")),
            reverse=not self.config.liquidate_losers_first
        )
        
        for symbol, pos in sorted_positions:
            qty = pos.get("qty", 0)
            side = pos.get("side", "long")
            unrealized_pnl = Decimal(str(pos.get("unrealized_pnl", 0)))
            
            if qty == 0:
                continue
            
            # Skip profitable positions if configured
            if self.config.preserve_winners and unrealized_pnl > 0:
                if self._current_level != DrawdownLevel.EMERGENCY:
                    continue
            
            # Calculate shares to liquidate
            shares_to_liquidate = int(qty * target_reduction_pct)
            if shares_to_liquidate == 0:
                shares_to_liquidate = qty  # At least close whole position
            
            # Determine close side
            close_side = "sell" if side == "long" else "buy"
            
            # Priority: losers first (lower priority number = higher urgency)
            priority = 0 if unrealized_pnl < 0 else 100
            
            orders.append(LiquidationOrder(
                symbol=symbol,
                side=close_side,
                qty=shares_to_liquidate,
                reason=f"Drawdown protection: {self._current_level.value}",
                priority=priority,
                unrealized_pnl=unrealized_pnl,
            ))
        
        # Sort by priority
        orders.sort(key=lambda x: x.priority)
        
        if orders and self._on_liquidation_required:
            asyncio.create_task(self._on_liquidation_required(orders))
        
        return orders
    
    def reset_peak(self, new_peak: Optional[Decimal] = None):
        """
        Reset peak equity (e.g., after capital injection).
        
        Args:
            new_peak: New peak equity, or current equity if None
        """
        self._peak_equity = new_peak or self._current_equity
        self._current_level = DrawdownLevel.NORMAL
        self._in_recovery = False
        self._recovery_until = None
        logger.info(f"Peak equity reset to ${self._peak_equity}")
    
    def get_drawdown_history(
        self,
        hours: int = 24
    ) -> List[Dict[str, Any]]:
        """Get drawdown history for analysis."""
        cutoff = datetime.now() - timedelta(hours=hours)
        
        history = []
        peak = Decimal("0")
        
        for ts, equity in self._equity_history:
            if ts < cutoff:
                continue
            
            peak = max(peak, equity)
            dd = float((peak - equity) / peak) if peak > 0 else 0
            
            history.append({
                "timestamp": ts.isoformat(),
                "equity": str(equity),
                "peak": str(peak),
                "drawdown_pct": dd,
            })
        
        return history
    
    def configure_for_account(self, account_equity: Decimal):
        """
        Auto-configure limits based on account size.
        
        Adjusts absolute dollar limits to be proportional to account.
        """
        # Scale limits to account size
        self.config.daily_loss_limit = account_equity * Decimal(str(self.config.daily_loss_pct))
        self.config.weekly_loss_limit = account_equity * Decimal(str(self.config.weekly_loss_pct))
        self.config.monthly_loss_limit = account_equity * Decimal(str(self.config.monthly_loss_pct))
        
        # Set peak
        self._peak_equity = account_equity
        self._current_equity = account_equity
        self._daily_start_equity = account_equity
        self._weekly_start_equity = account_equity
        self._monthly_start_equity = account_equity
        
        logger.info(
            f"Drawdown protector configured for ${account_equity} account: "
            f"Daily limit ${self.config.daily_loss_limit}, "
            f"Weekly limit ${self.config.weekly_loss_limit}"
        )


# Factory function with sensible defaults for small accounts
def create_conservative_protector(
    initial_equity: Decimal,
    **callbacks
) -> DrawdownProtector:
    """
    Create a conservative drawdown protector suitable for small accounts.
    
    Uses tighter limits to protect capital.
    """
    config = DrawdownConfig(
        # Tighter drawdown thresholds
        caution_threshold=0.03,      # 3%
        warning_threshold=0.05,      # 5%
        critical_threshold=0.08,     # 8%
        emergency_threshold=0.10,    # 10%
        
        # Aggressive loss limits for small accounts
        daily_loss_pct=0.03,         # 3% daily max
        weekly_loss_pct=0.07,        # 7% weekly max
        monthly_loss_pct=0.15,       # 15% monthly max
        
        # Quick recovery
        recovery_cooldown_hours=4,
        reduced_sizing_pct=0.25,     # 25% size during recovery
        
        # Always liquidate on emergency
        liquidate_on_emergency=True,
        liquidate_losers_first=True,
        preserve_winners=True,
    )
    
    protector = DrawdownProtector(
        config=config,
        initial_equity=initial_equity,
        **callbacks
    )
    
    protector.configure_for_account(initial_equity)
    
    return protector
