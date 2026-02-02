"""
Value/Mispricing Strategy

Identifies markets where model probability differs significantly
from market price, after accounting for fees.
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Optional, Dict, Any, List

from .base import Strategy, Signal, SignalDirection, Market, StrategyContext
from .thesis import Thesis, ThesisStatus, ThesisTracker, Signal as ThesisSignal
from .pricing import PricingEngine, FeeCalculator

logger = logging.getLogger(__name__)


@dataclass
class ValueStrategyParams:
    """Value strategy parameters."""
    min_edge: float = 0.08              # Minimum 8% edge after fees
    min_confidence: float = 0.6         # Minimum confidence level
    max_position_pct: float = 0.25      # Max 25% of per-market limit
    min_liquidity_score: float = 0.3    # Minimum liquidity
    max_spread_pct: float = 0.15        # Maximum 15% spread
    min_time_to_close_hours: float = 24  # At least 24 hours to close
    max_kelly_fraction: float = 0.15    # Conservative Kelly
    
    # Invalidation thresholds
    invalidation_edge_threshold: float = 0.02  # Invalidate if edge drops below 2%
    invalidation_price_move_pct: float = 0.15  # Invalidate on 15% adverse move
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "min_edge": self.min_edge,
            "min_confidence": self.min_confidence,
            "max_position_pct": self.max_position_pct,
            "min_liquidity_score": self.min_liquidity_score,
            "max_spread_pct": self.max_spread_pct,
            "min_time_to_close_hours": self.min_time_to_close_hours,
            "max_kelly_fraction": self.max_kelly_fraction,
            "invalidation_edge_threshold": self.invalidation_edge_threshold,
            "invalidation_price_move_pct": self.invalidation_price_move_pct,
        }


class ValueStrategy(Strategy):
    """
    Value/Mispricing trading strategy.
    
    This strategy:
    1. Uses a model probability for each market
    2. Compares to market price to find edge
    3. Accounts for fees in edge calculation
    4. Sizes positions using Kelly criterion
    5. Creates and tracks theses for trades
    
    Usage:
        strategy = ValueStrategy(
            thesis_tracker=tracker,
            model_provider=my_model,
        )
        
        # Or with custom params:
        strategy = ValueStrategy(
            thesis_tracker=tracker,
            model_provider=my_model,
            params=ValueStrategyParams(min_edge=0.10),
        )
    """
    
    def __init__(
        self,
        thesis_tracker: Optional[ThesisTracker] = None,
        model_provider=None,  # Callable[[str], float] - returns probability
        params: Optional[ValueStrategyParams] = None,
    ):
        super().__init__()
        self.thesis_tracker = thesis_tracker
        self.model_provider = model_provider
        self.params = params or ValueStrategyParams()
        self.pricing_engine = PricingEngine(
            min_edge=self.params.min_edge,
            max_kelly=self.params.max_kelly_fraction,
        )
    
    @property
    def name(self) -> str:
        return "value"
    
    @property
    def version(self) -> str:
        return "1.0.0"
    
    def get_parameters(self) -> Dict[str, Any]:
        return self.params.to_dict()
    
    def set_parameters(self, params: Dict[str, Any]):
        """Update strategy parameters."""
        for key, value in params.items():
            if hasattr(self.params, key):
                setattr(self.params, key, value)
        
        # Update pricing engine
        self.pricing_engine.min_edge = self.params.min_edge
        self.pricing_engine.position_sizer.max_kelly_fraction = self.params.max_kelly_fraction
    
    def _get_model_probability(self, market: Market) -> float:
        """
        Get model probability for a market.
        
        Override or provide model_provider for custom models.
        Default: use market implied probability (no edge).
        """
        if self.model_provider:
            try:
                return self.model_provider(market.ticker)
            except Exception as e:
                logger.warning(f"Model provider error for {market.ticker}: {e}")
        
        # Fallback: return market probability (will have no edge)
        return market.implied_prob
    
    def _passes_filters(self, market: Market, context: StrategyContext) -> tuple[bool, str]:
        """Check if market passes pre-trade filters."""
        # Liquidity check
        if market.liquidity_score < self.params.min_liquidity_score:
            return False, f"Low liquidity: {market.liquidity_score:.2f}"
        
        # Spread check
        if market.spread_pct > self.params.max_spread_pct:
            return False, f"Wide spread: {market.spread_pct:.2%}"
        
        # Time to close check
        if market.time_to_close_hours < self.params.min_time_to_close_hours:
            return False, f"Too close to settlement: {market.time_to_close_hours:.1f}h"
        
        # Check if we already have max position
        if context.has_position(market.ticker):
            position = context.get_position(market.ticker)
            if position:
                position_value = abs(position.get("market_value", 0))
                if position_value >= float(context.max_position_per_market) * self.params.max_position_pct:
                    return False, "Already at max position"
        
        return True, "Passed"
    
    async def evaluate(
        self,
        market: Market,
        thesis: Optional[Thesis],
        context: StrategyContext,
    ) -> Optional[Signal]:
        """
        Evaluate market for value trading opportunity.
        """
        # Check trading is allowed
        if not context.can_trade:
            return None
        
        # Apply filters
        passes, reason = self._passes_filters(market, context)
        if not passes:
            logger.debug(f"Market {market.ticker} filtered: {reason}")
            return None
        
        # Get model probability
        model_prob = self._get_model_probability(market)
        
        # Compare both directions
        analysis = self.pricing_engine.compare_directions(
            model_prob=model_prob,
            market_price=market.yes_price,
            bankroll=context.available_balance,
            max_position=context.max_position_per_market * Decimal(str(self.params.max_position_pct)),
        )
        
        # Check if we should trade
        better = analysis[analysis["better_direction"]]
        
        if better["recommendation"] != "TRADE":
            logger.debug(f"Market {market.ticker}: {better['reason']}")
            return None
        
        # Check confidence threshold
        edge = better["edge"]
        confidence = min(1.0, edge / self.params.min_edge)  # Scale confidence by edge
        
        if confidence < self.params.min_confidence:
            logger.debug(f"Market {market.ticker}: confidence too low ({confidence:.2f})")
            return None
        
        # Determine direction
        direction = analysis["better_direction"]
        if direction == "yes":
            signal_direction = SignalDirection.BUY_YES
            target_price = market.best_ask  # Buy at ask
        else:
            signal_direction = SignalDirection.BUY_NO
            target_price = 100 - market.best_bid  # NO price
        
        # Create or update thesis
        thesis_id = None
        if self.thesis_tracker:
            if thesis and thesis.direction == direction:
                # Use existing thesis
                thesis_id = thesis.id
            else:
                # Create new thesis
                hypothesis = self._generate_hypothesis(market, model_prob, edge, direction)
                
                thesis_signal = ThesisSignal(
                    id=f"value-{market.ticker}-{datetime.now().timestamp()}",
                    signal_type="value_edge",
                    value=edge,
                    strength=confidence,
                    timestamp=datetime.now(),
                    metadata={
                        "model_prob": model_prob,
                        "market_prob": market.implied_prob,
                        "direction": direction,
                    }
                )
                
                new_thesis = self.thesis_tracker.create_thesis(
                    market_ticker=market.ticker,
                    hypothesis=hypothesis,
                    direction=direction,
                    entry_price_target=target_price,
                    exit_price_target=int(model_prob * 100) if direction == "yes" else int((1 - model_prob) * 100),
                    model_probability=model_prob,
                    market_probability=market.implied_prob,
                    strategy=self.name,
                    signals=[thesis_signal],
                    tags=["value", market.category],
                )
                thesis_id = new_thesis.id
        
        return Signal(
            direction=signal_direction,
            market_ticker=market.ticker,
            target_price=target_price,
            target_count=better["recommended_contracts"],
            max_count=int(better["recommended_contracts"] * 1.5),  # Allow some overfill
            confidence=confidence,
            edge=edge,
            strategy=self.name,
            reason=f"Value edge: {edge:.2%} on {direction.upper()}",
            thesis_id=thesis_id,
            metadata={
                "model_probability": model_prob,
                "market_probability": market.implied_prob,
                "kelly_fraction": better["kelly_fraction"],
                "expected_value": better["expected_value"],
            },
        )
    
    def _generate_hypothesis(
        self,
        market: Market,
        model_prob: float,
        edge: float,
        direction: str,
    ) -> str:
        """Generate human-readable hypothesis."""
        market_prob = market.implied_prob
        prob_diff = abs(model_prob - market_prob)
        
        if direction == "yes":
            return (
                f"Market underprices YES by {prob_diff:.1%}. "
                f"Model estimates {model_prob:.1%} true probability vs "
                f"market's {market_prob:.1%}. "
                f"Fee-adjusted edge: {edge:.1%}."
            )
        else:
            return (
                f"Market overprices YES by {prob_diff:.1%}. "
                f"Model estimates {model_prob:.1%} true probability vs "
                f"market's {market_prob:.1%}. "
                f"Buying NO with fee-adjusted edge: {edge:.1%}."
            )
    
    def should_invalidate_thesis(
        self,
        thesis: Thesis,
        market: Market,
        context: StrategyContext,
    ) -> Optional[str]:
        """
        Check if thesis should be invalidated.
        
        Invalidation triggers:
        1. Edge has dropped below threshold
        2. Price moved adversely beyond threshold
        3. Market approaching close
        """
        if thesis.strategy != self.name:
            return None  # Not our thesis
        
        # Get current model probability
        model_prob = self._get_model_probability(market)
        
        # Recalculate edge
        fee_calc = FeeCalculator()
        current_edge = fee_calc.calculate_edge(
            model_prob=model_prob,
            market_price=market.yes_price,
            direction=thesis.direction,
        )
        
        # Check edge threshold
        if current_edge < self.params.invalidation_edge_threshold:
            return f"Edge dropped to {current_edge:.2%}, below threshold"
        
        # Check price movement
        if thesis.avg_fill_price:
            if thesis.direction == "yes":
                price_change = (market.yes_price - thesis.avg_fill_price) / thesis.avg_fill_price
                if price_change < -self.params.invalidation_price_move_pct:
                    return f"Adverse price move: {price_change:.1%}"
            else:
                price_change = (thesis.avg_fill_price - market.yes_price) / thesis.avg_fill_price
                if price_change < -self.params.invalidation_price_move_pct:
                    return f"Adverse price move: {price_change:.1%}"
        
        # Check time to close
        if market.time_to_close_hours < 1:
            return "Market closing soon"
        
        return None
    
    def on_fill(self, market_ticker: str, count: int, price: int, thesis: Optional[Thesis]):
        """Handle fill notification."""
        logger.info(f"ValueStrategy fill: {market_ticker} {count}@{price}")
        
        if thesis and self.thesis_tracker:
            self.thesis_tracker.record_fill(thesis.id, count, price)
    
    def on_market_settle(self, market_ticker: str, outcome: bool, thesis: Optional[Thesis]):
        """Handle market settlement."""
        if thesis and self.thesis_tracker:
            # Settlement price is 100 if YES won, 0 if NO won
            exit_price = 100 if outcome else 0
            
            # Determine if our thesis was correct
            if thesis.direction == "yes":
                correct = outcome  # We bet YES, YES won
            else:
                correct = not outcome  # We bet NO, NO won
            
            self.thesis_tracker.realize_thesis(thesis.id, exit_price, correct)
