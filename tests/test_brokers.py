"""
Tests for Broker Clients

Run with: pytest tests/test_brokers.py -v

Note: These tests are designed to work with mock data.
For integration tests, use test_integration.py with real API keys.
"""

import pytest
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
import asyncio

from src.brokers.alpaca import AlpacaClient, AlpacaConfig, AlpacaEnvironment, RateLimiter


class TestAlpacaConfig:
    """Test Alpaca configuration."""
    
    def test_paper_urls(self):
        config = AlpacaConfig(
            api_key="test_key",
            api_secret="test_secret",
            environment=AlpacaEnvironment.PAPER,
        )
        
        assert "paper" in config.base_url
        assert "paper" in config.trading_stream_url
    
    def test_live_urls(self):
        config = AlpacaConfig(
            api_key="test_key",
            api_secret="test_secret",
            environment=AlpacaEnvironment.LIVE,
        )
        
        assert "paper" not in config.base_url
        assert "paper" not in config.trading_stream_url
    
    def test_data_feed_options(self):
        config_iex = AlpacaConfig(
            api_key="test", api_secret="test", data_feed="iex"
        )
        config_sip = AlpacaConfig(
            api_key="test", api_secret="test", data_feed="sip"
        )
        
        assert "iex" in config_iex.stream_url
        assert "sip" in config_sip.stream_url


class TestRateLimiter:
    """Test rate limiter functionality."""
    
    @pytest.mark.asyncio
    async def test_acquire_within_limit(self):
        limiter = RateLimiter(requests_per_minute=200)
        
        # Should not block for first few requests
        for _ in range(10):
            await limiter.acquire()
        
        assert limiter.tokens >= 0
    
    @pytest.mark.asyncio
    async def test_rate_limit_delay(self):
        limiter = RateLimiter(requests_per_minute=60)  # 1 req/sec
        
        # Exhaust tokens
        limiter.tokens = 0
        
        start = asyncio.get_event_loop().time()
        await limiter.acquire()
        elapsed = asyncio.get_event_loop().time() - start
        
        # Should have waited approximately 1 second
        assert elapsed >= 0.9


class TestAlpacaClient:
    """Test Alpaca client with mocked responses."""
    
    @pytest.fixture
    def client(self):
        config = AlpacaConfig(
            api_key="test_key",
            api_secret="test_secret",
            environment=AlpacaEnvironment.PAPER,
        )
        return AlpacaClient(config)
    
    @pytest.mark.asyncio
    async def test_idempotent_order_submission(self, client):
        """Test that same client_order_id returns cached order."""
        # Mock the first submission
        mock_order = {
            "id": "order123",
            "client_order_id": "my-order-1",
            "status": "new",
            "filled_qty": "0",
        }
        
        with patch.object(client, '_request', new_callable=AsyncMock) as mock_request:
            mock_request.return_value = mock_order
            
            # First submission
            result1 = await client.submit_order(
                symbol="AAPL",
                qty=10,
                side="buy",
                order_type="market",
                client_order_id="my-order-1",
            )
            
            assert result1["id"] == "order123"
            
            # Second submission with same client_order_id should use cached
            # The get_order call will be made
            mock_request.return_value = mock_order
            result2 = await client.submit_order(
                symbol="AAPL",
                qty=10,
                side="buy",
                order_type="market",
                client_order_id="my-order-1",
            )
            
            # Should get same order
            assert result2["id"] == "order123"
    
    @pytest.mark.asyncio
    async def test_headers_include_auth(self, client):
        """Test that auth headers are set correctly."""
        headers = client.headers
        
        assert "APCA-API-KEY-ID" in headers
        assert headers["APCA-API-KEY-ID"] == "test_key"
        assert "APCA-API-SECRET-KEY" in headers
        assert headers["APCA-API-SECRET-KEY"] == "test_secret"
    
    @pytest.mark.asyncio
    async def test_close_all_positions_kill_switch(self, client):
        """Test kill switch closes all positions."""
        mock_result = [
            {"id": "pos1", "symbol": "AAPL"},
            {"id": "pos2", "symbol": "MSFT"},
        ]
        
        with patch.object(client, '_request', new_callable=AsyncMock) as mock_request:
            mock_request.return_value = mock_result
            
            result = await client.close_all_positions(cancel_orders=True)
            
            mock_request.assert_called_once()
            assert len(result) == 2


class TestAlpacaOrderTypes:
    """Test various order types."""
    
    @pytest.fixture
    def client(self):
        config = AlpacaConfig(
            api_key="test", api_secret="test",
            environment=AlpacaEnvironment.PAPER,
        )
        return AlpacaClient(config)
    
    @pytest.mark.asyncio
    async def test_market_order(self, client):
        """Test market order submission."""
        with patch.object(client, '_request', new_callable=AsyncMock) as mock_request:
            mock_request.return_value = {"id": "1", "status": "new"}
            
            await client.submit_order(
                symbol="AAPL",
                qty=10,
                side="buy",
                order_type="market",
            )
            
            # Verify the call
            call_kwargs = mock_request.call_args[1]
            json_data = call_kwargs["json"]
            
            assert json_data["type"] == "market"
            assert "limit_price" not in json_data
    
    @pytest.mark.asyncio
    async def test_limit_order(self, client):
        """Test limit order submission."""
        with patch.object(client, '_request', new_callable=AsyncMock) as mock_request:
            mock_request.return_value = {"id": "1", "status": "new"}
            
            await client.submit_order(
                symbol="AAPL",
                qty=10,
                side="buy",
                order_type="limit",
                limit_price=150.00,
            )
            
            call_kwargs = mock_request.call_args[1]
            json_data = call_kwargs["json"]
            
            assert json_data["type"] == "limit"
            assert json_data["limit_price"] == "150.0"
    
    @pytest.mark.asyncio
    async def test_stop_limit_order(self, client):
        """Test stop-limit order submission."""
        with patch.object(client, '_request', new_callable=AsyncMock) as mock_request:
            mock_request.return_value = {"id": "1", "status": "new"}
            
            await client.submit_order(
                symbol="AAPL",
                qty=10,
                side="sell",
                order_type="stop_limit",
                limit_price=145.00,
                stop_price=147.00,
            )
            
            call_kwargs = mock_request.call_args[1]
            json_data = call_kwargs["json"]
            
            assert json_data["type"] == "stop_limit"
            assert "limit_price" in json_data
            assert "stop_price" in json_data
    
    @pytest.mark.asyncio
    async def test_bracket_order(self, client):
        """Test bracket order submission."""
        with patch.object(client, '_request', new_callable=AsyncMock) as mock_request:
            mock_request.return_value = {"id": "1", "status": "new"}
            
            await client.submit_order(
                symbol="AAPL",
                qty=10,
                side="buy",
                order_type="limit",
                limit_price=150.00,
                order_class="bracket",
                take_profit={"limit_price": 160.00},
                stop_loss={"stop_price": 145.00},
            )
            
            call_kwargs = mock_request.call_args[1]
            json_data = call_kwargs["json"]
            
            assert json_data["order_class"] == "bracket"
            assert "take_profit" in json_data
            assert "stop_loss" in json_data
    
    @pytest.mark.asyncio
    async def test_trailing_stop_order(self, client):
        """Test trailing stop order submission."""
        with patch.object(client, '_request', new_callable=AsyncMock) as mock_request:
            mock_request.return_value = {"id": "1", "status": "new"}
            
            await client.submit_order(
                symbol="AAPL",
                qty=10,
                side="sell",
                order_type="trailing_stop",
                trail_percent=2.5,
            )
            
            call_kwargs = mock_request.call_args[1]
            json_data = call_kwargs["json"]
            
            assert json_data["trail_percent"] == "2.5"


class TestAlpacaTimeInForce:
    """Test time-in-force options."""
    
    @pytest.fixture
    def client(self):
        config = AlpacaConfig(
            api_key="test", api_secret="test",
            environment=AlpacaEnvironment.PAPER,
        )
        return AlpacaClient(config)
    
    @pytest.mark.asyncio
    @pytest.mark.parametrize("tif", ["day", "gtc", "ioc", "fok", "opg", "cls"])
    async def test_time_in_force_options(self, client, tif):
        """Test various TIF options."""
        with patch.object(client, '_request', new_callable=AsyncMock) as mock_request:
            mock_request.return_value = {"id": "1", "status": "new"}
            
            await client.submit_order(
                symbol="AAPL",
                qty=10,
                side="buy",
                order_type="limit",
                limit_price=150.00,
                time_in_force=tif,
            )
            
            call_kwargs = mock_request.call_args[1]
            json_data = call_kwargs["json"]
            
            assert json_data["time_in_force"] == tif


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
