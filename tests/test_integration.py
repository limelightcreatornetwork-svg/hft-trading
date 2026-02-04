"""
Integration Tests for HFT Trading System

These tests require real API credentials to run.
Set environment variables before running:
- ALPACA_PAPER_API_KEY
- ALPACA_PAPER_API_SECRET

Run with: pytest tests/test_integration.py -v -s --integration
"""

import pytest
import asyncio
import os
from decimal import Decimal
from datetime import datetime

# Skip if no credentials
pytestmark = pytest.mark.skipif(
    not os.environ.get("ALPACA_PAPER_API_KEY"),
    reason="Integration tests require API credentials"
)


class TestAlpacaIntegration:
    """Integration tests for Alpaca broker."""
    
    @pytest.fixture
    async def alpaca_client(self):
        from src.brokers.alpaca import AlpacaClient, AlpacaConfig, AlpacaEnvironment
        
        config = AlpacaConfig(
            api_key=os.environ["ALPACA_PAPER_API_KEY"],
            api_secret=os.environ["ALPACA_PAPER_API_SECRET"],
            environment=AlpacaEnvironment.PAPER,
        )
        client = AlpacaClient(config)
        yield client
        await client.close()
    
    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_get_account(self, alpaca_client):
        """Test getting account information."""
        account = await alpaca_client.get_account()
        
        assert "id" in account
        assert "equity" in account
        assert "cash" in account
        assert "buying_power" in account
        
        print(f"Account: {account['id']}")
        print(f"Equity: ${account['equity']}")
    
    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_get_positions(self, alpaca_client):
        """Test getting positions."""
        positions = await alpaca_client.get_positions()
        
        assert isinstance(positions, list)
        print(f"Open positions: {len(positions)}")
    
    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_get_latest_quote(self, alpaca_client):
        """Test getting market quote."""
        quote = await alpaca_client.get_latest_quote("AAPL")
        
        assert "quote" in quote
        q = quote["quote"]
        assert "bp" in q  # bid price
        assert "ap" in q  # ask price
        
        print(f"AAPL: Bid ${q['bp']}, Ask ${q['ap']}")
    
    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_get_snapshot(self, alpaca_client):
        """Test getting market snapshot."""
        snapshot = await alpaca_client.get_snapshot("AAPL")
        
        assert "latestQuote" in snapshot or "latestTrade" in snapshot
        print(f"Snapshot received for AAPL")
    
    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_get_bars(self, alpaca_client):
        """Test getting historical bars."""
        bars = await alpaca_client.get_bars(
            "AAPL",
            timeframe="1Day",
            limit=5,
        )
        
        assert "bars" in bars
        assert len(bars["bars"]) > 0
        
        for bar in bars["bars"]:
            assert "o" in bar  # open
            assert "h" in bar  # high
            assert "l" in bar  # low
            assert "c" in bar  # close
            assert "v" in bar  # volume
        
        print(f"Received {len(bars['bars'])} daily bars")
    
    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_list_orders(self, alpaca_client):
        """Test listing orders."""
        orders = await alpaca_client.list_orders(status="all", limit=10)
        
        assert isinstance(orders, list)
        print(f"Recent orders: {len(orders)}")
    
    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_rate_limiting(self, alpaca_client):
        """Test that rate limiting works correctly."""
        # Make several requests in quick succession
        start = datetime.now()
        
        for i in range(5):
            await alpaca_client.get_account()
        
        elapsed = (datetime.now() - start).total_seconds()
        print(f"5 requests completed in {elapsed:.2f}s")
        
        # Should not take excessively long with 200 req/min limit
        assert elapsed < 5.0


class TestToolsIntegration:
    """Integration tests for agent tools."""
    
    @pytest.fixture
    async def trading_system(self):
        from src.main import TradingSystem
        
        system = TradingSystem(paper=True, dry_run=True)
        await system.initialize()
        yield system
        await system.shutdown()
    
    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_market_data_tool(self, trading_system):
        """Test market data tool."""
        tool = trading_system.market_data
        
        # Get snapshot
        snapshot = await tool.get_snapshot("AAPL")
        
        assert snapshot.symbol == "AAPL"
        assert snapshot.latest_quote is not None
        
        print(f"AAPL mid price: ${snapshot.latest_quote.mid_price}")
    
    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_portfolio_tool(self, trading_system):
        """Test portfolio tool."""
        tool = trading_system.portfolio
        
        # Get account
        account = await tool.get_account()
        
        assert account.equity > 0
        print(f"Account equity: ${account.equity}")
        
        # Get positions
        positions = await tool.get_positions()
        print(f"Open positions: {len(positions)}")
    
    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_risk_tool(self, trading_system):
        """Test risk tool."""
        tool = trading_system.risk
        
        # Get status
        status = tool.get_status()
        
        assert status.kill_switch_active is False
        print(f"Circuit breaker: {status.circuit_breaker_state}")
        
        # Pre-trade check
        check = await tool.check_order(
            symbol="AAPL",
            side="buy",
            qty=10,
            order_type="market",
        )
        
        print(f"Pre-trade check: {check.action}")
        print(f"Checks passed: {check.checks_passed}")
    
    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_order_tool_dry_run(self, trading_system):
        """Test order tool in dry-run mode."""
        from src.tools.order import OrderRequest, OrderSide, OrderType
        
        tool = trading_system.order
        
        # Place a dry-run order
        request = OrderRequest(
            symbol="AAPL",
            side=OrderSide.BUY,
            qty=10,
            order_type=OrderType.MARKET,
        )
        
        result = await tool.place_order(request)
        
        # Should succeed in dry-run mode
        assert result.success is True
        assert "DRY_RUN" in (result.error or "")
        
        print("Dry-run order simulated successfully")


class TestStatusMonitor:
    """Integration tests for status monitoring."""
    
    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_check_alpaca_health(self):
        """Test Alpaca health check."""
        from src.monitoring.status import StatusMonitor
        
        monitor = StatusMonitor()
        
        health = await monitor.check_alpaca()
        
        assert health.service == "alpaca"
        assert health.last_check is not None
        
        print(f"Alpaca status: {health.status.value}")
        print(f"Response time: {health.response_time_ms:.0f}ms")
    
    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_check_all_services(self):
        """Test checking all services."""
        from src.monitoring.status import StatusMonitor
        
        monitor = StatusMonitor()
        
        results = await monitor.check_all()
        
        assert "alpaca" in results

        print("\nService Status:")
        for service, health in results.items():
            status_emoji = "✓" if health.is_healthy else "✗"
            print(f"  {status_emoji} {service}: {health.status.value}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s", "--integration"])
