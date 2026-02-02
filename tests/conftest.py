"""
Pytest configuration and fixtures for HFT Trading System tests.
"""

import pytest
import asyncio
from decimal import Decimal

# Configure pytest-asyncio
def pytest_configure(config):
    config.addinivalue_line(
        "markers", "integration: mark test as integration test (requires API credentials)"
    )

@pytest.fixture(scope="session")
def event_loop():
    """Create an event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture
def risk_limits():
    """Default risk limits for testing."""
    from src.risk.engine import RiskLimits
    
    return RiskLimits(
        max_order_notional=Decimal("10000"),
        max_order_shares=100,
        max_position_notional=Decimal("50000"),
        max_position_shares=500,
        max_total_exposure=Decimal("100000"),
        max_concentration_pct=Decimal("0.25"),
        max_daily_loss=Decimal("5000"),
        max_weekly_loss=Decimal("15000"),
        max_drawdown_pct=Decimal("0.10"),
        daily_spend_limit=Decimal("50000"),
        weekly_spend_limit=Decimal("150000"),
        monthly_spend_limit=Decimal("500000"),
        approval_notional_threshold=Decimal("25000"),
        approval_loss_threshold=Decimal("2000"),
    )

@pytest.fixture
def risk_engine(risk_limits):
    """Risk engine instance for testing."""
    from src.risk.engine import RiskEngine
    
    return RiskEngine(limits=risk_limits)

@pytest.fixture
def sample_order():
    """Sample order for testing."""
    from src.risk.engine import Order
    
    return Order(
        symbol="AAPL",
        side="buy",
        qty=10,
        order_type="limit",
        limit_price=Decimal("150"),
    )

@pytest.fixture
def sample_position():
    """Sample position for testing."""
    from src.risk.engine import Position
    
    return Position(
        symbol="AAPL",
        qty=100,
        avg_entry_price=Decimal("145"),
        current_price=Decimal("150"),
        market_value=Decimal("15000"),
        unrealized_pnl=Decimal("500"),
    )
