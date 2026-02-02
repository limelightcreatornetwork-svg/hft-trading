"""
Market Data Tool

Provides:
- Real-time streaming quotes/trades/bars
- Snapshot queries
- Historical data access
- Options chain data
"""

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional, Dict, List, Any, Callable, AsyncGenerator
from enum import Enum

logger = logging.getLogger(__name__)


class DataSource(Enum):
    ALPACA = "alpaca"
    KALSHI = "kalshi"


@dataclass
class Quote:
    """Real-time quote data."""
    symbol: str
    bid_price: Decimal
    bid_size: int
    ask_price: Decimal
    ask_size: int
    timestamp: datetime
    source: DataSource
    
    @property
    def mid_price(self) -> Decimal:
        return (self.bid_price + self.ask_price) / 2
    
    @property
    def spread(self) -> Decimal:
        return self.ask_price - self.bid_price
    
    @property
    def spread_pct(self) -> Decimal:
        if self.mid_price > 0:
            return self.spread / self.mid_price
        return Decimal("0")


@dataclass
class Trade:
    """Trade tick data."""
    symbol: str
    price: Decimal
    size: int
    timestamp: datetime
    source: DataSource
    conditions: Optional[List[str]] = None


@dataclass
class Bar:
    """OHLCV bar data."""
    symbol: str
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: int
    timestamp: datetime
    timeframe: str
    source: DataSource
    vwap: Optional[Decimal] = None
    trade_count: Optional[int] = None


@dataclass
class Snapshot:
    """Market snapshot combining multiple data types."""
    symbol: str
    latest_quote: Optional[Quote]
    latest_trade: Optional[Trade]
    minute_bar: Optional[Bar]
    daily_bar: Optional[Bar]
    prev_daily_bar: Optional[Bar]
    source: DataSource


class MarketDataTool:
    """
    Agent tool for accessing market data.
    
    Usage:
        tool = MarketDataTool(alpaca_client)
        
        # Get snapshot
        snapshot = await tool.get_snapshot("AAPL")
        
        # Stream quotes
        async for quote in tool.stream_quotes(["AAPL", "MSFT"]):
            print(quote)
        
        # Get historical bars
        bars = await tool.get_historical_bars("AAPL", "1Day", days=30)
    """
    
    def __init__(
        self,
        alpaca_client=None,
        kalshi_client=None,
        alpaca_stream=None,
        kalshi_stream=None,
    ):
        self.alpaca = alpaca_client
        self.kalshi = kalshi_client
        self.alpaca_stream = alpaca_stream
        self.kalshi_stream = kalshi_stream
        
        self._quote_callbacks: List[Callable[[Quote], None]] = []
        self._trade_callbacks: List[Callable[[Trade], None]] = []
        self._bar_callbacks: List[Callable[[Bar], None]] = []
        
        self._quote_cache: Dict[str, Quote] = {}
        self._trade_cache: Dict[str, Trade] = {}
    
    # Snapshot methods
    async def get_snapshot(self, symbol: str, source: DataSource = DataSource.ALPACA) -> Snapshot:
        """
        Get current market snapshot for a symbol.
        
        Args:
            symbol: Stock ticker or Kalshi market ticker
            source: Data source to use
        
        Returns:
            Snapshot with latest quote, trade, and bar data
        """
        if source == DataSource.ALPACA and self.alpaca:
            data = await self.alpaca.get_snapshot(symbol)
            
            latest_quote = None
            if data.get("latestQuote"):
                q = data["latestQuote"]
                latest_quote = Quote(
                    symbol=symbol,
                    bid_price=Decimal(str(q["bp"])),
                    bid_size=q["bs"],
                    ask_price=Decimal(str(q["ap"])),
                    ask_size=q["as"],
                    timestamp=datetime.fromisoformat(q["t"].replace("Z", "+00:00")),
                    source=DataSource.ALPACA,
                )
            
            latest_trade = None
            if data.get("latestTrade"):
                t = data["latestTrade"]
                latest_trade = Trade(
                    symbol=symbol,
                    price=Decimal(str(t["p"])),
                    size=t["s"],
                    timestamp=datetime.fromisoformat(t["t"].replace("Z", "+00:00")),
                    source=DataSource.ALPACA,
                    conditions=t.get("c"),
                )
            
            minute_bar = None
            if data.get("minuteBar"):
                b = data["minuteBar"]
                minute_bar = Bar(
                    symbol=symbol,
                    open=Decimal(str(b["o"])),
                    high=Decimal(str(b["h"])),
                    low=Decimal(str(b["l"])),
                    close=Decimal(str(b["c"])),
                    volume=b["v"],
                    timestamp=datetime.fromisoformat(b["t"].replace("Z", "+00:00")),
                    timeframe="1Min",
                    source=DataSource.ALPACA,
                    vwap=Decimal(str(b["vw"])) if b.get("vw") else None,
                    trade_count=b.get("n"),
                )
            
            daily_bar = None
            if data.get("dailyBar"):
                b = data["dailyBar"]
                daily_bar = Bar(
                    symbol=symbol,
                    open=Decimal(str(b["o"])),
                    high=Decimal(str(b["h"])),
                    low=Decimal(str(b["l"])),
                    close=Decimal(str(b["c"])),
                    volume=b["v"],
                    timestamp=datetime.fromisoformat(b["t"].replace("Z", "+00:00")),
                    timeframe="1Day",
                    source=DataSource.ALPACA,
                    vwap=Decimal(str(b["vw"])) if b.get("vw") else None,
                    trade_count=b.get("n"),
                )
            
            prev_daily_bar = None
            if data.get("prevDailyBar"):
                b = data["prevDailyBar"]
                prev_daily_bar = Bar(
                    symbol=symbol,
                    open=Decimal(str(b["o"])),
                    high=Decimal(str(b["h"])),
                    low=Decimal(str(b["l"])),
                    close=Decimal(str(b["c"])),
                    volume=b["v"],
                    timestamp=datetime.fromisoformat(b["t"].replace("Z", "+00:00")),
                    timeframe="1Day",
                    source=DataSource.ALPACA,
                    vwap=Decimal(str(b["vw"])) if b.get("vw") else None,
                    trade_count=b.get("n"),
                )
            
            return Snapshot(
                symbol=symbol,
                latest_quote=latest_quote,
                latest_trade=latest_trade,
                minute_bar=minute_bar,
                daily_bar=daily_bar,
                prev_daily_bar=prev_daily_bar,
                source=DataSource.ALPACA,
            )
        
        elif source == DataSource.KALSHI and self.kalshi:
            market = await self.kalshi.get_market(symbol)
            orderbook = await self.kalshi.get_orderbook(symbol)
            
            # Convert Kalshi data to our format
            best_bid = orderbook.get("yes", [[]])[0] if orderbook.get("yes") else None
            best_ask = orderbook.get("no", [[]])[0] if orderbook.get("no") else None
            
            latest_quote = Quote(
                symbol=symbol,
                bid_price=Decimal(str(best_bid[0])) / 100 if best_bid else Decimal("0"),
                bid_size=best_bid[1] if best_bid else 0,
                ask_price=Decimal("1") - Decimal(str(best_ask[0])) / 100 if best_ask else Decimal("1"),
                ask_size=best_ask[1] if best_ask else 0,
                timestamp=datetime.now(),
                source=DataSource.KALSHI,
            )
            
            return Snapshot(
                symbol=symbol,
                latest_quote=latest_quote,
                latest_trade=None,
                minute_bar=None,
                daily_bar=None,
                prev_daily_bar=None,
                source=DataSource.KALSHI,
            )
        
        raise ValueError(f"No client available for source {source}")
    
    async def get_quote(self, symbol: str, source: DataSource = DataSource.ALPACA) -> Quote:
        """Get latest quote for a symbol."""
        # Check cache first
        cache_key = f"{source.value}:{symbol}"
        if cache_key in self._quote_cache:
            cached = self._quote_cache[cache_key]
            # Cache valid for 1 second
            if (datetime.now() - cached.timestamp).total_seconds() < 1:
                return cached
        
        snapshot = await self.get_snapshot(symbol, source)
        if snapshot.latest_quote:
            self._quote_cache[cache_key] = snapshot.latest_quote
            return snapshot.latest_quote
        
        raise ValueError(f"No quote available for {symbol}")
    
    # Historical data
    async def get_historical_bars(
        self,
        symbol: str,
        timeframe: str = "1Day",
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
        days: Optional[int] = None,
        limit: int = 1000,
        adjustment: str = "split",
    ) -> List[Bar]:
        """
        Get historical bar data.
        
        Args:
            symbol: Stock ticker
            timeframe: Bar timeframe (1Min, 5Min, 15Min, 1Hour, 1Day, etc.)
            start: Start datetime
            end: End datetime
            days: Number of days back (alternative to start)
            limit: Max bars to return
            adjustment: Price adjustment (raw, split, dividend, all)
        
        Returns:
            List of Bar objects
        """
        if not self.alpaca:
            raise ValueError("Alpaca client required for historical data")
        
        if days and not start:
            start = datetime.now() - timedelta(days=days)
        
        start_str = start.isoformat() if start else None
        end_str = end.isoformat() if end else None
        
        data = await self.alpaca.get_bars(
            symbol,
            timeframe=timeframe,
            start=start_str,
            end=end_str,
            limit=limit,
            adjustment=adjustment,
        )
        
        bars = []
        for b in data.get("bars", []):
            bars.append(Bar(
                symbol=symbol,
                open=Decimal(str(b["o"])),
                high=Decimal(str(b["h"])),
                low=Decimal(str(b["l"])),
                close=Decimal(str(b["c"])),
                volume=b["v"],
                timestamp=datetime.fromisoformat(b["t"].replace("Z", "+00:00")),
                timeframe=timeframe,
                source=DataSource.ALPACA,
                vwap=Decimal(str(b["vw"])) if b.get("vw") else None,
                trade_count=b.get("n"),
            ))
        
        return bars
    
    # Streaming methods
    async def stream_quotes(
        self,
        symbols: List[str],
        source: DataSource = DataSource.ALPACA,
    ) -> AsyncGenerator[Quote, None]:
        """
        Stream real-time quotes.
        
        Args:
            symbols: List of symbols to stream
            source: Data source
        
        Yields:
            Quote objects as they arrive
        """
        queue: asyncio.Queue[Quote] = asyncio.Queue()
        
        def on_quote(msg: Dict):
            quote = Quote(
                symbol=msg["S"],
                bid_price=Decimal(str(msg["bp"])),
                bid_size=msg["bs"],
                ask_price=Decimal(str(msg["ap"])),
                ask_size=msg["as"],
                timestamp=datetime.fromisoformat(msg["t"].replace("Z", "+00:00")),
                source=source,
            )
            queue.put_nowait(quote)
            self._quote_cache[f"{source.value}:{quote.symbol}"] = quote
        
        if source == DataSource.ALPACA and self.alpaca_stream:
            # Register callback
            original_callback = self.alpaca_stream.on_quote
            self.alpaca_stream.on_quote = on_quote
            
            try:
                await self.alpaca_stream.subscribe(quotes=symbols)
                
                while True:
                    quote = await queue.get()
                    yield quote
                    
            finally:
                self.alpaca_stream.on_quote = original_callback
                await self.alpaca_stream.unsubscribe(quotes=symbols)
    
    async def stream_trades(
        self,
        symbols: List[str],
        source: DataSource = DataSource.ALPACA,
    ) -> AsyncGenerator[Trade, None]:
        """Stream real-time trades."""
        queue: asyncio.Queue[Trade] = asyncio.Queue()
        
        def on_trade(msg: Dict):
            trade = Trade(
                symbol=msg["S"],
                price=Decimal(str(msg["p"])),
                size=msg["s"],
                timestamp=datetime.fromisoformat(msg["t"].replace("Z", "+00:00")),
                source=source,
                conditions=msg.get("c"),
            )
            queue.put_nowait(trade)
        
        if source == DataSource.ALPACA and self.alpaca_stream:
            original_callback = self.alpaca_stream.on_trade
            self.alpaca_stream.on_trade = on_trade
            
            try:
                await self.alpaca_stream.subscribe(trades=symbols)
                
                while True:
                    trade = await queue.get()
                    yield trade
                    
            finally:
                self.alpaca_stream.on_trade = original_callback
                await self.alpaca_stream.unsubscribe(trades=symbols)
    
    # Options data
    async def get_options_chain(
        self,
        underlying: str,
        expiration_date: Optional[str] = None,
        min_strike: Optional[float] = None,
        max_strike: Optional[float] = None,
        option_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get options chain for an underlying.
        
        Args:
            underlying: Underlying symbol (e.g., "AAPL")
            expiration_date: Filter by expiration (YYYY-MM-DD)
            min_strike: Minimum strike price
            max_strike: Maximum strike price
            option_type: "call" or "put"
        
        Returns:
            Dict with options contracts
        """
        if not self.alpaca:
            raise ValueError("Alpaca client required for options data")
        
        return await self.alpaca.get_options_contracts(
            underlying_symbols=[underlying],
            expiration_date=expiration_date,
            strike_price_gte=min_strike,
            strike_price_lte=max_strike,
            option_type=option_type,
        )
    
    # Kalshi-specific
    async def get_kalshi_markets(
        self,
        event_ticker: Optional[str] = None,
        status: str = "open",
        limit: int = 100,
    ) -> List[Dict]:
        """Get available Kalshi prediction markets."""
        if not self.kalshi:
            raise ValueError("Kalshi client required")
        
        data = await self.kalshi.get_markets(
            event_ticker=event_ticker,
            status=status,
            limit=limit,
        )
        return data.get("markets", [])
    
    async def get_kalshi_orderbook(self, ticker: str, depth: int = 10) -> Dict:
        """Get Kalshi market orderbook."""
        if not self.kalshi:
            raise ValueError("Kalshi client required")
        
        return await self.kalshi.get_orderbook(ticker, depth=depth)
    
    # Utility methods
    def get_cached_quote(self, symbol: str, source: DataSource = DataSource.ALPACA) -> Optional[Quote]:
        """Get cached quote without API call."""
        return self._quote_cache.get(f"{source.value}:{symbol}")
    
    def clear_cache(self):
        """Clear quote and trade caches."""
        self._quote_cache.clear()
        self._trade_cache.clear()
