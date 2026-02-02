"""
Portfolio Tool

Provides:
- Account balances and buying power
- Position tracking with P&L
- Portfolio analytics
- Kill switch functionality
"""

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Optional, Dict, List, Any

logger = logging.getLogger(__name__)


@dataclass
class AccountInfo:
    """Account summary information."""
    account_id: str
    equity: Decimal
    cash: Decimal
    buying_power: Decimal
    portfolio_value: Decimal
    
    # Day trading specific
    daytrade_count: int = 0
    daytrading_buying_power: Decimal = Decimal("0")
    
    # Margin info
    maintenance_margin: Decimal = Decimal("0")
    initial_margin: Decimal = Decimal("0")
    
    # Status
    pattern_day_trader: bool = False
    trading_blocked: bool = False
    transfers_blocked: bool = False
    account_blocked: bool = False
    
    # Crypto (if enabled)
    crypto_status: Optional[str] = None
    
    @property
    def margin_usage_pct(self) -> Decimal:
        if self.portfolio_value > 0:
            return self.maintenance_margin / self.portfolio_value
        return Decimal("0")


@dataclass
class PositionInfo:
    """Detailed position information."""
    symbol: str
    qty: int
    side: str  # "long" or "short"
    avg_entry_price: Decimal
    current_price: Decimal
    market_value: Decimal
    cost_basis: Decimal
    unrealized_pnl: Decimal
    unrealized_pnl_pct: Decimal
    
    # Intraday
    unrealized_intraday_pnl: Decimal = Decimal("0")
    unrealized_intraday_pnl_pct: Decimal = Decimal("0")
    
    # Change
    change_today: Decimal = Decimal("0")
    
    # Asset info
    asset_class: str = "us_equity"
    asset_id: Optional[str] = None
    exchange: Optional[str] = None
    
    @property
    def is_profitable(self) -> bool:
        return self.unrealized_pnl > 0
    
    @property
    def position_size_pct(self) -> Decimal:
        """Position size as % of market value (useful with account equity)."""
        return abs(self.market_value) / Decimal("100")  # Will be adjusted


@dataclass
class PortfolioSummary:
    """Complete portfolio summary."""
    account: AccountInfo
    positions: List[PositionInfo]
    total_unrealized_pnl: Decimal
    total_realized_pnl_today: Decimal
    
    # Concentration
    largest_position_pct: Decimal
    position_count: int
    
    # Exposure
    long_exposure: Decimal
    short_exposure: Decimal
    net_exposure: Decimal
    gross_exposure: Decimal
    
    timestamp: datetime = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now()


class PortfolioTool:
    """
    Agent tool for portfolio management and monitoring.
    
    Usage:
        tool = PortfolioTool(alpaca_client)
        
        # Get account info
        account = await tool.get_account()
        
        # Get all positions with P&L
        positions = await tool.get_positions()
        
        # Get full portfolio summary
        summary = await tool.get_portfolio_summary()
        
        # Emergency: close all positions
        await tool.close_all_positions()
    """
    
    def __init__(
        self,
        alpaca_client=None,
        kalshi_client=None,
        risk_engine=None,
        journal_tool=None,
    ):
        self.alpaca = alpaca_client
        self.kalshi = kalshi_client
        self.risk_engine = risk_engine
        self.journal = journal_tool
        
        # Cache for performance
        self._account_cache: Optional[AccountInfo] = None
        self._positions_cache: Optional[List[PositionInfo]] = None
        self._cache_timestamp: Optional[datetime] = None
        self._cache_ttl_seconds: int = 5
    
    async def get_account(self, use_cache: bool = True) -> AccountInfo:
        """
        Get account information.
        
        Args:
            use_cache: Use cached data if available (default: True)
        
        Returns:
            AccountInfo with balances and status
        """
        if use_cache and self._account_cache and self._cache_timestamp:
            age = (datetime.now() - self._cache_timestamp).total_seconds()
            if age < self._cache_ttl_seconds:
                return self._account_cache
        
        if self.alpaca:
            data = await self.alpaca.get_account()
            
            account = AccountInfo(
                account_id=data["id"],
                equity=Decimal(data["equity"]),
                cash=Decimal(data["cash"]),
                buying_power=Decimal(data["buying_power"]),
                portfolio_value=Decimal(data["portfolio_value"]),
                daytrade_count=int(data.get("daytrade_count", 0)),
                daytrading_buying_power=Decimal(data.get("daytrading_buying_power", "0")),
                maintenance_margin=Decimal(data.get("maintenance_margin", "0")),
                initial_margin=Decimal(data.get("initial_margin", "0")),
                pattern_day_trader=data.get("pattern_day_trader", False),
                trading_blocked=data.get("trading_blocked", False),
                transfers_blocked=data.get("transfers_blocked", False),
                account_blocked=data.get("account_blocked", False),
                crypto_status=data.get("crypto_status"),
            )
            
            self._account_cache = account
            self._cache_timestamp = datetime.now()
            
            return account
        
        raise ValueError("No broker client available")
    
    async def get_positions(self, use_cache: bool = True) -> List[PositionInfo]:
        """
        Get all open positions with P&L.
        
        Args:
            use_cache: Use cached data if available
        
        Returns:
            List of PositionInfo objects
        """
        if use_cache and self._positions_cache and self._cache_timestamp:
            age = (datetime.now() - self._cache_timestamp).total_seconds()
            if age < self._cache_ttl_seconds:
                return self._positions_cache
        
        positions = []
        
        if self.alpaca:
            data = await self.alpaca.get_positions()
            
            for p in data:
                qty = int(p["qty"])
                positions.append(PositionInfo(
                    symbol=p["symbol"],
                    qty=abs(qty),
                    side="long" if qty > 0 else "short",
                    avg_entry_price=Decimal(p["avg_entry_price"]),
                    current_price=Decimal(p["current_price"]),
                    market_value=Decimal(p["market_value"]),
                    cost_basis=Decimal(p["cost_basis"]),
                    unrealized_pnl=Decimal(p["unrealized_pl"]),
                    unrealized_pnl_pct=Decimal(p["unrealized_plpc"]),
                    unrealized_intraday_pnl=Decimal(p.get("unrealized_intraday_pl", "0")),
                    unrealized_intraday_pnl_pct=Decimal(p.get("unrealized_intraday_plpc", "0")),
                    change_today=Decimal(p.get("change_today", "0")),
                    asset_class=p.get("asset_class", "us_equity"),
                    asset_id=p.get("asset_id"),
                    exchange=p.get("exchange"),
                ))
            
            self._positions_cache = positions
            self._cache_timestamp = datetime.now()
        
        return positions
    
    async def get_position(self, symbol: str) -> Optional[PositionInfo]:
        """Get position for a specific symbol."""
        positions = await self.get_positions()
        for p in positions:
            if p.symbol == symbol:
                return p
        return None
    
    async def get_portfolio_summary(self) -> PortfolioSummary:
        """
        Get complete portfolio summary with analytics.
        
        Returns:
            PortfolioSummary with account, positions, and metrics
        """
        account = await self.get_account()
        positions = await self.get_positions()
        
        # Calculate metrics
        total_unrealized_pnl = sum(p.unrealized_pnl for p in positions)
        
        # Get realized P&L from activities (if available)
        total_realized_pnl_today = Decimal("0")
        
        # Exposure calculations
        long_exposure = sum(p.market_value for p in positions if p.side == "long")
        short_exposure = sum(abs(p.market_value) for p in positions if p.side == "short")
        net_exposure = long_exposure - short_exposure
        gross_exposure = long_exposure + short_exposure
        
        # Concentration
        largest_position_pct = Decimal("0")
        if positions and account.equity > 0:
            largest_position_pct = max(
                abs(p.market_value) / account.equity for p in positions
            )
        
        return PortfolioSummary(
            account=account,
            positions=positions,
            total_unrealized_pnl=total_unrealized_pnl,
            total_realized_pnl_today=total_realized_pnl_today,
            largest_position_pct=largest_position_pct,
            position_count=len(positions),
            long_exposure=long_exposure,
            short_exposure=short_exposure,
            net_exposure=net_exposure,
            gross_exposure=gross_exposure,
        )
    
    async def get_buying_power(self) -> Decimal:
        """Get current buying power."""
        account = await self.get_account()
        return account.buying_power
    
    async def get_equity(self) -> Decimal:
        """Get current account equity."""
        account = await self.get_account()
        return account.equity
    
    async def get_pnl(self, symbol: Optional[str] = None) -> Dict[str, Decimal]:
        """
        Get P&L summary.
        
        Args:
            symbol: Optional symbol filter
        
        Returns:
            Dict with unrealized/realized P&L
        """
        if symbol:
            position = await self.get_position(symbol)
            if position:
                return {
                    "unrealized": position.unrealized_pnl,
                    "unrealized_pct": position.unrealized_pnl_pct,
                    "intraday": position.unrealized_intraday_pnl,
                }
            return {"unrealized": Decimal("0"), "unrealized_pct": Decimal("0")}
        
        positions = await self.get_positions()
        return {
            "unrealized": sum(p.unrealized_pnl for p in positions),
            "intraday": sum(p.unrealized_intraday_pnl for p in positions),
        }
    
    # Emergency controls
    async def close_all_positions(
        self,
        cancel_orders: bool = True,
        reason: str = "Manual close all",
    ) -> Dict[str, Any]:
        """
        KILL SWITCH - Close all positions and optionally cancel orders.
        
        Args:
            cancel_orders: Also cancel all open orders
            reason: Reason for closing (logged)
        
        Returns:
            Dict with results of close operation
        """
        logger.critical(f"CLOSE ALL POSITIONS: {reason}")
        
        if self.journal:
            await self.journal.log_kill_switch(reason)
        
        if self.risk_engine:
            self.risk_engine.activate_kill_switch(reason)
        
        results = {
            "positions_closed": [],
            "orders_canceled": [],
            "errors": [],
        }
        
        if self.alpaca:
            try:
                # Close all positions
                closed = await self.alpaca.close_all_positions(cancel_orders=cancel_orders)
                results["positions_closed"] = closed
            except Exception as e:
                results["errors"].append(f"Close positions failed: {e}")
        
        # Clear cache
        self._positions_cache = None
        self._account_cache = None
        
        return results
    
    async def close_position(self, symbol: str, reason: str = "Manual close") -> Dict[str, Any]:
        """
        Close a specific position.
        
        Args:
            symbol: Symbol to close
            reason: Reason for closing
        
        Returns:
            Order result
        """
        logger.info(f"Closing position: {symbol} - {reason}")
        
        if self.alpaca:
            try:
                result = await self.alpaca._request("DELETE", f"/v2/positions/{symbol}")
                return {"success": True, "result": result}
            except Exception as e:
                return {"success": False, "error": str(e)}
        
        raise ValueError("No broker client available")
    
    # Kalshi portfolio
    async def get_kalshi_balance(self) -> Dict[str, Decimal]:
        """Get Kalshi account balance."""
        if not self.kalshi:
            raise ValueError("Kalshi client required")
        
        data = await self.kalshi.get_balance()
        return {
            "balance": Decimal(str(data.get("balance", 0))) / 100,  # Convert cents
            "available_balance": Decimal(str(data.get("available_balance", 0))) / 100,
        }
    
    async def get_kalshi_positions(self) -> List[Dict]:
        """Get Kalshi market positions."""
        if not self.kalshi:
            raise ValueError("Kalshi client required")
        
        data = await self.kalshi.get_positions()
        return data.get("market_positions", [])
    
    # Utility methods
    def invalidate_cache(self):
        """Force cache invalidation."""
        self._account_cache = None
        self._positions_cache = None
        self._cache_timestamp = None
    
    async def is_trading_allowed(self) -> tuple[bool, Optional[str]]:
        """
        Check if trading is currently allowed.
        
        Returns:
            Tuple of (allowed, reason_if_blocked)
        """
        account = await self.get_account()
        
        if account.account_blocked:
            return False, "Account blocked"
        if account.trading_blocked:
            return False, "Trading blocked"
        
        if self.risk_engine and self.risk_engine.kill_switch_active:
            return False, "Kill switch active"
        
        return True, None
