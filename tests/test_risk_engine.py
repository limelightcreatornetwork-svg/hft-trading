"""
Tests for Risk Engine

Run with: pytest tests/test_risk_engine.py -v
"""

import pytest
from decimal import Decimal
from datetime import datetime, timedelta

from src.risk.engine import (
    RiskEngine, RiskLimits, RiskAction, CircuitState,
    Order, Position, RiskCheckResult,
    SpendTracker, CircuitBreaker, LossTracker,
)


class TestRiskLimits:
    """Test risk limit configuration."""
    
    def test_default_limits(self):
        limits = RiskLimits()
        assert limits.max_order_notional == Decimal("10000")
        assert limits.max_daily_loss == Decimal("5000")
        assert limits.max_drawdown_pct == Decimal("0.10")
    
    def test_custom_limits(self):
        limits = RiskLimits(
            max_order_notional=Decimal("5000"),
            max_daily_loss=Decimal("1000"),
        )
        assert limits.max_order_notional == Decimal("5000")
        assert limits.max_daily_loss == Decimal("1000")


class TestSpendTracker:
    """Test spend tracking."""
    
    def test_record_spend(self):
        tracker = SpendTracker()
        tracker.record_spend(Decimal("1000"))
        
        assert tracker.daily_spend == Decimal("1000")
        assert tracker.weekly_spend == Decimal("1000")
        assert tracker.monthly_spend == Decimal("1000")
    
    def test_get_remaining(self):
        tracker = SpendTracker()
        limits = RiskLimits(
            daily_spend_limit=Decimal("10000"),
            weekly_spend_limit=Decimal("30000"),
            monthly_spend_limit=Decimal("100000"),
        )
        
        tracker.record_spend(Decimal("5000"))
        remaining = tracker.get_remaining(limits)
        
        assert remaining["daily"] == Decimal("5000")
        assert remaining["weekly"] == Decimal("25000")
        assert remaining["monthly"] == Decimal("95000")


class TestCircuitBreaker:
    """Test circuit breaker functionality."""
    
    def test_initial_state(self):
        limits = RiskLimits()
        cb = CircuitBreaker(limits)
        
        assert cb.state == CircuitState.CLOSED
        can_trade, _ = cb.can_trade()
        assert can_trade
    
    def test_trip_on_high_reject_rate(self):
        limits = RiskLimits(max_reject_rate=0.3, reject_window_size=10)
        cb = CircuitBreaker(limits)
        
        # Record 5 success, 5 failures (50% reject rate)
        for _ in range(5):
            cb.record_order(success=True)
        for _ in range(5):
            cb.record_order(success=False)
        
        assert cb.state == CircuitState.OPEN
        can_trade, reason = cb.can_trade()
        assert not can_trade
        assert "OPEN" in reason
    
    def test_manual_reset(self):
        limits = RiskLimits(max_reject_rate=0.1)
        cb = CircuitBreaker(limits)
        
        # Trip it
        for _ in range(10):
            cb.record_order(success=False)
        
        assert cb.state == CircuitState.OPEN
        
        # Reset
        cb.reset()
        assert cb.state == CircuitState.CLOSED
        can_trade, _ = cb.can_trade()
        assert can_trade


class TestLossTracker:
    """Test loss tracking."""
    
    def test_update_pnl(self):
        tracker = LossTracker()
        tracker.update(realized_pnl=Decimal("-500"), equity=Decimal("10000"))
        
        assert tracker.daily_pnl == Decimal("-500")
        assert tracker.current_equity == Decimal("10000")
    
    def test_drawdown_calculation(self):
        tracker = LossTracker()
        
        # Start at 10000, peak
        tracker.update(Decimal("0"), Decimal("10000"))
        assert tracker.get_drawdown_pct() == Decimal("0")
        
        # Drop to 9000 (10% drawdown)
        tracker.update(Decimal("-1000"), Decimal("9000"))
        assert tracker.get_drawdown_pct() == Decimal("0.1")


class TestRiskEngine:
    """Test main risk engine."""
    
    @pytest.fixture
    def engine(self):
        limits = RiskLimits(
            max_order_notional=Decimal("10000"),
            max_order_shares=100,
            max_position_shares=500,
            max_position_notional=Decimal("50000"),
            max_daily_loss=Decimal("5000"),
        )
        return RiskEngine(limits=limits)
    
    @pytest.mark.asyncio
    async def test_approve_valid_order(self, engine):
        order = Order(
            symbol="AAPL",
            side="buy",
            qty=10,
            order_type="limit",
            limit_price=Decimal("150"),
        )
        
        result = await engine.check_order(
            order=order,
            positions={},
            market_price=Decimal("150"),
        )
        
        assert result.action == RiskAction.APPROVE
        assert len(result.checks_failed) == 0
    
    @pytest.mark.asyncio
    async def test_reject_oversized_order(self, engine):
        order = Order(
            symbol="AAPL",
            side="buy",
            qty=1000,  # Exceeds max_order_shares=100
            order_type="market",
        )
        
        result = await engine.check_order(
            order=order,
            positions={},
            market_price=Decimal("150"),
        )
        
        assert result.action == RiskAction.REJECT
        assert any("ORDER_SHARES_EXCEEDED" in f for f in result.checks_failed)
    
    @pytest.mark.asyncio
    async def test_reject_notional_exceeded(self, engine):
        order = Order(
            symbol="AAPL",
            side="buy",
            qty=100,
            order_type="limit",
            limit_price=Decimal("500"),  # 100 * 500 = 50000, exceeds 10000
        )
        
        result = await engine.check_order(
            order=order,
            positions={},
            market_price=Decimal("500"),
        )
        
        assert result.action == RiskAction.REJECT
        assert any("ORDER_NOTIONAL_EXCEEDED" in f for f in result.checks_failed)
    
    @pytest.mark.asyncio
    async def test_reject_position_limit(self, engine):
        order = Order(
            symbol="AAPL",
            side="buy",
            qty=100,
            order_type="limit",
            limit_price=Decimal("100"),
        )
        
        # Existing position near limit
        positions = {
            "AAPL": Position(
                symbol="AAPL",
                qty=450,  # +100 = 550, exceeds 500
                avg_entry_price=Decimal("100"),
                current_price=Decimal("100"),
                market_value=Decimal("45000"),
                unrealized_pnl=Decimal("0"),
            )
        }
        
        result = await engine.check_order(
            order=order,
            positions=positions,
            market_price=Decimal("100"),
        )
        
        assert result.action == RiskAction.REJECT
        assert any("POSITION_SHARES_EXCEEDED" in f for f in result.checks_failed)
    
    @pytest.mark.asyncio
    async def test_kill_switch_rejects_all(self, engine):
        engine.activate_kill_switch("Test")
        
        order = Order(
            symbol="AAPL",
            side="buy",
            qty=1,
            order_type="market",
        )
        
        result = await engine.check_order(
            order=order,
            positions={},
            market_price=Decimal("150"),
        )
        
        assert result.action == RiskAction.REJECT
        assert any("KILL_SWITCH" in f for f in result.checks_failed)
    
    @pytest.mark.asyncio
    async def test_dry_run_mode(self):
        limits = RiskLimits()
        engine = RiskEngine(limits=limits, dry_run=True)
        
        order = Order(
            symbol="AAPL",
            side="buy",
            qty=10,
            order_type="market",
        )
        
        result = await engine.check_order(
            order=order,
            positions={},
            market_price=Decimal("150"),
        )
        
        assert result.action == RiskAction.DRY_RUN
    
    @pytest.mark.asyncio
    async def test_require_approval_large_order(self):
        limits = RiskLimits(
            approval_notional_threshold=Decimal("5000"),
        )
        engine = RiskEngine(limits=limits)
        
        order = Order(
            symbol="AAPL",
            side="buy",
            qty=50,
            order_type="limit",
            limit_price=Decimal("150"),  # 50 * 150 = 7500 > 5000 threshold
        )
        
        result = await engine.check_order(
            order=order,
            positions={},
            market_price=Decimal("150"),
        )
        
        assert result.action == RiskAction.REQUIRE_APPROVAL
        assert result.approval_reason is not None
    
    @pytest.mark.asyncio
    async def test_blocked_symbol(self):
        limits = RiskLimits(blocked_symbols={"GME", "AMC"})
        engine = RiskEngine(limits=limits)
        
        order = Order(
            symbol="GME",
            side="buy",
            qty=10,
            order_type="market",
        )
        
        result = await engine.check_order(
            order=order,
            positions={},
            market_price=Decimal("50"),
        )
        
        assert result.action == RiskAction.REJECT
        assert any("SYMBOL_BLOCKED" in f for f in result.checks_failed)
    
    @pytest.mark.asyncio
    async def test_allowed_symbols_whitelist(self):
        limits = RiskLimits(allowed_symbols={"AAPL", "MSFT", "GOOGL"})
        engine = RiskEngine(limits=limits)
        
        # Allowed symbol
        order = Order(symbol="AAPL", side="buy", qty=10, order_type="market")
        result = await engine.check_order(order, {}, Decimal("150"))
        assert result.action == RiskAction.APPROVE
        
        # Not allowed symbol
        order = Order(symbol="TSLA", side="buy", qty=10, order_type="market")
        result = await engine.check_order(order, {}, Decimal("250"))
        assert result.action == RiskAction.REJECT
        assert any("SYMBOL_NOT_ALLOWED" in f for f in result.checks_failed)
    
    def test_get_status(self, engine):
        status = engine.get_status()
        
        assert "kill_switch" in status
        assert "circuit_breaker" in status
        assert "dry_run" in status
        assert "daily_pnl" in status
        assert "spend_remaining" in status


class TestRiskCheckResult:
    """Test risk check results."""
    
    def test_approved_property(self):
        result = RiskCheckResult(
            action=RiskAction.APPROVE,
            checks_passed=["test"],
            checks_failed=[],
            warnings=[],
        )
        assert result.approved is True
    
    def test_rejected_property(self):
        result = RiskCheckResult(
            action=RiskAction.REJECT,
            checks_passed=[],
            checks_failed=["test"],
            warnings=[],
        )
        assert result.approved is False
    
    def test_dry_run_counts_as_approved(self):
        result = RiskCheckResult(
            action=RiskAction.DRY_RUN,
            checks_passed=["test"],
            checks_failed=[],
            warnings=[],
        )
        assert result.approved is True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
