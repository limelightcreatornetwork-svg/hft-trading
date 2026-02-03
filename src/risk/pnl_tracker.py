"""
Real-Time P&L Tracking with Alerts

Implements:
- Real-time P&L calculation and tracking
- Configurable alerts (thresholds, streaks, velocity)
- P&L history and analytics
- Position-level and portfolio-level tracking
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional, Dict, List, Callable, Any, Awaitable
from enum import Enum
from collections import deque
import json

logger = logging.getLogger(__name__)


class AlertType(Enum):
    """Types of P&L alerts."""
    DAILY_PROFIT_TARGET = "daily_profit_target"
    DAILY_LOSS_LIMIT = "daily_loss_limit"
    POSITION_PROFIT = "position_profit"
    POSITION_LOSS = "position_loss"
    LOSING_STREAK = "losing_streak"
    WINNING_STREAK = "winning_streak"
    PNL_VELOCITY = "pnl_velocity"  # Rapid P&L change
    DRAWDOWN_WARNING = "drawdown_warning"
    RECOVERY_MILESTONE = "recovery_milestone"
    NEW_HIGH = "new_high"
    BREAKEVEN = "breakeven"


class AlertPriority(Enum):
    """Alert priority levels."""
    LOW = 1
    MEDIUM = 2
    HIGH = 3
    CRITICAL = 4


@dataclass
class PnLAlert:
    """A P&L alert."""
    alert_type: AlertType
    priority: AlertPriority
    message: str
    value: Decimal
    threshold: Decimal
    symbol: Optional[str]  # None for portfolio-level
    timestamp: datetime = field(default_factory=datetime.now)
    acknowledged: bool = False
    
    def to_dict(self) -> Dict:
        return {
            "type": self.alert_type.value,
            "priority": self.priority.value,
            "message": self.message,
            "value": str(self.value),
            "threshold": str(self.threshold),
            "symbol": self.symbol,
            "timestamp": self.timestamp.isoformat(),
            "acknowledged": self.acknowledged,
        }


@dataclass
class AlertConfig:
    """Configuration for P&L alerts."""
    # Daily targets/limits (absolute)
    daily_profit_target: Decimal = Decimal("25")      # Alert on hitting $25 profit
    daily_loss_limit: Decimal = Decimal("25")         # Alert on $25 loss
    
    # Daily targets/limits (percentage of account)
    daily_profit_target_pct: float = 0.05             # 5% daily profit target
    daily_loss_limit_pct: float = 0.05                # 5% daily loss limit
    
    # Position-level alerts
    position_profit_pct: float = 0.10                 # Alert on 10% profit
    position_loss_pct: float = 0.05                   # Alert on 5% loss
    position_profit_abs: Decimal = Decimal("50")      # Alert on $50 profit
    position_loss_abs: Decimal = Decimal("25")        # Alert on $25 loss
    
    # Streak alerts
    losing_streak_threshold: int = 3                  # Alert after 3 consecutive losses
    winning_streak_threshold: int = 5                 # Alert after 5 consecutive wins
    
    # Velocity alerts (rapid changes)
    velocity_threshold_pct: float = 0.02              # 2% change in short period
    velocity_window_minutes: int = 5                  # Window for velocity calc
    
    # Drawdown alerts
    drawdown_warning_pct: float = 0.05                # Warn at 5% drawdown
    
    # Recovery milestones
    recovery_milestones: List[float] = field(default_factory=lambda: [0.25, 0.50, 0.75, 1.0])
    
    # Alert cooldowns (prevent spam)
    cooldown_minutes: int = 15                        # Min time between same alert type


@dataclass
class PositionPnL:
    """P&L tracking for a single position."""
    symbol: str
    qty: int
    side: str
    entry_price: Decimal
    current_price: Decimal
    unrealized_pnl: Decimal
    unrealized_pnl_pct: float
    realized_pnl: Decimal
    total_pnl: Decimal
    high_pnl: Decimal  # Best P&L reached
    low_pnl: Decimal   # Worst P&L reached
    entry_time: datetime
    last_update: datetime


@dataclass
class PortfolioPnL:
    """Portfolio-level P&L summary."""
    # Current state
    total_unrealized_pnl: Decimal
    total_realized_pnl: Decimal
    total_pnl: Decimal
    
    # Daily
    daily_realized_pnl: Decimal
    daily_unrealized_pnl: Decimal
    daily_total_pnl: Decimal
    
    # Peak/trough
    peak_equity: Decimal
    current_equity: Decimal
    drawdown: Decimal
    drawdown_pct: float
    
    # Statistics
    winning_trades: int
    losing_trades: int
    win_rate: float
    
    # Streaks
    current_streak: int  # Positive = wins, negative = losses
    best_winning_streak: int
    worst_losing_streak: int
    
    # Velocity
    pnl_velocity: Decimal  # P&L change per minute
    
    timestamp: datetime = field(default_factory=datetime.now)
    
    def to_dict(self) -> Dict:
        return {
            "total_unrealized_pnl": str(self.total_unrealized_pnl),
            "total_realized_pnl": str(self.total_realized_pnl),
            "total_pnl": str(self.total_pnl),
            "daily_total_pnl": str(self.daily_total_pnl),
            "drawdown_pct": f"{self.drawdown_pct:.2%}",
            "win_rate": f"{self.win_rate:.1%}",
            "current_streak": self.current_streak,
            "pnl_velocity": str(self.pnl_velocity),
        }


class PnLTracker:
    """
    Real-time P&L tracking and alerting system.
    
    Tracks:
    - Real-time unrealized P&L
    - Realized P&L from closed trades
    - Daily/weekly/monthly P&L
    - Position-level P&L
    - Win/loss streaks
    - P&L velocity (rate of change)
    
    Alerts on:
    - Profit targets and loss limits
    - Individual position thresholds
    - Losing/winning streaks
    - Rapid P&L changes
    - Drawdown warnings
    - Recovery milestones
    
    Usage:
        tracker = PnLTracker(config, initial_equity)
        
        # Update with current state
        await tracker.update(equity, positions, realized_pnl)
        
        # Get current P&L summary
        summary = tracker.get_portfolio_pnl()
        
        # Get pending alerts
        alerts = tracker.get_alerts()
    """
    
    def __init__(
        self,
        config: Optional[AlertConfig] = None,
        initial_equity: Decimal = Decimal("0"),
        on_alert: Optional[Callable[[PnLAlert], Awaitable[None]]] = None,
    ):
        self.config = config or AlertConfig()
        self._on_alert = on_alert
        
        # State
        self._current_equity = initial_equity
        self._peak_equity = initial_equity
        self._daily_start_equity = initial_equity
        
        # P&L tracking
        self._total_realized_pnl = Decimal("0")
        self._daily_realized_pnl = Decimal("0")
        self._position_pnl: Dict[str, PositionPnL] = {}
        
        # Trade tracking
        self._winning_trades = 0
        self._losing_trades = 0
        self._current_streak = 0
        self._best_winning_streak = 0
        self._worst_losing_streak = 0
        
        # Velocity tracking
        self._pnl_history: deque = deque(maxlen=100)
        
        # Alert tracking
        self._pending_alerts: List[PnLAlert] = []
        self._alert_cooldowns: Dict[str, datetime] = {}
        
        # Recovery tracking
        self._in_drawdown = False
        self._drawdown_low: Optional[Decimal] = None
        self._recovery_alerts_sent: Set[float] = set()
        
        # Timestamps
        self._daily_reset = datetime.now().replace(hour=0, minute=0, second=0)
        self._last_update = datetime.now()
    
    def _check_daily_reset(self):
        """Check and reset daily trackers."""
        now = datetime.now()
        if now >= self._daily_reset + timedelta(days=1):
            self._daily_realized_pnl = Decimal("0")
            self._daily_start_equity = self._current_equity
            self._daily_reset = now.replace(hour=0, minute=0, second=0)
            self._recovery_alerts_sent.clear()
            logger.info("Daily P&L tracker reset")
    
    def _can_send_alert(self, alert_type: AlertType, symbol: Optional[str] = None) -> bool:
        """Check if alert can be sent (cooldown check)."""
        key = f"{alert_type.value}:{symbol or 'portfolio'}"
        
        if key in self._alert_cooldowns:
            if datetime.now() < self._alert_cooldowns[key]:
                return False
        
        return True
    
    def _record_alert_sent(self, alert_type: AlertType, symbol: Optional[str] = None):
        """Record that an alert was sent."""
        key = f"{alert_type.value}:{symbol or 'portfolio'}"
        self._alert_cooldowns[key] = datetime.now() + timedelta(
            minutes=self.config.cooldown_minutes
        )
    
    async def _send_alert(self, alert: PnLAlert):
        """Send an alert."""
        if not self._can_send_alert(alert.alert_type, alert.symbol):
            return
        
        self._pending_alerts.append(alert)
        self._record_alert_sent(alert.alert_type, alert.symbol)
        
        logger.warning(f"P&L Alert [{alert.priority.name}]: {alert.message}")
        
        if self._on_alert:
            await self._on_alert(alert)
    
    async def update(
        self,
        equity: Decimal,
        positions: Dict[str, Dict],  # symbol -> {qty, side, entry_price, current_price, unrealized_pnl}
        realized_pnl: Decimal = Decimal("0"),  # New realized P&L since last update
    ):
        """
        Update P&L tracking with current state.
        
        Should be called frequently (every few seconds during market hours).
        """
        self._check_daily_reset()
        now = datetime.now()
        
        # Update equity
        prev_equity = self._current_equity
        self._current_equity = equity
        
        # Update peak
        if equity > self._peak_equity:
            self._peak_equity = equity
            
            # Check for new high alert
            if self._in_drawdown:
                self._in_drawdown = False
                await self._send_alert(PnLAlert(
                    alert_type=AlertType.NEW_HIGH,
                    priority=AlertPriority.MEDIUM,
                    message=f"New equity high: ${equity}",
                    value=equity,
                    threshold=self._peak_equity,
                    symbol=None,
                ))
        
        # Track P&L history for velocity calculation
        self._pnl_history.append({
            "timestamp": now,
            "equity": equity,
        })
        
        # Update realized P&L
        if realized_pnl != Decimal("0"):
            self._total_realized_pnl += realized_pnl
            self._daily_realized_pnl += realized_pnl
            
            # Update streaks
            if realized_pnl > 0:
                self._winning_trades += 1
                if self._current_streak >= 0:
                    self._current_streak += 1
                else:
                    self._current_streak = 1
                self._best_winning_streak = max(self._best_winning_streak, self._current_streak)
            else:
                self._losing_trades += 1
                if self._current_streak <= 0:
                    self._current_streak -= 1
                else:
                    self._current_streak = -1
                self._worst_losing_streak = min(self._worst_losing_streak, self._current_streak)
        
        # Update position P&L
        for symbol, pos in positions.items():
            await self._update_position_pnl(symbol, pos)
        
        # Remove closed positions
        closed = set(self._position_pnl.keys()) - set(positions.keys())
        for symbol in closed:
            del self._position_pnl[symbol]
        
        # Check alerts
        await self._check_portfolio_alerts()
        await self._check_streak_alerts()
        await self._check_velocity_alerts()
        await self._check_drawdown_alerts()
        await self._check_recovery_alerts()
        
        self._last_update = now
    
    async def _update_position_pnl(self, symbol: str, pos: Dict):
        """Update P&L for a single position."""
        unrealized_pnl = Decimal(str(pos.get("unrealized_pnl", 0)))
        entry_price = Decimal(str(pos.get("entry_price", pos.get("avg_entry_price", 0))))
        current_price = Decimal(str(pos.get("current_price", 0)))
        qty = int(pos.get("qty", 0))
        side = pos.get("side", "long")
        
        # Calculate P&L percentage
        if entry_price > 0:
            if side == "long":
                pnl_pct = float((current_price - entry_price) / entry_price)
            else:
                pnl_pct = float((entry_price - current_price) / entry_price)
        else:
            pnl_pct = 0.0
        
        if symbol in self._position_pnl:
            # Update existing
            pos_pnl = self._position_pnl[symbol]
            pos_pnl.current_price = current_price
            pos_pnl.unrealized_pnl = unrealized_pnl
            pos_pnl.unrealized_pnl_pct = pnl_pct
            pos_pnl.high_pnl = max(pos_pnl.high_pnl, unrealized_pnl)
            pos_pnl.low_pnl = min(pos_pnl.low_pnl, unrealized_pnl)
            pos_pnl.last_update = datetime.now()
        else:
            # New position
            self._position_pnl[symbol] = PositionPnL(
                symbol=symbol,
                qty=qty,
                side=side,
                entry_price=entry_price,
                current_price=current_price,
                unrealized_pnl=unrealized_pnl,
                unrealized_pnl_pct=pnl_pct,
                realized_pnl=Decimal("0"),
                total_pnl=unrealized_pnl,
                high_pnl=unrealized_pnl,
                low_pnl=unrealized_pnl,
                entry_time=datetime.now(),
                last_update=datetime.now(),
            )
        
        # Check position alerts
        await self._check_position_alerts(symbol)
    
    async def _check_portfolio_alerts(self):
        """Check for portfolio-level P&L alerts."""
        daily_pnl = self._current_equity - self._daily_start_equity
        
        # Daily profit target
        if daily_pnl >= self.config.daily_profit_target:
            await self._send_alert(PnLAlert(
                alert_type=AlertType.DAILY_PROFIT_TARGET,
                priority=AlertPriority.MEDIUM,
                message=f"🎯 Daily profit target hit: ${daily_pnl:.2f}",
                value=daily_pnl,
                threshold=self.config.daily_profit_target,
                symbol=None,
            ))
        
        # Check percentage target
        if self._daily_start_equity > 0:
            daily_pnl_pct = float(daily_pnl / self._daily_start_equity)
            
            if daily_pnl_pct >= self.config.daily_profit_target_pct:
                await self._send_alert(PnLAlert(
                    alert_type=AlertType.DAILY_PROFIT_TARGET,
                    priority=AlertPriority.MEDIUM,
                    message=f"🎯 Daily profit target hit: {daily_pnl_pct:.1%}",
                    value=daily_pnl,
                    threshold=Decimal(str(self.config.daily_profit_target_pct)),
                    symbol=None,
                ))
        
        # Daily loss limit
        if daily_pnl <= -self.config.daily_loss_limit:
            await self._send_alert(PnLAlert(
                alert_type=AlertType.DAILY_LOSS_LIMIT,
                priority=AlertPriority.HIGH,
                message=f"⚠️ Daily loss limit hit: ${abs(daily_pnl):.2f}",
                value=daily_pnl,
                threshold=self.config.daily_loss_limit,
                symbol=None,
            ))
    
    async def _check_position_alerts(self, symbol: str):
        """Check for position-level alerts."""
        if symbol not in self._position_pnl:
            return
        
        pos = self._position_pnl[symbol]
        
        # Position profit alert (percentage)
        if pos.unrealized_pnl_pct >= self.config.position_profit_pct:
            await self._send_alert(PnLAlert(
                alert_type=AlertType.POSITION_PROFIT,
                priority=AlertPriority.LOW,
                message=f"📈 {symbol} up {pos.unrealized_pnl_pct:.1%} (${pos.unrealized_pnl:.2f})",
                value=pos.unrealized_pnl,
                threshold=Decimal(str(self.config.position_profit_pct)),
                symbol=symbol,
            ))
        
        # Position profit alert (absolute)
        if pos.unrealized_pnl >= self.config.position_profit_abs:
            await self._send_alert(PnLAlert(
                alert_type=AlertType.POSITION_PROFIT,
                priority=AlertPriority.LOW,
                message=f"📈 {symbol} profit: ${pos.unrealized_pnl:.2f}",
                value=pos.unrealized_pnl,
                threshold=self.config.position_profit_abs,
                symbol=symbol,
            ))
        
        # Position loss alert (percentage)
        if pos.unrealized_pnl_pct <= -self.config.position_loss_pct:
            await self._send_alert(PnLAlert(
                alert_type=AlertType.POSITION_LOSS,
                priority=AlertPriority.MEDIUM,
                message=f"📉 {symbol} down {abs(pos.unrealized_pnl_pct):.1%} (${abs(pos.unrealized_pnl):.2f})",
                value=pos.unrealized_pnl,
                threshold=Decimal(str(self.config.position_loss_pct)),
                symbol=symbol,
            ))
        
        # Position loss alert (absolute)
        if pos.unrealized_pnl <= -self.config.position_loss_abs:
            await self._send_alert(PnLAlert(
                alert_type=AlertType.POSITION_LOSS,
                priority=AlertPriority.MEDIUM,
                message=f"📉 {symbol} loss: ${abs(pos.unrealized_pnl):.2f}",
                value=pos.unrealized_pnl,
                threshold=self.config.position_loss_abs,
                symbol=symbol,
            ))
    
    async def _check_streak_alerts(self):
        """Check for streak alerts."""
        if self._current_streak <= -self.config.losing_streak_threshold:
            await self._send_alert(PnLAlert(
                alert_type=AlertType.LOSING_STREAK,
                priority=AlertPriority.HIGH,
                message=f"🔥 Losing streak: {abs(self._current_streak)} trades in a row",
                value=Decimal(str(self._current_streak)),
                threshold=Decimal(str(self.config.losing_streak_threshold)),
                symbol=None,
            ))
        
        if self._current_streak >= self.config.winning_streak_threshold:
            await self._send_alert(PnLAlert(
                alert_type=AlertType.WINNING_STREAK,
                priority=AlertPriority.LOW,
                message=f"🔥 Winning streak: {self._current_streak} trades in a row!",
                value=Decimal(str(self._current_streak)),
                threshold=Decimal(str(self.config.winning_streak_threshold)),
                symbol=None,
            ))
    
    async def _check_velocity_alerts(self):
        """Check for rapid P&L change alerts."""
        if len(self._pnl_history) < 2:
            return
        
        # Get data from window
        cutoff = datetime.now() - timedelta(minutes=self.config.velocity_window_minutes)
        window_data = [
            d for d in self._pnl_history
            if d["timestamp"] >= cutoff
        ]
        
        if len(window_data) < 2:
            return
        
        # Calculate velocity
        start_equity = window_data[0]["equity"]
        end_equity = window_data[-1]["equity"]
        
        if start_equity > 0:
            change_pct = abs(float((end_equity - start_equity) / start_equity))
            
            if change_pct >= self.config.velocity_threshold_pct:
                direction = "📈 up" if end_equity > start_equity else "📉 down"
                await self._send_alert(PnLAlert(
                    alert_type=AlertType.PNL_VELOCITY,
                    priority=AlertPriority.MEDIUM,
                    message=f"Rapid P&L change: {direction} {change_pct:.1%} in {self.config.velocity_window_minutes} min",
                    value=end_equity - start_equity,
                    threshold=Decimal(str(self.config.velocity_threshold_pct)),
                    symbol=None,
                ))
    
    async def _check_drawdown_alerts(self):
        """Check for drawdown alerts."""
        if self._peak_equity <= 0:
            return
        
        drawdown_pct = float((self._peak_equity - self._current_equity) / self._peak_equity)
        
        if drawdown_pct >= self.config.drawdown_warning_pct:
            if not self._in_drawdown:
                self._in_drawdown = True
                self._drawdown_low = self._current_equity
            
            await self._send_alert(PnLAlert(
                alert_type=AlertType.DRAWDOWN_WARNING,
                priority=AlertPriority.HIGH,
                message=f"⚠️ Drawdown warning: {drawdown_pct:.1%} from peak",
                value=self._peak_equity - self._current_equity,
                threshold=Decimal(str(self.config.drawdown_warning_pct)),
                symbol=None,
            ))
            
            # Track lowest point
            if self._current_equity < self._drawdown_low:
                self._drawdown_low = self._current_equity
    
    async def _check_recovery_alerts(self):
        """Check for recovery milestone alerts."""
        if not self._in_drawdown or self._drawdown_low is None:
            return
        
        # Calculate recovery percentage
        drawdown_depth = self._peak_equity - self._drawdown_low
        if drawdown_depth <= 0:
            return
        
        recovery = self._current_equity - self._drawdown_low
        recovery_pct = float(recovery / drawdown_depth)
        
        # Check milestones
        for milestone in self.config.recovery_milestones:
            if milestone not in self._recovery_alerts_sent and recovery_pct >= milestone:
                self._recovery_alerts_sent.add(milestone)
                
                if milestone == 1.0:
                    await self._send_alert(PnLAlert(
                        alert_type=AlertType.BREAKEVEN,
                        priority=AlertPriority.MEDIUM,
                        message="✅ Back to breakeven from drawdown!",
                        value=recovery,
                        threshold=drawdown_depth,
                        symbol=None,
                    ))
                else:
                    await self._send_alert(PnLAlert(
                        alert_type=AlertType.RECOVERY_MILESTONE,
                        priority=AlertPriority.LOW,
                        message=f"↗️ Recovery: {milestone:.0%} of drawdown recovered",
                        value=recovery,
                        threshold=Decimal(str(milestone)),
                        symbol=None,
                    ))
    
    def get_portfolio_pnl(self) -> PortfolioPnL:
        """Get current portfolio P&L summary."""
        total_trades = self._winning_trades + self._losing_trades
        win_rate = self._winning_trades / total_trades if total_trades > 0 else 0.0
        
        # Calculate total unrealized
        total_unrealized = sum(
            pos.unrealized_pnl for pos in self._position_pnl.values()
        )
        
        # Calculate drawdown
        drawdown = self._peak_equity - self._current_equity
        drawdown_pct = float(drawdown / self._peak_equity) if self._peak_equity > 0 else 0.0
        
        # Calculate velocity
        pnl_velocity = Decimal("0")
        if len(self._pnl_history) >= 2:
            time_diff = (self._pnl_history[-1]["timestamp"] - self._pnl_history[0]["timestamp"]).total_seconds() / 60
            if time_diff > 0:
                equity_diff = self._pnl_history[-1]["equity"] - self._pnl_history[0]["equity"]
                pnl_velocity = equity_diff / Decimal(str(time_diff))
        
        daily_total = self._current_equity - self._daily_start_equity
        
        return PortfolioPnL(
            total_unrealized_pnl=total_unrealized,
            total_realized_pnl=self._total_realized_pnl,
            total_pnl=total_unrealized + self._total_realized_pnl,
            daily_realized_pnl=self._daily_realized_pnl,
            daily_unrealized_pnl=total_unrealized,
            daily_total_pnl=daily_total,
            peak_equity=self._peak_equity,
            current_equity=self._current_equity,
            drawdown=drawdown,
            drawdown_pct=drawdown_pct,
            winning_trades=self._winning_trades,
            losing_trades=self._losing_trades,
            win_rate=win_rate,
            current_streak=self._current_streak,
            best_winning_streak=self._best_winning_streak,
            worst_losing_streak=self._worst_losing_streak,
            pnl_velocity=pnl_velocity,
        )
    
    def get_position_pnl(self, symbol: str) -> Optional[PositionPnL]:
        """Get P&L for a specific position."""
        return self._position_pnl.get(symbol)
    
    def get_all_position_pnl(self) -> Dict[str, PositionPnL]:
        """Get P&L for all positions."""
        return self._position_pnl.copy()
    
    def get_alerts(self, unacknowledged_only: bool = True) -> List[PnLAlert]:
        """Get pending alerts."""
        if unacknowledged_only:
            return [a for a in self._pending_alerts if not a.acknowledged]
        return self._pending_alerts.copy()
    
    def acknowledge_alert(self, index: int):
        """Acknowledge an alert by index."""
        if 0 <= index < len(self._pending_alerts):
            self._pending_alerts[index].acknowledged = True
    
    def acknowledge_all_alerts(self):
        """Acknowledge all pending alerts."""
        for alert in self._pending_alerts:
            alert.acknowledged = True
    
    def clear_acknowledged_alerts(self):
        """Remove all acknowledged alerts."""
        self._pending_alerts = [a for a in self._pending_alerts if not a.acknowledged]
    
    def record_trade(self, realized_pnl: Decimal):
        """
        Record a completed trade for streak tracking.
        
        Call this when a position is closed.
        """
        self._total_realized_pnl += realized_pnl
        self._daily_realized_pnl += realized_pnl
        
        if realized_pnl > 0:
            self._winning_trades += 1
            if self._current_streak >= 0:
                self._current_streak += 1
            else:
                self._current_streak = 1
            self._best_winning_streak = max(self._best_winning_streak, self._current_streak)
        elif realized_pnl < 0:
            self._losing_trades += 1
            if self._current_streak <= 0:
                self._current_streak -= 1
            else:
                self._current_streak = -1
            self._worst_losing_streak = min(self._worst_losing_streak, self._current_streak)
    
    def reset_daily(self):
        """Force reset of daily tracking."""
        self._daily_realized_pnl = Decimal("0")
        self._daily_start_equity = self._current_equity
        self._daily_reset = datetime.now().replace(hour=0, minute=0, second=0)
        self._recovery_alerts_sent.clear()
    
    def set_initial_equity(self, equity: Decimal):
        """Set initial equity (for startup)."""
        self._current_equity = equity
        self._peak_equity = equity
        self._daily_start_equity = equity


# Factory function for small accounts
def create_small_account_tracker(
    initial_equity: Decimal,
    on_alert: Optional[Callable[[PnLAlert], Awaitable[None]]] = None,
) -> PnLTracker:
    """
    Create a P&L tracker configured for small accounts.
    
    Uses tighter thresholds appropriate for accounts under $1000.
    """
    config = AlertConfig(
        # Tighter daily limits for small account
        daily_profit_target=initial_equity * Decimal("0.03"),  # 3% profit
        daily_loss_limit=initial_equity * Decimal("0.03"),     # 3% loss
        daily_profit_target_pct=0.03,
        daily_loss_limit_pct=0.03,
        
        # Position alerts
        position_profit_pct=0.05,   # 5% profit
        position_loss_pct=0.03,     # 3% loss
        position_profit_abs=Decimal("15"),
        position_loss_abs=Decimal("10"),
        
        # Streak alerts
        losing_streak_threshold=2,   # Alert after 2 losses
        winning_streak_threshold=3,  # Alert after 3 wins
        
        # Velocity
        velocity_threshold_pct=0.015,  # 1.5% rapid change
        velocity_window_minutes=3,
        
        # Drawdown
        drawdown_warning_pct=0.03,    # 3% drawdown warning
        
        # Faster cooldown
        cooldown_minutes=10,
    )
    
    return PnLTracker(
        config=config,
        initial_equity=initial_equity,
        on_alert=on_alert,
    )
