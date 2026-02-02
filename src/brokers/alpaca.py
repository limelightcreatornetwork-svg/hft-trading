"""
Alpaca Broker Implementation

Handles:
- REST API for orders/positions/account
- WebSocket streaming for market data and order updates
- Idempotent order submission
- Rate limiting
- Paper/live environment support
"""

import asyncio
import json
import logging
import os
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from enum import Enum
from typing import Optional, Dict, List, Callable, Any, AsyncGenerator
from collections import deque
import aiohttp
import websockets

logger = logging.getLogger(__name__)


class AlpacaEnvironment(Enum):
    PAPER = "paper"
    LIVE = "live"


@dataclass
class AlpacaConfig:
    """Alpaca API configuration."""
    api_key: str
    api_secret: str
    environment: AlpacaEnvironment = AlpacaEnvironment.PAPER
    data_feed: str = "iex"  # "iex" (free) or "sip" (paid)
    
    @property
    def base_url(self) -> str:
        if self.environment == AlpacaEnvironment.PAPER:
            return "https://paper-api.alpaca.markets"
        return "https://api.alpaca.markets"
    
    @property
    def data_url(self) -> str:
        return "https://data.alpaca.markets"
    
    @property
    def stream_url(self) -> str:
        return f"wss://stream.data.alpaca.markets/v2/{self.data_feed}"
    
    @property
    def trading_stream_url(self) -> str:
        if self.environment == AlpacaEnvironment.PAPER:
            return "wss://paper-api.alpaca.markets/stream"
        return "wss://api.alpaca.markets/stream"
    
    @classmethod
    def from_env(cls, paper: bool = True) -> "AlpacaConfig":
        """Load config from environment variables."""
        prefix = "ALPACA_PAPER_" if paper else "ALPACA_"
        return cls(
            api_key=os.environ[f"{prefix}API_KEY"],
            api_secret=os.environ[f"{prefix}API_SECRET"],
            environment=AlpacaEnvironment.PAPER if paper else AlpacaEnvironment.LIVE,
            data_feed=os.environ.get("ALPACA_DATA_FEED", "iex")
        )


class RateLimiter:
    """Token bucket rate limiter for API calls."""
    
    def __init__(self, requests_per_minute: int = 200):
        self.rate = requests_per_minute / 60  # requests per second
        self.tokens = requests_per_minute
        self.max_tokens = requests_per_minute
        self.last_update = time.monotonic()
        self._lock = asyncio.Lock()
    
    async def acquire(self):
        """Wait until a request can be made."""
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self.last_update
            self.tokens = min(self.max_tokens, self.tokens + elapsed * self.rate)
            self.last_update = now
            
            if self.tokens < 1:
                wait_time = (1 - self.tokens) / self.rate
                logger.debug(f"Rate limited, waiting {wait_time:.2f}s")
                await asyncio.sleep(wait_time)
                self.tokens = 1
            
            self.tokens -= 1


class AlpacaClient:
    """
    Alpaca REST API client with rate limiting and retries.
    """
    
    def __init__(self, config: AlpacaConfig):
        self.config = config
        self.rate_limiter = RateLimiter(200)
        self._session: Optional[aiohttp.ClientSession] = None
        self._submitted_orders: Dict[str, str] = {}  # client_order_id -> order_id
    
    @property
    def headers(self) -> Dict[str, str]:
        return {
            "APCA-API-KEY-ID": self.config.api_key,
            "APCA-API-SECRET-KEY": self.config.api_secret,
            "Content-Type": "application/json"
        }
    
    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(headers=self.headers)
        return self._session
    
    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()
    
    async def _request(
        self,
        method: str,
        endpoint: str,
        base_url: Optional[str] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """Make API request with rate limiting and retries."""
        await self.rate_limiter.acquire()
        
        url = f"{base_url or self.config.base_url}{endpoint}"
        session = await self._get_session()
        
        max_retries = 3
        for attempt in range(max_retries):
            try:
                async with session.request(method, url, **kwargs) as response:
                    if response.status == 429:
                        retry_after = int(response.headers.get("Retry-After", "60"))
                        logger.warning(f"Rate limited, retrying after {retry_after}s")
                        await asyncio.sleep(retry_after)
                        continue
                    
                    if response.status == 422:
                        # Unprocessable entity - likely duplicate order
                        data = await response.json()
                        raise AlpacaOrderError(data.get("message", "Order rejected"), data)
                    
                    response.raise_for_status()
                    
                    if response.content_length == 0:
                        return {}
                    return await response.json()
                    
            except aiohttp.ClientError as e:
                if attempt == max_retries - 1:
                    raise
                wait = 2 ** attempt
                logger.warning(f"Request failed, retrying in {wait}s: {e}")
                await asyncio.sleep(wait)
        
        raise RuntimeError("Max retries exceeded")
    
    # Account endpoints
    async def get_account(self) -> Dict[str, Any]:
        """Get account information."""
        return await self._request("GET", "/v2/account")
    
    async def get_positions(self) -> List[Dict[str, Any]]:
        """Get all open positions."""
        return await self._request("GET", "/v2/positions")
    
    async def get_position(self, symbol: str) -> Dict[str, Any]:
        """Get position for a specific symbol."""
        return await self._request("GET", f"/v2/positions/{symbol}")
    
    async def close_all_positions(self, cancel_orders: bool = True) -> List[Dict[str, Any]]:
        """Close all positions (KILL SWITCH)."""
        params = {"cancel_orders": str(cancel_orders).lower()}
        return await self._request("DELETE", "/v2/positions", params=params)
    
    # Order endpoints
    async def submit_order(
        self,
        symbol: str,
        qty: int,
        side: str,
        order_type: str,
        time_in_force: str = "day",
        limit_price: Optional[float] = None,
        stop_price: Optional[float] = None,
        client_order_id: Optional[str] = None,
        extended_hours: bool = False,
        order_class: Optional[str] = None,
        take_profit: Optional[Dict] = None,
        stop_loss: Optional[Dict] = None,
        trail_percent: Optional[float] = None,
        trail_price: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Submit an order with idempotency support.
        
        If client_order_id is provided and was already submitted,
        returns the existing order instead of creating a new one.
        """
        # Generate client_order_id if not provided
        if client_order_id is None:
            client_order_id = str(uuid.uuid4())
        
        # Check for duplicate submission
        if client_order_id in self._submitted_orders:
            order_id = self._submitted_orders[client_order_id]
            logger.info(f"Returning existing order for client_order_id={client_order_id}")
            return await self.get_order(order_id)
        
        data = {
            "symbol": symbol,
            "qty": str(qty),
            "side": side,
            "type": order_type,
            "time_in_force": time_in_force,
            "client_order_id": client_order_id,
        }
        
        if limit_price is not None:
            data["limit_price"] = str(limit_price)
        if stop_price is not None:
            data["stop_price"] = str(stop_price)
        if extended_hours:
            data["extended_hours"] = True
        if order_class:
            data["order_class"] = order_class
        if take_profit:
            data["take_profit"] = take_profit
        if stop_loss:
            data["stop_loss"] = stop_loss
        if trail_percent is not None:
            data["trail_percent"] = str(trail_percent)
        if trail_price is not None:
            data["trail_price"] = str(trail_price)
        
        try:
            result = await self._request("POST", "/v2/orders", json=data)
            self._submitted_orders[client_order_id] = result["id"]
            return result
        except AlpacaOrderError as e:
            # Check if it's a duplicate order (idempotency)
            if "already submitted" in str(e).lower():
                # Fetch existing order
                orders = await self.list_orders(status="all", limit=100)
                for order in orders:
                    if order.get("client_order_id") == client_order_id:
                        self._submitted_orders[client_order_id] = order["id"]
                        return order
            raise
    
    async def get_order(self, order_id: str) -> Dict[str, Any]:
        """Get order by ID."""
        return await self._request("GET", f"/v2/orders/{order_id}")
    
    async def get_order_by_client_id(self, client_order_id: str) -> Dict[str, Any]:
        """Get order by client order ID."""
        return await self._request("GET", f"/v2/orders:by_client_order_id", params={"client_order_id": client_order_id})
    
    async def list_orders(
        self,
        status: str = "open",
        limit: int = 50,
        after: Optional[str] = None,
        until: Optional[str] = None,
        direction: str = "desc",
        symbols: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """List orders with filters."""
        params = {
            "status": status,
            "limit": limit,
            "direction": direction,
        }
        if after:
            params["after"] = after
        if until:
            params["until"] = until
        if symbols:
            params["symbols"] = ",".join(symbols)
        
        return await self._request("GET", "/v2/orders", params=params)
    
    async def cancel_order(self, order_id: str) -> Dict[str, Any]:
        """Cancel an order."""
        return await self._request("DELETE", f"/v2/orders/{order_id}")
    
    async def cancel_all_orders(self) -> List[Dict[str, Any]]:
        """Cancel all open orders."""
        return await self._request("DELETE", "/v2/orders")
    
    async def replace_order(
        self,
        order_id: str,
        qty: Optional[int] = None,
        limit_price: Optional[float] = None,
        stop_price: Optional[float] = None,
        time_in_force: Optional[str] = None,
        client_order_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Replace (modify) an existing order.
        
        Note: Alpaca implements this as cancel-then-new, not atomic.
        """
        data = {}
        if qty is not None:
            data["qty"] = str(qty)
        if limit_price is not None:
            data["limit_price"] = str(limit_price)
        if stop_price is not None:
            data["stop_price"] = str(stop_price)
        if time_in_force is not None:
            data["time_in_force"] = time_in_force
        if client_order_id is not None:
            data["client_order_id"] = client_order_id
        
        return await self._request("PATCH", f"/v2/orders/{order_id}", json=data)
    
    # Market data endpoints
    async def get_latest_quote(self, symbol: str) -> Dict[str, Any]:
        """Get latest quote for a symbol."""
        return await self._request(
            "GET", 
            f"/v2/stocks/{symbol}/quotes/latest",
            base_url=self.config.data_url
        )
    
    async def get_latest_trade(self, symbol: str) -> Dict[str, Any]:
        """Get latest trade for a symbol."""
        return await self._request(
            "GET",
            f"/v2/stocks/{symbol}/trades/latest",
            base_url=self.config.data_url
        )
    
    async def get_bars(
        self,
        symbol: str,
        timeframe: str = "1Day",
        start: Optional[str] = None,
        end: Optional[str] = None,
        limit: int = 1000,
        adjustment: str = "split"
    ) -> Dict[str, Any]:
        """Get historical bars."""
        params = {
            "timeframe": timeframe,
            "limit": limit,
            "adjustment": adjustment,
        }
        if start:
            params["start"] = start
        if end:
            params["end"] = end
        
        return await self._request(
            "GET",
            f"/v2/stocks/{symbol}/bars",
            base_url=self.config.data_url,
            params=params
        )
    
    async def get_snapshot(self, symbol: str) -> Dict[str, Any]:
        """Get market snapshot (quote, trade, bar) for a symbol."""
        return await self._request(
            "GET",
            f"/v2/stocks/{symbol}/snapshot",
            base_url=self.config.data_url
        )
    
    # Options endpoints
    async def get_options_contracts(
        self,
        underlying_symbols: List[str],
        expiration_date: Optional[str] = None,
        expiration_date_gte: Optional[str] = None,
        expiration_date_lte: Optional[str] = None,
        strike_price_gte: Optional[float] = None,
        strike_price_lte: Optional[float] = None,
        option_type: Optional[str] = None,  # "call" or "put"
    ) -> Dict[str, Any]:
        """Get available options contracts."""
        params = {"underlying_symbols": ",".join(underlying_symbols)}
        
        if expiration_date:
            params["expiration_date"] = expiration_date
        if expiration_date_gte:
            params["expiration_date_gte"] = expiration_date_gte
        if expiration_date_lte:
            params["expiration_date_lte"] = expiration_date_lte
        if strike_price_gte:
            params["strike_price_gte"] = str(strike_price_gte)
        if strike_price_lte:
            params["strike_price_lte"] = str(strike_price_lte)
        if option_type:
            params["type"] = option_type
        
        return await self._request("GET", "/v2/options/contracts", params=params)
    
    async def get_options_quote(self, symbol_or_id: str) -> Dict[str, Any]:
        """Get latest options quote."""
        return await self._request(
            "GET",
            f"/v1beta1/options/quotes/latest",
            base_url=self.config.data_url,
            params={"symbols": symbol_or_id}
        )


class AlpacaOrderError(Exception):
    """Alpaca order submission error."""
    def __init__(self, message: str, data: Optional[Dict] = None):
        super().__init__(message)
        self.data = data or {}


class AlpacaStream:
    """
    WebSocket streaming client for market data and order updates.
    
    Handles:
    - Automatic reconnection with exponential backoff
    - Subscription management
    - Message parsing and callbacks
    """
    
    def __init__(
        self,
        config: AlpacaConfig,
        on_quote: Optional[Callable[[Dict], None]] = None,
        on_trade: Optional[Callable[[Dict], None]] = None,
        on_bar: Optional[Callable[[Dict], None]] = None,
        on_order_update: Optional[Callable[[Dict], None]] = None,
    ):
        self.config = config
        self.on_quote = on_quote
        self.on_trade = on_trade
        self.on_bar = on_bar
        self.on_order_update = on_order_update
        
        self._data_ws: Optional[websockets.WebSocketClientProtocol] = None
        self._trading_ws: Optional[websockets.WebSocketClientProtocol] = None
        self._subscriptions: Dict[str, set] = {"quotes": set(), "trades": set(), "bars": set()}
        self._running = False
        self._reconnect_delay = 1
        self._max_reconnect_delay = 60
    
    async def connect(self):
        """Connect to both data and trading streams."""
        self._running = True
        await asyncio.gather(
            self._connect_data_stream(),
            self._connect_trading_stream(),
        )
    
    async def _connect_data_stream(self):
        """Connect to market data stream."""
        while self._running:
            try:
                async with websockets.connect(self.config.stream_url) as ws:
                    self._data_ws = ws
                    self._reconnect_delay = 1
                    
                    # Authenticate
                    await ws.send(json.dumps({
                        "action": "auth",
                        "key": self.config.api_key,
                        "secret": self.config.api_secret,
                    }))
                    
                    auth_response = await ws.recv()
                    auth_data = json.loads(auth_response)
                    if auth_data[0].get("T") != "success":
                        raise Exception(f"Auth failed: {auth_data}")
                    
                    logger.info("Data stream connected and authenticated")
                    
                    # Resubscribe to previous subscriptions
                    await self._resubscribe()
                    
                    # Message loop
                    async for message in ws:
                        await self._handle_data_message(json.loads(message))
                        
            except websockets.ConnectionClosed:
                logger.warning("Data stream disconnected")
            except Exception as e:
                logger.error(f"Data stream error: {e}")
            
            if self._running:
                logger.info(f"Reconnecting in {self._reconnect_delay}s...")
                await asyncio.sleep(self._reconnect_delay)
                self._reconnect_delay = min(self._reconnect_delay * 2, self._max_reconnect_delay)
    
    async def _connect_trading_stream(self):
        """Connect to trading/order updates stream."""
        while self._running:
            try:
                async with websockets.connect(self.config.trading_stream_url) as ws:
                    self._trading_ws = ws
                    
                    # Authenticate
                    await ws.send(json.dumps({
                        "action": "auth",
                        "key": self.config.api_key,
                        "secret": self.config.api_secret,
                    }))
                    
                    auth_response = await ws.recv()
                    auth_data = json.loads(auth_response)
                    
                    if auth_data.get("stream") != "authorization" or auth_data.get("data", {}).get("status") != "authorized":
                        raise Exception(f"Trading auth failed: {auth_data}")
                    
                    # Subscribe to trade updates
                    await ws.send(json.dumps({
                        "action": "listen",
                        "data": {"streams": ["trade_updates"]}
                    }))
                    
                    logger.info("Trading stream connected and authenticated")
                    
                    # Message loop
                    async for message in ws:
                        await self._handle_trading_message(json.loads(message))
                        
            except websockets.ConnectionClosed:
                logger.warning("Trading stream disconnected")
            except Exception as e:
                logger.error(f"Trading stream error: {e}")
            
            if self._running:
                await asyncio.sleep(self._reconnect_delay)
    
    async def _handle_data_message(self, messages: List[Dict]):
        """Handle data stream messages."""
        for msg in messages:
            msg_type = msg.get("T")
            
            if msg_type == "q" and self.on_quote:
                self.on_quote(msg)
            elif msg_type == "t" and self.on_trade:
                self.on_trade(msg)
            elif msg_type == "b" and self.on_bar:
                self.on_bar(msg)
            elif msg_type == "error":
                logger.error(f"Stream error: {msg}")
    
    async def _handle_trading_message(self, message: Dict):
        """Handle trading stream messages."""
        if message.get("stream") == "trade_updates" and self.on_order_update:
            self.on_order_update(message.get("data", {}))
    
    async def subscribe(self, quotes: List[str] = None, trades: List[str] = None, bars: List[str] = None):
        """Subscribe to market data."""
        sub_msg = {"action": "subscribe"}
        
        if quotes:
            self._subscriptions["quotes"].update(quotes)
            sub_msg["quotes"] = quotes
        if trades:
            self._subscriptions["trades"].update(trades)
            sub_msg["trades"] = trades
        if bars:
            self._subscriptions["bars"].update(bars)
            sub_msg["bars"] = bars
        
        if self._data_ws:
            await self._data_ws.send(json.dumps(sub_msg))
    
    async def unsubscribe(self, quotes: List[str] = None, trades: List[str] = None, bars: List[str] = None):
        """Unsubscribe from market data."""
        unsub_msg = {"action": "unsubscribe"}
        
        if quotes:
            self._subscriptions["quotes"] -= set(quotes)
            unsub_msg["quotes"] = quotes
        if trades:
            self._subscriptions["trades"] -= set(trades)
            unsub_msg["trades"] = trades
        if bars:
            self._subscriptions["bars"] -= set(bars)
            unsub_msg["bars"] = bars
        
        if self._data_ws:
            await self._data_ws.send(json.dumps(unsub_msg))
    
    async def _resubscribe(self):
        """Resubscribe to all previous subscriptions after reconnect."""
        if any(self._subscriptions.values()):
            sub_msg = {"action": "subscribe"}
            if self._subscriptions["quotes"]:
                sub_msg["quotes"] = list(self._subscriptions["quotes"])
            if self._subscriptions["trades"]:
                sub_msg["trades"] = list(self._subscriptions["trades"])
            if self._subscriptions["bars"]:
                sub_msg["bars"] = list(self._subscriptions["bars"])
            
            await self._data_ws.send(json.dumps(sub_msg))
            logger.info(f"Resubscribed to {sum(len(v) for v in self._subscriptions.values())} symbols")
    
    async def disconnect(self):
        """Disconnect from streams."""
        self._running = False
        
        if self._data_ws:
            await self._data_ws.close()
        if self._trading_ws:
            await self._trading_ws.close()


# Factory function
def create_alpaca_client(paper: bool = True) -> AlpacaClient:
    """Create Alpaca client from environment variables."""
    config = AlpacaConfig.from_env(paper=paper)
    return AlpacaClient(config)
