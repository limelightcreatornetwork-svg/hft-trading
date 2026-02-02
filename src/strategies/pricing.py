"""
Pricing Engine

Provides:
- Fee calculations for Kalshi trades
- Edge computation with fee adjustment
- Kelly criterion position sizing
- Expected value calculations
"""

import logging
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional, Dict, Any
import math

logger = logging.getLogger(__name__)


@dataclass
class FeeStructure:
    """Kalshi fee structure."""
    entry_fee_cents: int = 7  # Per contract entry fee
    exit_fee_cents: int = 7   # Per contract exit fee (on sale or settlement)
    
    @property
    def round_trip_fee(self) -> int:
        """Total fee for entering and exiting a position."""
        return self.entry_fee_cents + self.exit_fee_cents
    
    def entry_cost(self, count: int) -> int:
        """Total entry fee in cents."""
        return count * self.entry_fee_cents
    
    def exit_cost(self, count: int) -> int:
        """Total exit fee in cents."""
        return count * self.exit_fee_cents
    
    def total_cost(self, count: int) -> int:
        """Total round-trip fee in cents."""
        return count * self.round_trip_fee


class FeeCalculator:
    """
    Calculates fees and edge for Kalshi trades.
    
    Kalshi Fee Structure:
    - 7¢ per contract on entry
    - 7¢ per contract on exit (sale or settlement)
    - Total round-trip: 14¢ per contract
    
    Example:
        calc = FeeCalculator()
        
        # Calculate edge for buying YES at 45¢ when model says 55%
        edge = calc.calculate_edge(
            model_prob=0.55,
            market_price=45,
            direction="yes"
        )
        # edge ≈ 0.55 - 0.45 - 0.14/55 ≈ 0.097 (9.7% edge)
    """
    
    def __init__(self, fees: Optional[FeeStructure] = None):
        self.fees = fees or FeeStructure()
    
    def calculate_edge(
        self,
        model_prob: float,
        market_price: int,
        direction: str,
    ) -> float:
        """
        Calculate fee-adjusted edge for a trade.
        
        Args:
            model_prob: Our estimated probability (0-1)
            market_price: Market price in cents (1-99)
            direction: "yes" or "no"
        
        Returns:
            Fee-adjusted edge as decimal (e.g., 0.10 = 10% edge)
        """
        # Market implied probability
        market_prob = market_price / 100
        
        if direction == "yes":
            # Buying YES: we profit if YES wins
            # Raw edge = model_prob - market_prob
            raw_edge = model_prob - market_prob
            
            # Fee impact: we pay entry fee + exit fee on wins
            # On $1 payout, fee is round_trip/100 = 14%/payout_on_win
            # For price p, if we win we get (100-p) profit, minus fees
            # Breakeven: need edge > fee / (100 - price)
            fee_impact = self.fees.round_trip_fee / (100 - market_price) if market_price < 100 else 1
            
        else:
            # Buying NO: we profit if NO wins
            # Model prob of NO = 1 - model_prob
            raw_edge = (1 - model_prob) - (1 - market_prob)
            
            # Fee impact for NO side
            fee_impact = self.fees.round_trip_fee / market_price if market_price > 0 else 1
        
        fee_adjusted_edge = raw_edge - fee_impact
        return fee_adjusted_edge
    
    def calculate_ev(
        self,
        model_prob: float,
        entry_price: int,
        count: int,
        direction: str,
    ) -> Decimal:
        """
        Calculate expected value of a trade.
        
        Args:
            model_prob: Our estimated probability (0-1)
            entry_price: Entry price in cents (1-99)
            count: Number of contracts
            direction: "yes" or "no"
        
        Returns:
            Expected value in dollars
        """
        entry_fee = self.fees.entry_cost(count)
        exit_fee = self.fees.exit_cost(count)
        
        if direction == "yes":
            # Cost to enter: price + entry_fee (in cents)
            cost = entry_price * count + entry_fee
            
            # If YES wins: receive $1 per contract (100¢), minus exit fee
            win_payout = 100 * count - exit_fee
            
            # If NO wins: lose entry cost, no exit fee (no settlement)
            # Actually Kalshi charges fee on settlement regardless
            lose_payout = -cost
            
            # Expected value
            ev_cents = model_prob * (win_payout - cost) + (1 - model_prob) * lose_payout
            
        else:
            # Buying NO
            no_price = 100 - entry_price  # NO price = 100 - YES price
            cost = no_price * count + entry_fee
            
            # Model prob of NO winning
            no_prob = 1 - model_prob
            
            # If NO wins: receive $1 per contract, minus exit fee
            win_payout = 100 * count - exit_fee
            
            # If YES wins: lose entry cost
            lose_payout = -cost
            
            ev_cents = no_prob * (win_payout - cost) + model_prob * lose_payout
        
        return Decimal(ev_cents) / 100  # Convert to dollars
    
    def breakeven_edge(self, market_price: int, direction: str) -> float:
        """
        Calculate minimum edge needed to break even.
        
        Args:
            market_price: Market price in cents
            direction: "yes" or "no"
        
        Returns:
            Breakeven edge as decimal
        """
        if direction == "yes":
            return self.fees.round_trip_fee / (100 - market_price) if market_price < 100 else 1
        else:
            return self.fees.round_trip_fee / market_price if market_price > 0 else 1
    
    def calculate_breakeven_price(
        self,
        model_prob: float,
        direction: str,
    ) -> int:
        """
        Calculate the maximum/minimum price to enter with positive EV.
        
        Args:
            model_prob: Our estimated probability (0-1)
            direction: "yes" or "no"
        
        Returns:
            Breakeven price in cents
        """
        if direction == "yes":
            # For YES: breakeven when model_prob = price + fees/(100-price)
            # Solve: p + 14/(100-p) = model_prob * 100
            # This is quadratic, approximate solution:
            target = model_prob * 100
            breakeven = int(target - self.fees.round_trip_fee / 2)
        else:
            # For NO
            no_prob = 1 - model_prob
            target = no_prob * 100
            breakeven = 100 - int(target - self.fees.round_trip_fee / 2)
        
        return max(1, min(99, breakeven))


class PositionSizer:
    """
    Position sizing using Kelly Criterion.
    
    Kelly formula: f* = (p*b - q) / b
    where:
        f* = fraction of bankroll to wager
        p = probability of winning
        q = probability of losing (1 - p)
        b = odds received on the wager (net payout / stake)
    
    For Kalshi:
        - Buying YES at price p: odds = (100 - p) / p
        - Buying NO at price (100-p): odds = p / (100 - p)
    """
    
    def __init__(
        self,
        max_kelly_fraction: float = 0.25,
        fee_calculator: Optional[FeeCalculator] = None,
    ):
        self.max_kelly_fraction = max_kelly_fraction
        self.fee_calc = fee_calculator or FeeCalculator()
    
    def kelly_fraction(
        self,
        model_prob: float,
        market_price: int,
        direction: str,
    ) -> float:
        """
        Calculate Kelly criterion fraction.
        
        Args:
            model_prob: Our estimated probability (0-1)
            market_price: Market price in cents (1-99)
            direction: "yes" or "no"
        
        Returns:
            Recommended fraction of bankroll (capped at max_kelly_fraction)
        """
        if direction == "yes":
            p = model_prob
            # Odds for YES: win (100 - price - fees) on risk of price
            net_win = 100 - market_price - self.fee_calc.fees.round_trip_fee
            if net_win <= 0 or market_price <= 0:
                return 0
            b = net_win / market_price
        else:
            p = 1 - model_prob  # Prob of NO winning
            no_price = 100 - market_price
            # Odds for NO
            net_win = market_price - self.fee_calc.fees.round_trip_fee
            if net_win <= 0 or no_price <= 0:
                return 0
            b = net_win / no_price
        
        q = 1 - p
        
        # Kelly formula
        kelly = (p * b - q) / b if b > 0 else 0
        
        # Cap at max fraction (fractional Kelly)
        kelly = max(0, min(kelly, self.max_kelly_fraction))
        
        return kelly
    
    def calculate_position_size(
        self,
        model_prob: float,
        market_price: int,
        direction: str,
        bankroll: Decimal,
        max_position: Decimal,
        min_contracts: int = 1,
    ) -> int:
        """
        Calculate recommended position size in contracts.
        
        Args:
            model_prob: Our estimated probability
            market_price: Market price in cents
            direction: "yes" or "no"
            bankroll: Available capital in dollars
            max_position: Maximum position value in dollars
            min_contracts: Minimum contracts to trade
        
        Returns:
            Number of contracts to trade
        """
        kelly = self.kelly_fraction(model_prob, market_price, direction)
        
        if kelly <= 0:
            return 0
        
        # Calculate dollar amount
        kelly_dollars = float(bankroll) * kelly
        
        # Apply max position limit
        position_dollars = min(kelly_dollars, float(max_position))
        
        # Convert to contracts
        contract_price = market_price if direction == "yes" else (100 - market_price)
        contract_price_dollars = contract_price / 100
        
        contracts = int(position_dollars / contract_price_dollars)
        
        # Apply minimum
        if contracts < min_contracts:
            # Check if we have enough for minimum
            min_cost = min_contracts * contract_price_dollars
            if min_cost <= position_dollars:
                contracts = min_contracts
            else:
                contracts = 0
        
        return contracts


class PricingEngine:
    """
    Main pricing engine combining all calculations.
    
    Usage:
        engine = PricingEngine()
        
        # Get trade recommendation
        rec = engine.analyze_trade(
            model_prob=0.55,
            market_price=45,
            direction="yes",
            bankroll=Decimal("1000"),
            max_position=Decimal("200"),
        )
        
        print(f"Edge: {rec['edge']:.2%}")
        print(f"EV: ${rec['expected_value']:.2f}")
        print(f"Size: {rec['recommended_contracts']} contracts")
    """
    
    def __init__(
        self,
        fees: Optional[FeeStructure] = None,
        max_kelly: float = 0.25,
        min_edge: float = 0.05,
    ):
        self.fees = fees or FeeStructure()
        self.fee_calc = FeeCalculator(self.fees)
        self.position_sizer = PositionSizer(max_kelly, self.fee_calc)
        self.min_edge = min_edge
    
    def analyze_trade(
        self,
        model_prob: float,
        market_price: int,
        direction: str,
        bankroll: Optional[Decimal] = None,
        max_position: Optional[Decimal] = None,
    ) -> Dict[str, Any]:
        """
        Complete trade analysis.
        
        Args:
            model_prob: Our estimated probability (0-1)
            market_price: Market price in cents (1-99)
            direction: "yes" or "no"
            bankroll: Available capital (optional, for sizing)
            max_position: Max position size (optional, for sizing)
        
        Returns:
            Dict with edge, EV, sizing, and recommendation
        """
        # Calculate edge
        edge = self.fee_calc.calculate_edge(model_prob, market_price, direction)
        breakeven = self.fee_calc.breakeven_edge(market_price, direction)
        
        # Calculate Kelly fraction
        kelly = self.position_sizer.kelly_fraction(model_prob, market_price, direction)
        
        # Calculate position size if bankroll provided
        recommended_contracts = 0
        if bankroll and max_position:
            recommended_contracts = self.position_sizer.calculate_position_size(
                model_prob, market_price, direction,
                bankroll, max_position
            )
        
        # Calculate EV for recommended size
        ev = self.fee_calc.calculate_ev(
            model_prob, market_price,
            recommended_contracts or 1,  # Use 1 for per-contract EV
            direction
        )
        
        # Generate recommendation
        if edge < 0:
            recommendation = "NO_TRADE"
            reason = f"Negative edge ({edge:.2%})"
        elif edge < self.min_edge:
            recommendation = "NO_TRADE"
            reason = f"Edge ({edge:.2%}) below minimum ({self.min_edge:.2%})"
        elif kelly <= 0:
            recommendation = "NO_TRADE"
            reason = "Kelly criterion suggests no position"
        elif recommended_contracts == 0 and bankroll:
            recommendation = "NO_TRADE"
            reason = "Position size rounds to zero"
        else:
            recommendation = "TRADE"
            reason = f"Positive edge ({edge:.2%}) exceeds minimum"
        
        return {
            "model_probability": model_prob,
            "market_probability": market_price / 100,
            "market_price": market_price,
            "direction": direction,
            
            "edge": edge,
            "edge_pct": f"{edge:.2%}",
            "breakeven_edge": breakeven,
            "breakeven_edge_pct": f"{breakeven:.2%}",
            
            "kelly_fraction": kelly,
            "kelly_pct": f"{kelly:.2%}",
            
            "expected_value_per_contract": float(
                self.fee_calc.calculate_ev(model_prob, market_price, 1, direction)
            ),
            "expected_value": float(ev),
            
            "recommended_contracts": recommended_contracts,
            "position_cost": (
                recommended_contracts * (market_price if direction == "yes" else (100 - market_price)) / 100
            ),
            
            "recommendation": recommendation,
            "reason": reason,
            
            "fees": {
                "entry_per_contract": self.fees.entry_fee_cents,
                "exit_per_contract": self.fees.exit_fee_cents,
                "round_trip_per_contract": self.fees.round_trip_fee,
                "total_round_trip": self.fees.total_cost(recommended_contracts or 1),
            },
        }
    
    def compare_directions(
        self,
        model_prob: float,
        market_price: int,
        bankroll: Optional[Decimal] = None,
        max_position: Optional[Decimal] = None,
    ) -> Dict[str, Any]:
        """
        Compare buying YES vs buying NO.
        
        Returns analysis for both directions to help decide.
        """
        yes_analysis = self.analyze_trade(
            model_prob, market_price, "yes", bankroll, max_position
        )
        no_analysis = self.analyze_trade(
            model_prob, market_price, "no", bankroll, max_position
        )
        
        # Determine better direction
        if yes_analysis["edge"] > no_analysis["edge"]:
            better = "yes"
            better_analysis = yes_analysis
        else:
            better = "no"
            better_analysis = no_analysis
        
        return {
            "yes": yes_analysis,
            "no": no_analysis,
            "better_direction": better,
            "better_edge": better_analysis["edge"],
            "recommendation": better_analysis["recommendation"],
        }
