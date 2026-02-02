"""
Kalshi-Specific Risk Controls

Implements:
- Compliance kill switch by category/jurisdiction
- Position limits per market
- Fee-aware exposure calculations
- Market filtering
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional, Dict, List, Set, Any

logger = logging.getLogger(__name__)


class MarketCategory(Enum):
    """Kalshi market categories."""
    POLITICS = "politics"
    ECONOMICS = "economics"
    FINANCE = "finance"
    CRYPTO = "crypto"
    WEATHER = "weather"
    ENTERTAINMENT = "entertainment"
    SPORTS = "sports"
    SCIENCE = "science"
    OTHER = "other"


@dataclass
class ComplianceConfig:
    """Compliance configuration for trading restrictions."""
    # Category restrictions
    blocked_categories: Set[MarketCategory] = field(default_factory=set)
    allowed_categories: Optional[Set[MarketCategory]] = None  # None = all allowed
    
    # Specific market restrictions
    blocked_tickers: Set[str] = field(default_factory=set)
    
    # Jurisdiction
    jurisdiction: str = "US"  # User's jurisdiction
    
    # Category-specific limits (overrides global)
    category_limits: Dict[MarketCategory, Decimal] = field(default_factory=dict)
    
    # Time-based restrictions
    trading_hours_only: bool = False  # Only trade during market hours
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "blocked_categories": [c.value for c in self.blocked_categories],
            "allowed_categories": [c.value for c in self.allowed_categories] if self.allowed_categories else None,
            "blocked_tickers": list(self.blocked_tickers),
            "jurisdiction": self.jurisdiction,
            "category_limits": {c.value: str(v) for c, v in self.category_limits.items()},
            "trading_hours_only": self.trading_hours_only,
        }


@dataclass
class KalshiRiskLimits:
    """Risk limits specific to Kalshi prediction markets."""
    # Account-level limits
    max_total_notional: Decimal = Decimal("10000")  # Total exposure
    max_daily_loss: Decimal = Decimal("500")
    max_drawdown_pct: Decimal = Decimal("0.10")
    
    # Per-market limits
    max_position_per_market: Decimal = Decimal("2000")  # Kalshi max is $25k
    max_contracts_per_market: int = 2000
    
    # Per-order limits
    max_order_notional: Decimal = Decimal("500")
    max_order_contracts: int = 500
    
    # Spread/liquidity limits
    max_spread_pct: Decimal = Decimal("0.15")  # 15%
    min_orderbook_depth: int = 100  # Min contracts at best bid/ask
    
    # Portfolio limits
    max_open_positions: int = 20
    max_category_exposure_pct: Decimal = Decimal("0.40")  # 40% in any category
    
    # Human approval thresholds
    approval_threshold: Decimal = Decimal("1000")
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "max_total_notional": str(self.max_total_notional),
            "max_daily_loss": str(self.max_daily_loss),
            "max_drawdown_pct": str(self.max_drawdown_pct),
            "max_position_per_market": str(self.max_position_per_market),
            "max_contracts_per_market": self.max_contracts_per_market,
            "max_order_notional": str(self.max_order_notional),
            "max_order_contracts": self.max_order_contracts,
            "max_spread_pct": str(self.max_spread_pct),
            "min_orderbook_depth": self.min_orderbook_depth,
            "max_open_positions": self.max_open_positions,
            "max_category_exposure_pct": str(self.max_category_exposure_pct),
            "approval_threshold": str(self.approval_threshold),
        }


@dataclass
class KalshiOrder:
    """Kalshi order for risk checking."""
    ticker: str
    side: str  # "yes" or "no"
    action: str  # "buy" or "sell"
    count: int
    price: int  # 1-99 cents
    category: MarketCategory = MarketCategory.OTHER
    
    @property
    def notional_cents(self) -> int:
        """Order value in cents."""
        if self.side == "yes":
            return self.count * self.price
        else:
            return self.count * (100 - self.price)
    
    @property
    def notional_dollars(self) -> Decimal:
        """Order value in dollars."""
        return Decimal(self.notional_cents) / 100


@dataclass
class KalshiPosition:
    """Kalshi position for risk checking."""
    ticker: str
    side: str
    count: int
    avg_price: int
    market_price: int
    category: MarketCategory = MarketCategory.OTHER
    
    @property
    def market_value_cents(self) -> int:
        """Current market value in cents."""
        if self.side == "yes":
            return self.count * self.market_price
        else:
            return self.count * (100 - self.market_price)
    
    @property
    def market_value_dollars(self) -> Decimal:
        """Current market value in dollars."""
        return Decimal(self.market_value_cents) / 100
    
    @property
    def unrealized_pnl_cents(self) -> int:
        """Unrealized P&L in cents (excluding fees)."""
        if self.side == "yes":
            return self.count * (self.market_price - self.avg_price)
        else:
            return self.count * (self.avg_price - self.market_price)


@dataclass
class RiskCheckResult:
    """Result of a Kalshi risk check."""
    approved: bool
    reason: str
    checks_passed: List[str]
    checks_failed: List[str]
    warnings: List[str]
    requires_approval: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)


class KalshiRiskController:
    """
    Kalshi-specific risk controller.
    
    Handles:
    - Compliance filtering (category/jurisdiction)
    - Position limits per market
    - Spread/liquidity checks
    - Fee-aware exposure calculations
    
    Usage:
        controller = KalshiRiskController(limits, compliance)
        
        # Check order
        result = controller.check_order(order, positions, account_balance)
        
        if result.approved:
            # Submit order
        elif result.requires_approval:
            # Queue for human approval
        else:
            # Reject with result.reason
    """
    
    def __init__(
        self,
        limits: Optional[KalshiRiskLimits] = None,
        compliance: Optional[ComplianceConfig] = None,
    ):
        self.limits = limits or KalshiRiskLimits()
        self.compliance = compliance or ComplianceConfig()
        
        # State
        self.kill_switch_active = False
        self.kill_switch_reason: Optional[str] = None
        self.kill_switch_time: Optional[datetime] = None
        
        # Tracking
        self.daily_pnl = Decimal("0")
        self.peak_balance = Decimal("0")
        self.daily_pnl_reset = datetime.now().replace(hour=0, minute=0, second=0)
    
    def _reset_daily_if_needed(self):
        """Reset daily tracking if new day."""
        now = datetime.now()
        if now.date() > self.daily_pnl_reset.date():
            self.daily_pnl = Decimal("0")
            self.daily_pnl_reset = now.replace(hour=0, minute=0, second=0)
    
    def check_compliance(self, order: KalshiOrder) -> RiskCheckResult:
        """Check order against compliance rules."""
        passed = []
        failed = []
        warnings = []
        
        # Check blocked categories
        if order.category in self.compliance.blocked_categories:
            failed.append(f"BLOCKED_CATEGORY: {order.category.value}")
        else:
            passed.append("category_allowed")
        
        # Check allowed categories (if whitelist mode)
        if self.compliance.allowed_categories:
            if order.category not in self.compliance.allowed_categories:
                failed.append(f"CATEGORY_NOT_IN_ALLOWLIST: {order.category.value}")
            else:
                passed.append("category_in_allowlist")
        
        # Check blocked tickers
        if order.ticker in self.compliance.blocked_tickers:
            failed.append(f"BLOCKED_TICKER: {order.ticker}")
        else:
            passed.append("ticker_allowed")
        
        if failed:
            return RiskCheckResult(
                approved=False,
                reason="; ".join(failed),
                checks_passed=passed,
                checks_failed=failed,
                warnings=warnings,
            )
        
        return RiskCheckResult(
            approved=True,
            reason="Compliance checks passed",
            checks_passed=passed,
            checks_failed=failed,
            warnings=warnings,
        )
    
    def check_order(
        self,
        order: KalshiOrder,
        positions: Dict[str, KalshiPosition],
        account_balance: Decimal,
        orderbook: Optional[Dict] = None,
    ) -> RiskCheckResult:
        """
        Run all risk checks on an order.
        
        Args:
            order: The order to check
            positions: Current positions by ticker
            account_balance: Available balance
            orderbook: Optional orderbook for spread/depth checks
        
        Returns:
            RiskCheckResult with approval status and details
        """
        self._reset_daily_if_needed()
        
        passed = []
        failed = []
        warnings = []
        requires_approval = False
        
        # Kill switch check
        if self.kill_switch_active:
            return RiskCheckResult(
                approved=False,
                reason=f"Kill switch active: {self.kill_switch_reason}",
                checks_passed=[],
                checks_failed=["KILL_SWITCH_ACTIVE"],
                warnings=[],
            )
        
        # Compliance checks
        compliance_result = self.check_compliance(order)
        passed.extend(compliance_result.checks_passed)
        failed.extend(compliance_result.checks_failed)
        warnings.extend(compliance_result.warnings)
        
        if compliance_result.checks_failed:
            return RiskCheckResult(
                approved=False,
                reason=compliance_result.reason,
                checks_passed=passed,
                checks_failed=failed,
                warnings=warnings,
            )
        
        # Order size checks
        if order.count > self.limits.max_order_contracts:
            failed.append(f"ORDER_CONTRACTS_EXCEEDED: {order.count} > {self.limits.max_order_contracts}")
        else:
            passed.append("order_contracts_ok")
        
        if order.notional_dollars > self.limits.max_order_notional:
            failed.append(f"ORDER_NOTIONAL_EXCEEDED: ${order.notional_dollars} > ${self.limits.max_order_notional}")
        else:
            passed.append("order_notional_ok")
        
        # Position limit checks
        current_position = positions.get(order.ticker)
        current_count = current_position.count if current_position else 0
        new_count = current_count + order.count if order.action == "buy" else current_count - order.count
        
        if abs(new_count) > self.limits.max_contracts_per_market:
            failed.append(f"POSITION_CONTRACTS_EXCEEDED: {abs(new_count)} > {self.limits.max_contracts_per_market}")
        else:
            passed.append("position_contracts_ok")
        
        new_position_value = Decimal(abs(new_count) * order.price) / 100
        if new_position_value > self.limits.max_position_per_market:
            failed.append(f"POSITION_NOTIONAL_EXCEEDED: ${new_position_value} > ${self.limits.max_position_per_market}")
        else:
            passed.append("position_notional_ok")
        
        # Total exposure check
        total_exposure = sum(p.market_value_dollars for p in positions.values())
        if order.action == "buy":
            total_exposure += order.notional_dollars
        
        if total_exposure > self.limits.max_total_notional:
            failed.append(f"TOTAL_EXPOSURE_EXCEEDED: ${total_exposure} > ${self.limits.max_total_notional}")
        else:
            passed.append("total_exposure_ok")
        
        # Open positions check
        position_count = len(positions)
        if order.ticker not in positions and order.action == "buy":
            position_count += 1
        
        if position_count > self.limits.max_open_positions:
            failed.append(f"TOO_MANY_POSITIONS: {position_count} > {self.limits.max_open_positions}")
        else:
            passed.append("position_count_ok")
        
        # Category concentration check
        category_exposure = Decimal("0")
        for ticker, pos in positions.items():
            if pos.category == order.category:
                category_exposure += pos.market_value_dollars
        
        if order.action == "buy":
            category_exposure += order.notional_dollars
        
        if total_exposure > 0:
            concentration = category_exposure / total_exposure
            if concentration > self.limits.max_category_exposure_pct:
                warnings.append(f"HIGH_CATEGORY_CONCENTRATION: {concentration:.1%} in {order.category.value}")
        
        # Daily loss check
        if self.daily_pnl < -self.limits.max_daily_loss:
            failed.append(f"DAILY_LOSS_LIMIT: ${abs(self.daily_pnl)} > ${self.limits.max_daily_loss}")
        else:
            passed.append("daily_loss_ok")
        
        # Drawdown check
        if self.peak_balance > 0:
            drawdown = (self.peak_balance - account_balance) / self.peak_balance
            if drawdown > self.limits.max_drawdown_pct:
                failed.append(f"DRAWDOWN_LIMIT: {drawdown:.1%} > {self.limits.max_drawdown_pct:.0%}")
            else:
                passed.append("drawdown_ok")
        
        # Orderbook checks (if provided)
        if orderbook:
            # Spread check
            best_bid = orderbook.get("yes", [[0, 0]])[0][0] if orderbook.get("yes") else 0
            best_ask = 100 - (orderbook.get("no", [[0, 0]])[0][0] if orderbook.get("no") else 0)
            
            if best_ask > best_bid:
                spread_pct = Decimal(best_ask - best_bid) / Decimal(best_ask + best_bid) * 2
                if spread_pct > self.limits.max_spread_pct:
                    warnings.append(f"WIDE_SPREAD: {spread_pct:.1%}")
            
            # Depth check
            bid_depth = orderbook.get("yes", [[0, 0]])[0][1] if orderbook.get("yes") else 0
            ask_depth = orderbook.get("no", [[0, 0]])[0][1] if orderbook.get("no") else 0
            
            if min(bid_depth, ask_depth) < self.limits.min_orderbook_depth:
                warnings.append(f"LOW_LIQUIDITY: depth={min(bid_depth, ask_depth)}")
        
        # Human approval check
        if order.notional_dollars > self.limits.approval_threshold:
            requires_approval = True
            warnings.append(f"REQUIRES_APPROVAL: order > ${self.limits.approval_threshold}")
        
        if abs(self.daily_pnl) > self.limits.max_daily_loss * Decimal("0.5"):
            requires_approval = True
            warnings.append("REQUIRES_APPROVAL: significant daily loss")
        
        # Final decision
        if failed:
            return RiskCheckResult(
                approved=False,
                reason="; ".join(failed),
                checks_passed=passed,
                checks_failed=failed,
                warnings=warnings,
                requires_approval=requires_approval,
                metadata={
                    "order_notional": str(order.notional_dollars),
                    "total_exposure": str(total_exposure),
                    "daily_pnl": str(self.daily_pnl),
                },
            )
        
        return RiskCheckResult(
            approved=True,
            reason="All checks passed",
            checks_passed=passed,
            checks_failed=failed,
            warnings=warnings,
            requires_approval=requires_approval,
            metadata={
                "order_notional": str(order.notional_dollars),
                "total_exposure": str(total_exposure),
                "daily_pnl": str(self.daily_pnl),
            },
        )
    
    def record_fill(self, notional: Decimal, pnl: Decimal = Decimal("0")):
        """Record a fill for tracking."""
        self.daily_pnl += pnl
    
    def update_balance(self, balance: Decimal):
        """Update peak balance tracking."""
        if balance > self.peak_balance:
            self.peak_balance = balance
    
    def activate_kill_switch(self, reason: str):
        """Activate the kill switch."""
        self.kill_switch_active = True
        self.kill_switch_reason = reason
        self.kill_switch_time = datetime.now()
        logger.critical(f"KILL SWITCH ACTIVATED: {reason}")
    
    def deactivate_kill_switch(self):
        """Deactivate the kill switch."""
        self.kill_switch_active = False
        self.kill_switch_reason = None
        self.kill_switch_time = None
        logger.warning("Kill switch deactivated")
    
    def block_category(self, category: MarketCategory):
        """Block a category from trading."""
        self.compliance.blocked_categories.add(category)
        logger.info(f"Blocked category: {category.value}")
    
    def unblock_category(self, category: MarketCategory):
        """Unblock a category."""
        self.compliance.blocked_categories.discard(category)
        logger.info(f"Unblocked category: {category.value}")
    
    def block_ticker(self, ticker: str):
        """Block a specific ticker."""
        self.compliance.blocked_tickers.add(ticker)
        logger.info(f"Blocked ticker: {ticker}")
    
    def unblock_ticker(self, ticker: str):
        """Unblock a ticker."""
        self.compliance.blocked_tickers.discard(ticker)
        logger.info(f"Unblocked ticker: {ticker}")
    
    def get_status(self) -> Dict[str, Any]:
        """Get current risk controller status."""
        return {
            "kill_switch_active": self.kill_switch_active,
            "kill_switch_reason": self.kill_switch_reason,
            "kill_switch_time": self.kill_switch_time.isoformat() if self.kill_switch_time else None,
            "daily_pnl": str(self.daily_pnl),
            "peak_balance": str(self.peak_balance),
            "blocked_categories": [c.value for c in self.compliance.blocked_categories],
            "blocked_tickers": list(self.compliance.blocked_tickers),
            "limits": self.limits.to_dict(),
        }
