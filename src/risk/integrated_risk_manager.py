"""
Integrated Risk Manager - Unified Risk Management System

Combines all risk management components:
- Position sizing (Kelly criterion)
- Drawdown protection (auto-liquidation)
- Correlation limits (sector exposure)
- Real-time P&L tracking with alerts

This is the main interface for the trading system to interact with risk controls.
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Optional, Dict, List, Any, Callable, Awaitable

from .engine import RiskEngine, RiskLimits, RiskCheckResult, RiskAction
from .position_sizing import (
    PositionSizer, SizingMethod, TradeStats, PositionSizeResult
)
from .drawdown_protection import (
    DrawdownProtector, DrawdownConfig, DrawdownState, DrawdownLevel,
    LiquidationOrder, create_conservative_protector
)
from .correlation_limits import (
    CorrelationRiskManager, CorrelationLimits, ExposureCheckResult,
    PortfolioExposure, Sector
)
from .pnl_tracker import (
    PnLTracker, AlertConfig, PnLAlert, PortfolioPnL,
    create_small_account_tracker
)

logger = logging.getLogger(__name__)


@dataclass
class RiskManagerConfig:
    """Configuration for the integrated risk manager."""
    # Account settings
    account_equity: Decimal = Decimal("500")
    
    # Risk engine limits
    risk_limits: Optional[RiskLimits] = None
    
    # Position sizing
    sizing_method: SizingMethod = SizingMethod.HALF_KELLY
    max_position_pct: float = 0.10        # Max 10% per position
    max_risk_per_trade_pct: float = 0.02  # Max 2% risk per trade
    
    # Drawdown protection
    drawdown_config: Optional[DrawdownConfig] = None
    auto_liquidate: bool = True
    
    # Correlation limits
    correlation_limits: Optional[CorrelationLimits] = None
    
    # P&L tracking
    alert_config: Optional[AlertConfig] = None
    
    # Callbacks
    on_alert: Optional[Callable[[PnLAlert], Awaitable[None]]] = None
    on_liquidation: Optional[Callable[[List[LiquidationOrder]], Awaitable[None]]] = None
    on_drawdown_level_change: Optional[Callable[[DrawdownLevel, DrawdownLevel], Awaitable[None]]] = None


@dataclass
class TradeDecision:
    """Complete risk decision for a proposed trade."""
    # Overall decision
    approved: bool
    reason: str
    
    # Position sizing
    recommended_shares: int
    recommended_notional: Decimal
    kelly_fraction: float
    sizing_method: str
    
    # Risk checks
    risk_check: RiskCheckResult
    exposure_check: ExposureCheckResult
    
    # Current state
    drawdown_state: DrawdownState
    portfolio_pnl: PortfolioPnL
    
    # Warnings
    warnings: List[str]
    
    # Metadata
    timestamp: datetime = field(default_factory=datetime.now)
    
    def to_dict(self) -> Dict:
        return {
            "approved": self.approved,
            "reason": self.reason,
            "recommended_shares": self.recommended_shares,
            "recommended_notional": str(self.recommended_notional),
            "kelly_fraction": self.kelly_fraction,
            "sizing_method": self.sizing_method,
            "drawdown_level": self.drawdown_state.level.value,
            "trading_allowed": self.drawdown_state.trading_allowed,
            "sizing_multiplier": self.drawdown_state.sizing_multiplier,
            "warnings": self.warnings,
        }


class IntegratedRiskManager:
    """
    Unified risk management system for HFT trading.
    
    Integrates all risk controls into a single interface:
    
    1. Pre-trade checks (symbols, limits, exposure)
    2. Position sizing (Kelly criterion)
    3. Drawdown protection (auto-liquidation)
    4. Correlation/sector limits
    5. Real-time P&L tracking
    
    Usage:
        # Initialize
        manager = IntegratedRiskManager(config)
        
        # Check a proposed trade
        decision = await manager.evaluate_trade(
            symbol="NVDA",
            side="buy",
            entry_price=Decimal("500"),
            stop_loss=Decimal("490"),
        )
        
        if decision.approved:
            # Trade with decision.recommended_shares
            pass
        
        # Update with current state (call frequently)
        await manager.update_state(equity, positions)
        
        # Get liquidation orders if needed
        orders = manager.get_liquidation_orders()
    """
    
    def __init__(self, config: Optional[RiskManagerConfig] = None):
        self.config = config or RiskManagerConfig()
        
        # Initialize components
        self._init_risk_engine()
        self._init_position_sizer()
        self._init_drawdown_protector()
        self._init_correlation_manager()
        self._init_pnl_tracker()
        
        # State
        self._current_equity = self.config.account_equity
        self._current_positions: Dict[str, Dict] = {}
        self._trade_stats: Optional[TradeStats] = None
        
        # Trading state
        self._kill_switch_active = False
        
        logger.info(f"Integrated Risk Manager initialized for ${self.config.account_equity} account")
    
    def _init_risk_engine(self):
        """Initialize the core risk engine."""
        limits = self.config.risk_limits or RiskLimits(
            # Scale to account size
            max_order_notional=self.config.account_equity * Decimal("0.15"),
            max_position_notional=self.config.account_equity * Decimal("0.20"),
            max_total_exposure=self.config.account_equity,
            max_concentration_pct=Decimal("0.20"),
            max_daily_loss=self.config.account_equity * Decimal("0.05"),
            max_weekly_loss=self.config.account_equity * Decimal("0.10"),
            max_drawdown_pct=Decimal("0.10"),
            daily_spend_limit=self.config.account_equity * Decimal("0.50"),
            weekly_spend_limit=self.config.account_equity * Decimal("1.0"),
            monthly_spend_limit=self.config.account_equity * Decimal("2.0"),
            approval_notional_threshold=self.config.account_equity * Decimal("0.25"),
            approval_loss_threshold=self.config.account_equity * Decimal("0.03"),
        )
        
        self.risk_engine = RiskEngine(limits=limits)
    
    def _init_position_sizer(self):
        """Initialize position sizing calculator."""
        self.position_sizer = PositionSizer(
            account_equity=self.config.account_equity,
            max_position_pct=self.config.max_position_pct,
            max_total_risk_pct=self.config.max_risk_per_trade_pct,
            default_method=self.config.sizing_method,
        )
    
    def _init_drawdown_protector(self):
        """Initialize drawdown protection."""
        self.drawdown_protector = create_conservative_protector(
            initial_equity=self.config.account_equity,
            on_level_change=self.config.on_drawdown_level_change,
            on_liquidation_required=self.config.on_liquidation,
        )
    
    def _init_correlation_manager(self):
        """Initialize correlation/sector risk manager."""
        limits = self.config.correlation_limits or CorrelationLimits(
            max_sector_exposure_pct=0.30,
            max_correlation_group_pct=0.25,
            max_single_stock_pct=0.15,
        )
        
        self.correlation_manager = CorrelationRiskManager(limits=limits)
    
    def _init_pnl_tracker(self):
        """Initialize P&L tracker."""
        self.pnl_tracker = create_small_account_tracker(
            initial_equity=self.config.account_equity,
            on_alert=self.config.on_alert,
        )
    
    async def evaluate_trade(
        self,
        symbol: str,
        side: str,
        entry_price: Decimal,
        stop_loss: Optional[Decimal] = None,
        take_profit: Optional[Decimal] = None,
        order_type: str = "market",
        override_shares: Optional[int] = None,
    ) -> TradeDecision:
        """
        Evaluate a proposed trade through all risk checks.
        
        Args:
            symbol: Trading symbol
            side: "buy" or "sell"
            entry_price: Entry price
            stop_loss: Stop loss price (recommended for position sizing)
            take_profit: Take profit price (optional)
            order_type: Order type (market, limit, etc.)
            override_shares: Override calculated position size
        
        Returns:
            TradeDecision with approval status and recommendations
        """
        warnings = []
        
        # Get current drawdown state
        drawdown_state = await self.drawdown_protector.update_equity(
            self._current_equity
        )
        
        # Get current P&L
        portfolio_pnl = self.pnl_tracker.get_portfolio_pnl()
        
        # Check 1: Drawdown protection allows trading?
        if not drawdown_state.trading_allowed:
            return TradeDecision(
                approved=False,
                reason=f"Trading halted: drawdown level {drawdown_state.level.value}",
                recommended_shares=0,
                recommended_notional=Decimal("0"),
                kelly_fraction=0.0,
                sizing_method=self.config.sizing_method.value,
                risk_check=RiskCheckResult(
                    action=RiskAction.REJECT,
                    checks_passed=[],
                    checks_failed=["DRAWDOWN_PROTECTION"],
                    warnings=[],
                ),
                exposure_check=ExposureCheckResult(
                    allowed=False,
                    reason="Trading halted",
                    current_exposure={},
                    limit_headroom={},
                    warnings=[],
                ),
                drawdown_state=drawdown_state,
                portfolio_pnl=portfolio_pnl,
                warnings=["Trading halted by drawdown protection"],
            )
        
        # Check 2: New positions allowed?
        is_new_position = symbol not in self._current_positions
        if is_new_position and not drawdown_state.new_positions_allowed:
            return TradeDecision(
                approved=False,
                reason=f"New positions blocked: drawdown level {drawdown_state.level.value}",
                recommended_shares=0,
                recommended_notional=Decimal("0"),
                kelly_fraction=0.0,
                sizing_method=self.config.sizing_method.value,
                risk_check=RiskCheckResult(
                    action=RiskAction.REJECT,
                    checks_passed=[],
                    checks_failed=["NEW_POSITIONS_BLOCKED"],
                    warnings=[],
                ),
                exposure_check=ExposureCheckResult(
                    allowed=False,
                    reason="New positions blocked",
                    current_exposure={},
                    limit_headroom={},
                    warnings=[],
                ),
                drawdown_state=drawdown_state,
                portfolio_pnl=portfolio_pnl,
                warnings=["New positions blocked during drawdown recovery"],
            )
        
        # Check 3: Calculate position size
        size_result = self.position_sizer.calculate_position_size(
            symbol=symbol,
            entry_price=entry_price,
            stop_loss_price=stop_loss,
            stats=self._trade_stats,
            method=self.config.sizing_method,
        )
        warnings.extend(size_result.warnings)
        
        # Apply drawdown sizing multiplier
        adjusted_shares = int(size_result.shares * drawdown_state.sizing_multiplier)
        if adjusted_shares < size_result.shares:
            warnings.append(
                f"Position reduced by {1 - drawdown_state.sizing_multiplier:.0%} due to drawdown"
            )
        
        # Use override if provided
        if override_shares is not None:
            adjusted_shares = override_shares
            warnings.append(f"Using override shares: {override_shares}")
        
        # Ensure at least 1 share
        adjusted_shares = max(1, adjusted_shares)
        recommended_notional = entry_price * adjusted_shares
        
        # Check 4: Correlation/sector exposure
        exposure_check = self.correlation_manager.check_position(
            symbol=symbol,
            proposed_value=recommended_notional,
            current_positions=self._current_positions,
            account_equity=self._current_equity,
            is_new_position=is_new_position,
        )
        warnings.extend(exposure_check.warnings)
        
        if not exposure_check.allowed:
            # Try to find a smaller acceptable size
            max_allowed = self.correlation_manager.get_max_position_size(
                symbol=symbol,
                current_positions=self._current_positions,
                account_equity=self._current_equity,
            )
            
            if max_allowed > entry_price:
                adjusted_shares = int(max_allowed / entry_price)
                recommended_notional = entry_price * adjusted_shares
                warnings.append(f"Position reduced to ${recommended_notional} due to exposure limits")
                exposure_check = ExposureCheckResult(
                    allowed=True,
                    reason=None,
                    current_exposure=exposure_check.current_exposure,
                    limit_headroom=exposure_check.limit_headroom,
                    warnings=exposure_check.warnings + ["Position reduced to fit limits"],
                )
            else:
                return TradeDecision(
                    approved=False,
                    reason=exposure_check.reason or "Exposure limit exceeded",
                    recommended_shares=0,
                    recommended_notional=Decimal("0"),
                    kelly_fraction=size_result.kelly_fraction,
                    sizing_method=size_result.method_used.value,
                    risk_check=RiskCheckResult(
                        action=RiskAction.REJECT,
                        checks_passed=[],
                        checks_failed=["EXPOSURE_LIMIT"],
                        warnings=[],
                    ),
                    exposure_check=exposure_check,
                    drawdown_state=drawdown_state,
                    portfolio_pnl=portfolio_pnl,
                    warnings=warnings,
                )
        
        # Check 5: Core risk engine checks
        from .engine import Order as RiskOrder, Position
        
        # Build positions dict for risk engine
        positions = {}
        for sym, pos in self._current_positions.items():
            positions[sym] = Position(
                symbol=sym,
                qty=pos.get("qty", 0),
                avg_entry_price=Decimal(str(pos.get("avg_entry_price", 0))),
                current_price=Decimal(str(pos.get("current_price", 0))),
                market_value=Decimal(str(pos.get("market_value", 0))),
                unrealized_pnl=Decimal(str(pos.get("unrealized_pnl", 0))),
            )
        
        risk_order = RiskOrder(
            symbol=symbol,
            side=side,
            qty=adjusted_shares,
            order_type=order_type,
            limit_price=entry_price if order_type == "limit" else None,
        )
        
        risk_check = await self.risk_engine.check_order(
            order=risk_order,
            positions=positions,
            market_price=entry_price,
            account_equity=self._current_equity,
        )
        warnings.extend(risk_check.warnings)
        
        # Final decision
        approved = (
            risk_check.approved
            and exposure_check.allowed
            and drawdown_state.trading_allowed
        )
        
        if not approved and risk_check.checks_failed:
            reason = f"Risk check failed: {', '.join(risk_check.checks_failed)}"
        elif not approved:
            reason = "Trade not approved"
        else:
            reason = "Approved"
        
        return TradeDecision(
            approved=approved,
            reason=reason,
            recommended_shares=adjusted_shares,
            recommended_notional=recommended_notional,
            kelly_fraction=size_result.kelly_fraction,
            sizing_method=size_result.method_used.value,
            risk_check=risk_check,
            exposure_check=exposure_check,
            drawdown_state=drawdown_state,
            portfolio_pnl=portfolio_pnl,
            warnings=warnings,
        )
    
    async def update_state(
        self,
        equity: Decimal,
        positions: Dict[str, Dict],
        realized_pnl: Decimal = Decimal("0"),
    ):
        """
        Update risk manager with current portfolio state.
        
        Should be called frequently during market hours.
        
        Args:
            equity: Current account equity
            positions: Dict of symbol -> position data:
                       {qty, side, avg_entry_price, current_price, market_value, unrealized_pnl}
            realized_pnl: Realized P&L since last update
        """
        self._current_equity = equity
        self._current_positions = positions
        
        # Update position sizer
        self.position_sizer.update_account_equity(equity)
        
        # Update drawdown protector
        drawdown_state = await self.drawdown_protector.update_equity(
            equity, realized_pnl
        )
        
        # Update risk engine
        self.risk_engine.update_equity(equity, realized_pnl)
        
        # Update P&L tracker
        await self.pnl_tracker.update(equity, positions, realized_pnl)
        
        # Check if liquidation needed
        if drawdown_state.level in (DrawdownLevel.CRITICAL, DrawdownLevel.EMERGENCY):
            if self.config.auto_liquidate and positions:
                orders = self.get_liquidation_orders()
                if orders:
                    logger.warning(
                        f"Liquidation required: {len(orders)} positions "
                        f"due to {drawdown_state.level.value}"
                    )
    
    def get_liquidation_orders(self) -> List[LiquidationOrder]:
        """Get liquidation orders if drawdown protection triggered."""
        return self.drawdown_protector.get_liquidation_orders(
            self._current_positions
        )
    
    def activate_kill_switch(self, reason: str = "Manual"):
        """Activate kill switch - halt all trading."""
        self._kill_switch_active = True
        self.risk_engine.activate_kill_switch(reason)
        logger.critical(f"KILL SWITCH ACTIVATED: {reason}")
    
    def deactivate_kill_switch(self):
        """Deactivate kill switch - resume trading."""
        self._kill_switch_active = False
        self.risk_engine.deactivate_kill_switch()
        logger.warning("Kill switch deactivated")
    
    def get_status(self) -> Dict[str, Any]:
        """Get comprehensive risk status."""
        drawdown_state = DrawdownState(
            level=self.drawdown_protector._current_level,
            current_drawdown_pct=self.drawdown_protector._calculate_drawdown(),
            peak_equity=self.drawdown_protector._peak_equity,
            current_equity=self.drawdown_protector._current_equity,
            daily_loss=self.drawdown_protector._daily_loss,
            weekly_loss=self.drawdown_protector._weekly_loss,
            monthly_loss=self.drawdown_protector._monthly_loss,
            trading_allowed=not self._kill_switch_active and self.drawdown_protector._current_level != DrawdownLevel.EMERGENCY,
            new_positions_allowed=self.drawdown_protector._current_level in (DrawdownLevel.NORMAL, DrawdownLevel.CAUTION),
            sizing_multiplier=1.0 if self.drawdown_protector._current_level == DrawdownLevel.NORMAL else 0.5,
            in_recovery=self.drawdown_protector._in_recovery,
            recovery_until=self.drawdown_protector._recovery_until,
        )
        
        portfolio_pnl = self.pnl_tracker.get_portfolio_pnl()
        
        exposure = self.correlation_manager.calculate_exposure(
            self._current_positions,
            self._current_equity,
        )
        
        diversification = self.correlation_manager.get_diversification_score(
            self._current_positions,
            self._current_equity,
        )
        
        return {
            "account_equity": str(self._current_equity),
            "kill_switch": self._kill_switch_active,
            "drawdown": drawdown_state.to_dict(),
            "pnl": portfolio_pnl.to_dict(),
            "exposure": {
                "total_value": str(exposure.total_value),
                "position_count": len(self._current_positions),
                "top_sectors": [
                    (s.value, f"{pct:.1%}")
                    for s, pct in sorted(
                        exposure.sector_pct.items(),
                        key=lambda x: x[1],
                        reverse=True
                    )[:3]
                    if pct > 0
                ],
            },
            "diversification": diversification,
            "risk_engine": self.risk_engine.get_status(),
            "pending_alerts": len(self.pnl_tracker.get_alerts()),
        }
    
    def get_alerts(self) -> List[PnLAlert]:
        """Get all pending alerts."""
        return self.pnl_tracker.get_alerts()
    
    def acknowledge_alerts(self):
        """Acknowledge all pending alerts."""
        self.pnl_tracker.acknowledge_all_alerts()
    
    def update_trade_stats(self, stats: TradeStats):
        """Update trade statistics for Kelly calculation."""
        self._trade_stats = stats
    
    def set_sizing_method(self, method: SizingMethod):
        """Change the position sizing method."""
        self.config.sizing_method = method
        self.position_sizer.default_method = method


# Factory function
def create_risk_manager(
    account_equity: Decimal,
    on_alert: Optional[Callable[[PnLAlert], Awaitable[None]]] = None,
    on_liquidation: Optional[Callable[[List[LiquidationOrder]], Awaitable[None]]] = None,
    conservative: bool = True,
) -> IntegratedRiskManager:
    """
    Create a configured risk manager.
    
    Args:
        account_equity: Account equity
        on_alert: Callback for P&L alerts
        on_liquidation: Callback for liquidation orders
        conservative: Use conservative settings (recommended for small accounts)
    
    Returns:
        Configured IntegratedRiskManager
    """
    config = RiskManagerConfig(
        account_equity=account_equity,
        sizing_method=SizingMethod.QUARTER_KELLY if conservative else SizingMethod.HALF_KELLY,
        max_position_pct=0.10 if conservative else 0.15,
        max_risk_per_trade_pct=0.01 if conservative else 0.02,
        on_alert=on_alert,
        on_liquidation=on_liquidation,
    )
    
    return IntegratedRiskManager(config)
