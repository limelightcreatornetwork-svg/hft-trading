#!/usr/bin/env python3
"""
HFT Trading System - Main Entry Point

Usage:
    python -m src.main [options]

Commands:
    status      Show system status
    test        Run connection tests
    dry-run     Start in dry-run mode
    start       Start trading (USE WITH CAUTION)
"""

import asyncio
import argparse
import logging
import os
import sys
from decimal import Decimal
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.brokers.alpaca import AlpacaClient, AlpacaConfig, AlpacaEnvironment, AlpacaStream
from src.risk.engine import RiskEngine, RiskLimits, configure_risk_engine
from src.tools import MarketDataTool, OrderTool, PortfolioTool, RiskTool, JournalTool

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class TradingSystem:
    """Main trading system coordinator."""

    def __init__(self, paper: bool = True, dry_run: bool = False):
        self.paper = paper
        self.dry_run = dry_run

        # Clients
        self.alpaca_client = None
        self.alpaca_stream = None

        # Tools
        self.market_data = None
        self.order = None
        self.portfolio = None
        self.risk = None
        self.journal = None

        # Risk engine
        self.risk_engine = None

    async def initialize(self):
        """Initialize all components."""
        logger.info(f"Initializing trading system (paper={self.paper}, dry_run={self.dry_run})")

        # Initialize risk engine
        limits = RiskLimits(
            max_order_notional=Decimal("10000"),
            max_position_notional=Decimal("50000"),
            max_daily_loss=Decimal("5000"),
        )
        self.risk_engine = configure_risk_engine(limits, dry_run=self.dry_run)

        # Initialize journal
        self.journal = JournalTool()

        # Initialize Alpaca
        try:
            self.alpaca_client = self._create_alpaca_client()
            logger.info("Alpaca client initialized")
        except Exception as e:
            logger.warning(f"Alpaca initialization failed: {e}")

        # Initialize tools
        self.market_data = MarketDataTool(
            alpaca_client=self.alpaca_client,
        )

        self.portfolio = PortfolioTool(
            alpaca_client=self.alpaca_client,
            risk_engine=self.risk_engine,
            journal_tool=self.journal,
        )

        self.order = OrderTool(
            alpaca_client=self.alpaca_client,
            risk_engine=self.risk_engine,
            market_data_tool=self.market_data,
            journal_tool=self.journal,
        )

        self.risk = RiskTool(
            risk_engine=self.risk_engine,
            portfolio_tool=self.portfolio,
            market_data_tool=self.market_data,
        )

        logger.info("Trading system initialized")

    def _create_alpaca_client(self) -> AlpacaClient:
        """Create Alpaca client from environment."""
        prefix = "ALPACA_PAPER_" if self.paper else "ALPACA_"

        api_key = os.environ.get(f"{prefix}API_KEY")
        api_secret = os.environ.get(f"{prefix}API_SECRET")

        if not api_key or not api_secret:
            raise ValueError(f"Missing {prefix}API_KEY or {prefix}API_SECRET")

        config = AlpacaConfig(
            api_key=api_key,
            api_secret=api_secret,
            environment=AlpacaEnvironment.PAPER if self.paper else AlpacaEnvironment.LIVE,
        )
        return AlpacaClient(config)

    async def status(self):
        """Print system status."""
        print("\n=== HFT Trading System Status ===\n")

        print(f"Mode: {'PAPER' if self.paper else 'LIVE'}")
        print(f"Dry Run: {self.dry_run}")

        # Risk status
        if self.risk:
            status = self.risk.get_status()
            print(f"\nRisk Engine:")
            print(f"  Kill Switch: {status.kill_switch_active}")
            print(f"  Circuit Breaker: {status.circuit_breaker_state}")
            print(f"  Daily P&L: ${status.daily_pnl}")
            print(f"  Daily Spend Remaining: ${status.daily_spend_remaining}")

        # Alpaca account
        if self.alpaca_client:
            try:
                account = await self.alpaca_client.get_account()
                print(f"\nAlpaca Account:")
                print(f"  Equity: ${account['equity']}")
                print(f"  Cash: ${account['cash']}")
                print(f"  Buying Power: ${account['buying_power']}")
                print(f"  Day Trades: {account['daytrade_count']}")
            except Exception as e:
                print(f"\nAlpaca: Error - {e}")

        print()

    async def test_connections(self):
        """Test broker connections."""
        print("\n=== Connection Tests ===\n")

        # Test Alpaca
        print("Testing Alpaca...")
        if self.alpaca_client:
            try:
                account = await self.alpaca_client.get_account()
                print(f"  ✓ Account: {account['id']}")

                # Test market data
                quote = await self.alpaca_client.get_latest_quote("AAPL")
                print(f"  ✓ Market Data: AAPL quote received")

                print("  Alpaca: PASSED")
            except Exception as e:
                print(f"  ✗ Alpaca: FAILED - {e}")
        else:
            print("  ✗ Alpaca: Not configured")

        print()

    async def shutdown(self):
        """Clean shutdown."""
        logger.info("Shutting down trading system")

        if self.alpaca_client:
            await self.alpaca_client.close()

        logger.info("Shutdown complete")


async def main():
    parser = argparse.ArgumentParser(description="HFT Trading System")
    parser.add_argument("command", choices=["status", "test", "dry-run", "start"],
                        default="status", nargs="?", help="Command to run")
    parser.add_argument("--live", action="store_true", help="Use live trading (USE WITH CAUTION)")
    args = parser.parse_args()

    paper = not args.live
    dry_run = args.command == "dry-run"

    system = TradingSystem(paper=paper, dry_run=dry_run)

    try:
        await system.initialize()

        if args.command == "status":
            await system.status()
        elif args.command == "test":
            await system.test_connections()
        elif args.command in ("dry-run", "start"):
            await system.status()
            print("Trading system ready. Use tools to place orders.")
            # In a real system, you'd start the event loop here
    finally:
        await system.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
