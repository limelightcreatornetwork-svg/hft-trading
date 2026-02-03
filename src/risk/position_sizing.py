"""
Position Sizing Module - Kelly Criterion and Risk-Based Position Sizing

Implements:
- Kelly criterion position sizing
- Half-Kelly (conservative) sizing
- Volatility-adjusted position sizing
- Maximum position caps based on account size
"""

import logging
import math
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional, Dict, List, Tuple
from enum import Enum

logger = logging.getLogger(__name__)


class SizingMethod(Enum):
    KELLY = "kelly"
    HALF_KELLY = "half_kelly"
    QUARTER_KELLY = "quarter_kelly"
    FIXED_FRACTIONAL = "fixed_fractional"
    VOLATILITY_ADJUSTED = "volatility_adjusted"


@dataclass
class TradeStats:
    """Historical trade statistics for Kelly calculation."""
    win_rate: float  # Probability of winning (0-1)
    avg_win: Decimal  # Average winning trade return
    avg_loss: Decimal  # Average losing trade return (positive number)
    
    @property
    def win_loss_ratio(self) -> float:
        """Calculate win/loss ratio (R)."""
        if self.avg_loss == 0:
            return 0.0
        return float(self.avg_win / self.avg_loss)
    
    @property
    def expectancy(self) -> float:
        """Calculate expected value per trade."""
        return (self.win_rate * float(self.avg_win)) - ((1 - self.win_rate) * float(self.avg_loss))


@dataclass
class PositionSizeResult:
    """Result of position sizing calculation."""
    shares: int
    notional_value: Decimal
    risk_amount: Decimal
    kelly_fraction: float
    method_used: SizingMethod
    confidence: float  # 0-1, how confident we are in this sizing
    warnings: List[str]
    
    def to_dict(self) -> Dict:
        return {
            "shares": self.shares,
            "notional_value": str(self.notional_value),
            "risk_amount": str(self.risk_amount),
            "kelly_fraction": self.kelly_fraction,
            "method_used": self.method_used.value,
            "confidence": self.confidence,
            "warnings": self.warnings,
        }


class PositionSizer:
    """
    Position sizing calculator using Kelly criterion and other methods.
    
    Kelly Criterion Formula:
    f* = (p * b - q) / b
    
    Where:
    - f* = fraction of bankroll to bet
    - p = probability of winning
    - b = odds received on the bet (win/loss ratio)
    - q = probability of losing (1 - p)
    
    For trading:
    f* = (win_rate * win_loss_ratio - (1 - win_rate)) / win_loss_ratio
    """
    
    def __init__(
        self,
        account_equity: Decimal,
        max_position_pct: float = 0.10,  # Max 10% of account per position
        max_total_risk_pct: float = 0.02,  # Max 2% account risk per trade
        default_method: SizingMethod = SizingMethod.HALF_KELLY,
        min_sample_trades: int = 30,  # Minimum trades needed for reliable stats
    ):
        self.account_equity = account_equity
        self.max_position_pct = max_position_pct
        self.max_total_risk_pct = max_total_risk_pct
        self.default_method = default_method
        self.min_sample_trades = min_sample_trades
        
        # Cache for volatility data
        self._volatility_cache: Dict[str, float] = {}
    
    def calculate_kelly_fraction(self, stats: TradeStats) -> Tuple[float, List[str]]:
        """
        Calculate optimal Kelly fraction.
        
        Returns:
            Tuple of (kelly_fraction, warnings)
        """
        warnings = []
        
        # Validate inputs
        if stats.win_rate <= 0 or stats.win_rate >= 1:
            warnings.append(f"Invalid win rate: {stats.win_rate}")
            return 0.0, warnings
        
        if stats.avg_loss <= 0:
            warnings.append("Cannot calculate Kelly with zero avg_loss")
            return 0.0, warnings
        
        # Calculate Kelly fraction
        p = stats.win_rate
        q = 1 - p
        b = stats.win_loss_ratio
        
        if b == 0:
            warnings.append("Win/loss ratio is zero")
            return 0.0, warnings
        
        kelly = (p * b - q) / b
        
        # Check for negative expectancy
        if kelly <= 0:
            warnings.append(f"Negative expectancy: Kelly = {kelly:.4f}")
            return 0.0, warnings
        
        # Warn if Kelly suggests very aggressive sizing
        if kelly > 0.5:
            warnings.append(f"Kelly suggests aggressive sizing: {kelly:.1%}")
        
        return kelly, warnings
    
    def calculate_position_size(
        self,
        symbol: str,
        entry_price: Decimal,
        stop_loss_price: Optional[Decimal] = None,
        stats: Optional[TradeStats] = None,
        volatility: Optional[float] = None,
        method: Optional[SizingMethod] = None,
        num_trades: int = 0,  # Number of historical trades used for stats
    ) -> PositionSizeResult:
        """
        Calculate optimal position size.
        
        Args:
            symbol: Trading symbol
            entry_price: Entry price per share
            stop_loss_price: Stop loss price (required for risk calculation)
            stats: Historical trade statistics for Kelly
            volatility: Annualized volatility (for vol-adjusted sizing)
            method: Sizing method override
            num_trades: Number of trades stats are based on
        
        Returns:
            PositionSizeResult with shares and details
        """
        warnings = []
        method = method or self.default_method
        confidence = 1.0
        
        # Calculate per-share risk if stop loss provided
        if stop_loss_price:
            risk_per_share = abs(entry_price - stop_loss_price)
        else:
            # Estimate risk as 2% of entry price
            risk_per_share = entry_price * Decimal("0.02")
            warnings.append("No stop loss provided, estimating 2% risk")
        
        # Calculate max position based on account risk limit
        max_risk_amount = self.account_equity * Decimal(str(self.max_total_risk_pct))
        
        # Calculate max position based on position size limit
        max_position_value = self.account_equity * Decimal(str(self.max_position_pct))
        
        # Calculate Kelly-based sizing
        kelly_fraction = 0.0
        
        if stats:
            kelly_fraction, kelly_warnings = self.calculate_kelly_fraction(stats)
            warnings.extend(kelly_warnings)
            
            # Reduce confidence if insufficient data
            if num_trades < self.min_sample_trades:
                confidence *= (num_trades / self.min_sample_trades)
                warnings.append(f"Low sample size: {num_trades} trades")
        else:
            # Default conservative Kelly estimate
            kelly_fraction = 0.05  # 5% default
            confidence *= 0.5
            warnings.append("No trade stats provided, using conservative default")
        
        # Apply method-specific adjustment
        if method == SizingMethod.KELLY:
            position_fraction = kelly_fraction
        elif method == SizingMethod.HALF_KELLY:
            position_fraction = kelly_fraction * 0.5
        elif method == SizingMethod.QUARTER_KELLY:
            position_fraction = kelly_fraction * 0.25
        elif method == SizingMethod.FIXED_FRACTIONAL:
            # Fixed 1% risk per trade
            position_fraction = 0.01
        elif method == SizingMethod.VOLATILITY_ADJUSTED:
            # Adjust based on volatility
            if volatility:
                # Target 10% annual volatility contribution
                target_vol = 0.10
                vol_adjustment = target_vol / volatility if volatility > 0 else 0.5
                position_fraction = kelly_fraction * 0.5 * min(vol_adjustment, 2.0)
            else:
                position_fraction = kelly_fraction * 0.5
                warnings.append("No volatility provided for vol-adjusted sizing")
        else:
            position_fraction = kelly_fraction * 0.5
        
        # Calculate position value
        position_value = self.account_equity * Decimal(str(position_fraction))
        
        # Apply caps
        if position_value > max_position_value:
            position_value = max_position_value
            warnings.append(f"Position capped at {self.max_position_pct:.0%} of account")
        
        # Calculate risk-adjusted position if stop loss provided
        if risk_per_share > 0:
            max_shares_by_risk = int(max_risk_amount / risk_per_share)
            max_shares_by_position = int(position_value / entry_price)
            shares = min(max_shares_by_risk, max_shares_by_position)
            
            if shares < max_shares_by_position:
                warnings.append("Position limited by risk tolerance")
        else:
            shares = int(position_value / entry_price)
        
        # Ensure at least 1 share
        shares = max(1, shares)
        
        # Calculate final values
        notional_value = entry_price * shares
        risk_amount = risk_per_share * shares
        
        # Final sanity checks
        if notional_value > self.account_equity:
            shares = int(self.account_equity * Decimal("0.9") / entry_price)
            notional_value = entry_price * shares
            risk_amount = risk_per_share * shares
            warnings.append("Position exceeds account equity, reduced")
        
        return PositionSizeResult(
            shares=shares,
            notional_value=notional_value,
            risk_amount=risk_amount,
            kelly_fraction=kelly_fraction,
            method_used=method,
            confidence=confidence,
            warnings=warnings,
        )
    
    def calculate_portfolio_position_size(
        self,
        symbol: str,
        entry_price: Decimal,
        existing_positions: Dict[str, Decimal],  # symbol -> market_value
        correlation_matrix: Optional[Dict[str, Dict[str, float]]] = None,
        stats: Optional[TradeStats] = None,
        method: Optional[SizingMethod] = None,
    ) -> PositionSizeResult:
        """
        Calculate position size considering existing portfolio.
        
        Reduces position size if correlated with existing positions.
        """
        # Get base position size
        result = self.calculate_position_size(
            symbol=symbol,
            entry_price=entry_price,
            stats=stats,
            method=method,
        )
        
        # Adjust for portfolio correlation
        if correlation_matrix and existing_positions:
            total_correlated_exposure = Decimal("0")
            
            for existing_symbol, existing_value in existing_positions.items():
                if existing_symbol in correlation_matrix.get(symbol, {}):
                    correlation = correlation_matrix[symbol][existing_symbol]
                    # Add correlated portion
                    total_correlated_exposure += existing_value * Decimal(str(abs(correlation)))
            
            # Reduce position if highly correlated exposure exists
            max_correlated = self.account_equity * Decimal("0.20")  # 20% max correlated exposure
            
            if total_correlated_exposure > max_correlated:
                reduction_factor = float(max_correlated / (total_correlated_exposure + result.notional_value))
                new_shares = max(1, int(result.shares * reduction_factor))
                
                result.warnings.append(
                    f"Position reduced due to correlated exposure: {new_shares} shares"
                )
                result = PositionSizeResult(
                    shares=new_shares,
                    notional_value=entry_price * new_shares,
                    risk_amount=result.risk_amount * Decimal(str(reduction_factor)),
                    kelly_fraction=result.kelly_fraction,
                    method_used=result.method_used,
                    confidence=result.confidence * reduction_factor,
                    warnings=result.warnings,
                )
        
        return result
    
    def update_account_equity(self, equity: Decimal):
        """Update account equity for position sizing calculations."""
        self.account_equity = equity
        logger.info(f"Position sizer equity updated: ${equity}")


# Utility functions
def calculate_kelly_from_trades(
    winning_trades: List[Decimal],
    losing_trades: List[Decimal]
) -> TradeStats:
    """
    Calculate TradeStats from historical trade returns.
    
    Args:
        winning_trades: List of positive returns
        losing_trades: List of negative returns (as positive numbers)
    
    Returns:
        TradeStats object
    """
    total_trades = len(winning_trades) + len(losing_trades)
    
    if total_trades == 0:
        return TradeStats(win_rate=0.5, avg_win=Decimal("0"), avg_loss=Decimal("0"))
    
    win_rate = len(winning_trades) / total_trades
    
    avg_win = (
        sum(winning_trades) / len(winning_trades)
        if winning_trades else Decimal("0")
    )
    
    avg_loss = (
        sum(abs(l) for l in losing_trades) / len(losing_trades)
        if losing_trades else Decimal("0")
    )
    
    return TradeStats(
        win_rate=win_rate,
        avg_win=avg_win,
        avg_loss=avg_loss,
    )


def optimal_f_from_trades(trade_returns: List[float]) -> float:
    """
    Calculate optimal f using the secure f formula.
    
    This is a more robust alternative to Kelly when
    we have actual trade returns.
    """
    if not trade_returns:
        return 0.0
    
    # Find the worst loss
    worst_loss = min(trade_returns)
    
    if worst_loss >= 0:
        # No losses, be conservative
        return 0.05
    
    # optimal f = -average_return / worst_loss
    avg_return = sum(trade_returns) / len(trade_returns)
    
    if avg_return <= 0:
        return 0.0
    
    optimal_f = -avg_return / worst_loss
    
    # Cap at 25% for safety
    return min(optimal_f, 0.25)
