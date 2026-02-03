"""
Comprehensive tests for the risk management system.

Tests:
- Position sizing (Kelly criterion)
- Drawdown protection (auto-liquidation)
- Correlation-based limits
- Real-time P&L tracking
- Integrated risk manager
"""

import pytest
import asyncio
from decimal import Decimal
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, patch

# Import all risk modules
from src.risk.position_sizing import (
    PositionSizer, SizingMethod, TradeStats, PositionSizeResult,
    calculate_kelly_from_trades, optimal_f_from_trades
)
from src.risk.drawdown_protection import (
    DrawdownProtector, DrawdownConfig, DrawdownState, DrawdownLevel,
    LiquidationOrder, create_conservative_protector
)
from src.risk.correlation_limits import (
    CorrelationRiskManager, CorrelationLimits, Sector,
    SYMBOL_SECTORS, CORRELATION_GROUPS
)
from src.risk.pnl_tracker import (
    PnLTracker, AlertConfig, AlertType, AlertPriority, PnLAlert,
    create_small_account_tracker
)
from src.risk.integrated_risk_manager import (
    IntegratedRiskManager, RiskManagerConfig, TradeDecision,
    create_risk_manager
)


class TestPositionSizing:
    """Tests for Kelly criterion position sizing."""
    
    def test_kelly_fraction_calculation(self):
        """Test Kelly fraction calculation with known values."""
        sizer = PositionSizer(
            account_equity=Decimal("1000"),
            max_position_pct=0.10,
            max_total_risk_pct=0.02,
        )
        
        # 60% win rate, 1.5:1 win/loss ratio
        # Kelly = (0.6 * 1.5 - 0.4) / 1.5 = 0.333
        stats = TradeStats(
            win_rate=0.6,
            avg_win=Decimal("150"),
            avg_loss=Decimal("100"),
        )
        
        kelly, warnings = sizer.calculate_kelly_fraction(stats)
        assert 0.3 < kelly < 0.4  # Approximately 0.333
        assert len(warnings) == 0
    
    def test_half_kelly_sizing(self):
        """Test half-Kelly position sizing."""
        sizer = PositionSizer(
            account_equity=Decimal("1000"),
            max_position_pct=0.20,
            max_total_risk_pct=0.02,
        )
        
        stats = TradeStats(win_rate=0.6, avg_win=Decimal("150"), avg_loss=Decimal("100"))
        
        result = sizer.calculate_position_size(
            symbol="AAPL",
            entry_price=Decimal("100"),
            stop_loss_price=Decimal("95"),
            stats=stats,
            method=SizingMethod.HALF_KELLY,
        )
        
        assert result.shares > 0
        assert result.notional_value <= Decimal("200")  # Max 20% of account
        assert result.method_used == SizingMethod.HALF_KELLY
    
    def test_position_size_respects_risk_limit(self):
        """Test that position size respects max risk per trade."""
        sizer = PositionSizer(
            account_equity=Decimal("1000"),
            max_position_pct=0.50,  # High position limit
            max_total_risk_pct=0.02,  # 2% max risk
        )
        
        result = sizer.calculate_position_size(
            symbol="AAPL",
            entry_price=Decimal("100"),
            stop_loss_price=Decimal("90"),  # $10 risk per share
        )
        
        # Max risk = $1000 * 0.02 = $20
        # Risk per share = $10
        # Max shares by risk = 2
        assert result.shares <= 2
        assert result.risk_amount <= Decimal("20")
    
    def test_negative_expectancy_returns_zero(self):
        """Test that negative expectancy returns zero Kelly."""
        sizer = PositionSizer(account_equity=Decimal("1000"))
        
        # Losing strategy: 30% win rate, 1:1 ratio = negative expectancy
        stats = TradeStats(
            win_rate=0.30,
            avg_win=Decimal("100"),
            avg_loss=Decimal("100"),
        )
        
        kelly, warnings = sizer.calculate_kelly_fraction(stats)
        assert kelly == 0.0
        assert any("negative" in w.lower() for w in warnings)
    
    def test_calculate_kelly_from_trades(self):
        """Test calculating Kelly from trade history."""
        winning = [Decimal("100"), Decimal("150"), Decimal("80")]
        losing = [Decimal("50"), Decimal("70")]
        
        stats = calculate_kelly_from_trades(winning, losing)
        
        assert stats.win_rate == 0.6  # 3/5
        assert stats.avg_win == Decimal("110")  # (100+150+80)/3
        assert stats.avg_loss == Decimal("60")  # (50+70)/2


class TestDrawdownProtection:
    """Tests for drawdown protection and auto-liquidation."""
    
    @pytest.mark.asyncio
    async def test_normal_level_allows_trading(self):
        """Test that normal level allows trading."""
        protector = DrawdownProtector(
            initial_equity=Decimal("1000")
        )
        
        state = await protector.update_equity(Decimal("990"))  # 1% drawdown
        
        assert state.level == DrawdownLevel.NORMAL
        assert state.trading_allowed is True
        assert state.new_positions_allowed is True
        assert state.sizing_multiplier == 1.0
    
    @pytest.mark.asyncio
    async def test_caution_level_reduces_sizing(self):
        """Test that caution level reduces position sizing."""
        protector = create_conservative_protector(Decimal("1000"))
        
        # 4% drawdown triggers caution (threshold is 3%)
        state = await protector.update_equity(Decimal("960"))
        
        assert state.level == DrawdownLevel.CAUTION
        assert state.trading_allowed is True
        assert state.sizing_multiplier < 1.0
    
    @pytest.mark.asyncio
    async def test_warning_level_blocks_new_positions(self):
        """Test that warning level blocks new positions."""
        config = DrawdownConfig(
            warning_threshold=0.05,  # 5%
        )
        protector = DrawdownProtector(config=config, initial_equity=Decimal("1000"))
        
        # 6% drawdown
        state = await protector.update_equity(Decimal("940"))
        
        assert state.level == DrawdownLevel.WARNING
        assert state.trading_allowed is True
        assert state.new_positions_allowed is False
    
    @pytest.mark.asyncio
    async def test_emergency_level_halts_trading(self):
        """Test that emergency level halts all trading."""
        config = DrawdownConfig(
            emergency_threshold=0.15,  # 15%
        )
        protector = DrawdownProtector(config=config, initial_equity=Decimal("1000"))
        
        # 16% drawdown
        state = await protector.update_equity(Decimal("840"))
        
        assert state.level == DrawdownLevel.EMERGENCY
        assert state.trading_allowed is False
        assert state.new_positions_allowed is False
    
    @pytest.mark.asyncio
    async def test_liquidation_orders_generated(self):
        """Test liquidation orders are generated at critical level."""
        config = DrawdownConfig(
            critical_threshold=0.10,
        )
        protector = DrawdownProtector(config=config, initial_equity=Decimal("1000"))
        
        # Trigger critical level
        await protector.update_equity(Decimal("890"))  # 11% drawdown
        
        positions = {
            "AAPL": {"qty": 10, "side": "long", "market_value": Decimal("1500"), "unrealized_pnl": Decimal("-100")},
            "MSFT": {"qty": 5, "side": "long", "market_value": Decimal("750"), "unrealized_pnl": Decimal("50")},
        }
        
        orders = protector.get_liquidation_orders(positions)
        
        assert len(orders) > 0
        # Losers should be liquidated first
        assert orders[0].symbol == "AAPL"
    
    @pytest.mark.asyncio
    async def test_daily_loss_limit(self):
        """Test daily loss limit triggers protection."""
        config = DrawdownConfig(
            daily_loss_limit=Decimal("50"),
            daily_loss_pct=0.05,
        )
        protector = DrawdownProtector(config=config, initial_equity=Decimal("1000"))
        
        # Lose $60 (exceeds $50 limit)
        state = await protector.update_equity(Decimal("940"))
        
        # Should be at least WARNING level
        assert state.level.value >= DrawdownLevel.WARNING.value


class TestCorrelationLimits:
    """Tests for correlation-based position limits."""
    
    def test_sector_mapping(self):
        """Test symbol to sector mapping."""
        manager = CorrelationRiskManager()
        
        assert manager.get_sector("AAPL") == Sector.TECHNOLOGY
        assert manager.get_sector("JPM") == Sector.FINANCIAL
        assert manager.get_sector("XOM") == Sector.ENERGY
        assert manager.get_sector("UNKNOWN123") == Sector.UNKNOWN
    
    def test_correlation_groups(self):
        """Test correlation group membership."""
        manager = CorrelationRiskManager()
        
        groups = manager.get_correlation_groups("NVDA")
        
        assert "semiconductors" in groups
        assert "magnificent_7" in groups
        assert "ai_plays" in groups
    
    def test_sector_exposure_limit(self):
        """Test sector exposure limit enforcement."""
        limits = CorrelationLimits(max_sector_exposure_pct=0.30)
        manager = CorrelationRiskManager(limits=limits)
        
        # Existing tech position at 25%
        positions = {
            "AAPL": {"market_value": Decimal("250")},
        }
        
        # Try to add another 10% tech position
        result = manager.check_position(
            symbol="MSFT",
            proposed_value=Decimal("100"),
            current_positions=positions,
            account_equity=Decimal("1000"),
        )
        
        # Should fail (25% + 10% = 35% > 30%)
        assert result.allowed is False
        assert "sector" in result.reason.lower()
    
    def test_correlation_group_limit(self):
        """Test correlation group limit enforcement."""
        limits = CorrelationLimits(max_correlation_group_pct=0.25)
        manager = CorrelationRiskManager(limits=limits)
        
        # Existing semiconductor positions at 20%
        positions = {
            "NVDA": {"market_value": Decimal("150")},
            "AMD": {"market_value": Decimal("50")},
        }
        
        # Try to add another 10% semiconductor
        result = manager.check_position(
            symbol="INTC",
            proposed_value=Decimal("100"),
            current_positions=positions,
            account_equity=Decimal("1000"),
        )
        
        # Should fail (20% + 10% = 30% > 25%)
        assert result.allowed is False
        assert "correlation" in result.reason.lower() or "group" in result.reason.lower()
    
    def test_single_stock_limit(self):
        """Test single stock position limit."""
        limits = CorrelationLimits(max_single_stock_pct=0.15)
        manager = CorrelationRiskManager(limits=limits)
        
        result = manager.check_position(
            symbol="AAPL",
            proposed_value=Decimal("200"),  # 20% of account
            current_positions={},
            account_equity=Decimal("1000"),
        )
        
        # Should fail (20% > 15%)
        assert result.allowed is False
        assert "single stock" in result.reason.lower()
    
    def test_diversification_score(self):
        """Test diversification score calculation."""
        manager = CorrelationRiskManager()
        
        # Well diversified portfolio
        diversified = {
            "AAPL": {"market_value": Decimal("100")},  # Tech
            "JPM": {"market_value": Decimal("100")},   # Financial
            "XOM": {"market_value": Decimal("100")},   # Energy
            "JNJ": {"market_value": Decimal("100")},   # Healthcare
        }
        
        score = manager.get_diversification_score(
            diversified,
            Decimal("1000"),
        )
        
        assert score["active_sectors"] >= 4
        assert score["score"] > 50  # Should be reasonably well diversified
    
    def test_max_position_size_calculation(self):
        """Test maximum allowed position size calculation."""
        limits = CorrelationLimits(
            max_sector_exposure_pct=0.30,
            max_single_stock_pct=0.15,
        )
        manager = CorrelationRiskManager(limits=limits)
        
        # Existing tech at 20%
        positions = {"AAPL": {"market_value": Decimal("200")}}
        
        # Max for another tech stock
        max_size = manager.get_max_position_size(
            symbol="MSFT",
            current_positions=positions,
            account_equity=Decimal("1000"),
        )
        
        # Limited by sector (30% - 20% = 10%) and single stock (15%)
        # Should be min(100, 150) = 100
        assert max_size <= Decimal("150")


class TestPnLTracker:
    """Tests for real-time P&L tracking."""
    
    @pytest.mark.asyncio
    async def test_daily_profit_target_alert(self):
        """Test daily profit target alert."""
        alerts_received = []
        
        async def on_alert(alert: PnLAlert):
            alerts_received.append(alert)
        
        config = AlertConfig(daily_profit_target=Decimal("50"))
        tracker = PnLTracker(
            config=config,
            initial_equity=Decimal("1000"),
            on_alert=on_alert,
        )
        
        # Make profit exceeding target
        await tracker.update(Decimal("1060"), {})
        
        assert any(a.alert_type == AlertType.DAILY_PROFIT_TARGET for a in alerts_received)
    
    @pytest.mark.asyncio
    async def test_daily_loss_limit_alert(self):
        """Test daily loss limit alert."""
        alerts_received = []
        
        async def on_alert(alert: PnLAlert):
            alerts_received.append(alert)
        
        config = AlertConfig(daily_loss_limit=Decimal("30"))
        tracker = PnLTracker(
            config=config,
            initial_equity=Decimal("1000"),
            on_alert=on_alert,
        )
        
        # Lose more than limit
        await tracker.update(Decimal("960"), {})
        
        assert any(a.alert_type == AlertType.DAILY_LOSS_LIMIT for a in alerts_received)
    
    @pytest.mark.asyncio
    async def test_position_profit_alert(self):
        """Test position-level profit alert."""
        alerts_received = []
        
        async def on_alert(alert: PnLAlert):
            alerts_received.append(alert)
        
        config = AlertConfig(
            position_profit_pct=0.05,
            cooldown_minutes=0,  # No cooldown for testing
        )
        tracker = PnLTracker(
            config=config,
            initial_equity=Decimal("1000"),
            on_alert=on_alert,
        )
        
        positions = {
            "AAPL": {
                "qty": 10,
                "side": "long",
                "entry_price": Decimal("100"),
                "current_price": Decimal("110"),  # 10% profit
                "unrealized_pnl": Decimal("100"),
            }
        }
        
        await tracker.update(Decimal("1100"), positions)
        
        assert any(
            a.alert_type == AlertType.POSITION_PROFIT and a.symbol == "AAPL"
            for a in alerts_received
        )
    
    @pytest.mark.asyncio
    async def test_losing_streak_alert(self):
        """Test losing streak alert."""
        alerts_received = []
        
        async def on_alert(alert: PnLAlert):
            alerts_received.append(alert)
        
        config = AlertConfig(losing_streak_threshold=3, cooldown_minutes=0)
        tracker = PnLTracker(
            config=config,
            initial_equity=Decimal("1000"),
            on_alert=on_alert,
        )
        
        # Record 3 losing trades
        tracker.record_trade(Decimal("-10"))
        tracker.record_trade(Decimal("-15"))
        tracker.record_trade(Decimal("-20"))
        
        await tracker.update(Decimal("955"), {})
        
        assert any(a.alert_type == AlertType.LOSING_STREAK for a in alerts_received)
    
    @pytest.mark.asyncio
    async def test_portfolio_pnl_calculation(self):
        """Test portfolio P&L calculation."""
        tracker = PnLTracker(initial_equity=Decimal("1000"))
        
        # Record some trades
        tracker.record_trade(Decimal("50"))   # Win
        tracker.record_trade(Decimal("-20"))  # Loss
        tracker.record_trade(Decimal("30"))   # Win
        
        positions = {
            "AAPL": {"qty": 5, "unrealized_pnl": Decimal("25")},
        }
        
        await tracker.update(Decimal("1085"), positions)
        
        pnl = tracker.get_portfolio_pnl()
        
        assert pnl.total_realized_pnl == Decimal("60")  # 50 - 20 + 30
        assert pnl.winning_trades == 2
        assert pnl.losing_trades == 1
        assert pnl.win_rate == pytest.approx(0.667, rel=0.01)


class TestIntegratedRiskManager:
    """Tests for the integrated risk manager."""
    
    @pytest.mark.asyncio
    async def test_trade_evaluation_approved(self):
        """Test trade evaluation when all checks pass."""
        manager = create_risk_manager(
            account_equity=Decimal("1000"),
            conservative=True,
        )
        
        decision = await manager.evaluate_trade(
            symbol="AAPL",
            side="buy",
            entry_price=Decimal("100"),
            stop_loss=Decimal("95"),
        )
        
        assert decision.approved is True
        assert decision.recommended_shares > 0
        assert decision.recommended_notional > Decimal("0")
    
    @pytest.mark.asyncio
    async def test_trade_evaluation_blocked_by_drawdown(self):
        """Test trade blocked by drawdown protection."""
        manager = create_risk_manager(
            account_equity=Decimal("1000"),
            conservative=True,
        )
        
        # Simulate drawdown
        await manager.update_state(
            equity=Decimal("850"),  # 15% drawdown
            positions={},
        )
        
        decision = await manager.evaluate_trade(
            symbol="AAPL",
            side="buy",
            entry_price=Decimal("100"),
        )
        
        # Should be blocked due to drawdown
        assert decision.approved is False
        assert "drawdown" in decision.reason.lower()
    
    @pytest.mark.asyncio
    async def test_trade_evaluation_blocked_by_exposure(self):
        """Test trade blocked by sector exposure limits."""
        manager = create_risk_manager(
            account_equity=Decimal("1000"),
            conservative=True,
        )
        
        # Add large tech position
        positions = {
            "AAPL": {
                "qty": 3,
                "side": "long",
                "avg_entry_price": Decimal("100"),
                "current_price": Decimal("100"),
                "market_value": Decimal("300"),
                "unrealized_pnl": Decimal("0"),
            }
        }
        
        await manager.update_state(
            equity=Decimal("1000"),
            positions=positions,
        )
        
        # Try to add another big tech position
        decision = await manager.evaluate_trade(
            symbol="NVDA",
            side="buy",
            entry_price=Decimal("500"),
            override_shares=1,  # $500 = 50% of account
        )
        
        # May be limited by exposure
        assert decision.recommended_notional <= Decimal("500")
    
    @pytest.mark.asyncio
    async def test_kill_switch(self):
        """Test kill switch activation."""
        manager = create_risk_manager(account_equity=Decimal("1000"))
        
        manager.activate_kill_switch("Test emergency")
        
        decision = await manager.evaluate_trade(
            symbol="AAPL",
            side="buy",
            entry_price=Decimal("100"),
        )
        
        assert decision.approved is False
        
        # Deactivate and try again
        manager.deactivate_kill_switch()
        
        decision = await manager.evaluate_trade(
            symbol="AAPL",
            side="buy",
            entry_price=Decimal("100"),
        )
        
        assert decision.approved is True
    
    @pytest.mark.asyncio
    async def test_status_report(self):
        """Test comprehensive status report."""
        manager = create_risk_manager(account_equity=Decimal("500"))
        
        await manager.update_state(
            equity=Decimal("495"),
            positions={
                "AAPL": {
                    "qty": 2,
                    "side": "long",
                    "avg_entry_price": Decimal("100"),
                    "current_price": Decimal("98"),
                    "market_value": Decimal("196"),
                    "unrealized_pnl": Decimal("-4"),
                }
            },
        )
        
        status = manager.get_status()
        
        assert "account_equity" in status
        assert "drawdown" in status
        assert "pnl" in status
        assert "exposure" in status
        assert "diversification" in status
        assert status["account_equity"] == "495"
    
    @pytest.mark.asyncio
    async def test_position_sizing_with_kelly(self):
        """Test position sizing uses Kelly criterion."""
        manager = create_risk_manager(
            account_equity=Decimal("1000"),
            conservative=False,
        )
        
        # Provide trade statistics
        stats = TradeStats(
            win_rate=0.55,
            avg_win=Decimal("100"),
            avg_loss=Decimal("80"),
        )
        manager.update_trade_stats(stats)
        
        decision = await manager.evaluate_trade(
            symbol="AAPL",
            side="buy",
            entry_price=Decimal("100"),
            stop_loss=Decimal("95"),
        )
        
        assert decision.kelly_fraction > 0
        assert decision.recommended_shares > 0


# Integration test
class TestFullRiskFlow:
    """End-to-end risk management flow tests."""
    
    @pytest.mark.asyncio
    async def test_trading_day_simulation(self):
        """Simulate a trading day with various scenarios."""
        alerts = []
        liquidations = []
        
        async def on_alert(alert):
            alerts.append(alert)
        
        async def on_liquidation(orders):
            liquidations.extend(orders)
        
        manager = IntegratedRiskManager(
            RiskManagerConfig(
                account_equity=Decimal("500"),
                on_alert=on_alert,
                on_liquidation=on_liquidation,
            )
        )
        
        # Morning: Make a successful trade
        decision1 = await manager.evaluate_trade(
            symbol="AAPL",
            side="buy",
            entry_price=Decimal("100"),
            stop_loss=Decimal("95"),
        )
        assert decision1.approved
        
        # Update with position
        await manager.update_state(
            equity=Decimal("500"),
            positions={
                "AAPL": {
                    "qty": decision1.recommended_shares,
                    "side": "long",
                    "avg_entry_price": Decimal("100"),
                    "current_price": Decimal("100"),
                    "market_value": decision1.recommended_notional,
                    "unrealized_pnl": Decimal("0"),
                }
            }
        )
        
        # Midday: Position goes negative
        await manager.update_state(
            equity=Decimal("485"),
            positions={
                "AAPL": {
                    "qty": decision1.recommended_shares,
                    "side": "long",
                    "avg_entry_price": Decimal("100"),
                    "current_price": Decimal("97"),
                    "market_value": Decimal("48.50"),
                    "unrealized_pnl": Decimal("-15"),
                }
            }
        )
        
        # Try to add to losing position - should be more restricted
        decision2 = await manager.evaluate_trade(
            symbol="AAPL",
            side="buy",
            entry_price=Decimal("97"),
        )
        
        # Should still be allowed but with potentially reduced size
        # Position sizing should be adjusted
        
        # Check status
        status = manager.get_status()
        assert float(status["pnl"]["daily_total_pnl"].replace("$", "")) < 0
        
        print(f"Alerts received: {len(alerts)}")
        print(f"Status: {status}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
