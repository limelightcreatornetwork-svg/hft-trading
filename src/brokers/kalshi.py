"""
Kalshi Broker Implementation

Handles:
- REST API for orders/positions/portfolio
- WebSocket streaming for orderbook and fills
- Idempotent order submission
- Rate limiting (10 req/sec)
"""

import asyncio
import json
import logging
import os
import time
import uuid
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional, Dict, List, Callable, Any
import aiohttp
import websockets

logger = logging.getLogger(__name__)


class KalshiEnvironment(Enum):
    DEMO = "demo"
    PRODUCTION = "production"


@dataclass
class KalshiConfig:
    """Kalshi API configuration."""
    email: str
    password: str
    environment: KalshiEnvironment = KalshiEnvironment.DEMO
    
    # API key auth (alternative)
    api_key: Optional[str] = None
    
    @property
    def base_url(self) -> str:
        if self.environment == KalshiEnvironment.DEMO:
            return "https://demo-api.kalshi.co/trade-api/v2"
        return "https://trading-api.kalshi.com/trade-api/v2"
    
    @property
    def ws_url(self) -> str:
        if self.environment == KalshiEnvironment.DEMO:
            return "wss://demo-api.kalshi.co/trade-api/ws/v2"
        return "wss://trading-api.kalshi.com/trade-api/ws/v2"
    
    @classmethod
    def from_env(cls, demo: bool = True) -> "KalshiConfig":
        """Load config from environment variables."""
        prefix = "KALSHI_DEMO_" if demo else "KALSHI_"
        return cls(
            email=os.environ.get(f"{prefix}EMAIL", ""),
            password=os.environ.get(f"{prefix}PASSWORD", ""),
            api_key=os.environ.get(f"{prefix}API_KEY"),
            environment=KalshiEnvironment.DEMO if demo else KalshiEnvironment.PRODUCTION,
        )


class KalshiRateLimiter:
    """Rate limiter for Kalshi's 10 req/sec limit."""
    
    def __init__(self, requests_per_second: int = 10):
        self.rate = requests_per_second
        self.tokens = requests_per_second
        self.last_update = time.monotonic()
        self._lock = asyncio.Lock()
    
    async def acquire(self):
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self.last_update
            self.tokens = min(self.rate, self.tokens + elapsed * self.rate)
            self.last_update = now
            
            if self.tokens < 1:
                wait_time = (1 - self.tokens) / self.rate
                logger.debug(f"Rate limited, waiting {wait_time:.3f}s")
                await asyncio.sleep(wait_time)
                self.tokens = 1
            
            self.tokens -= 1


class KalshiClient:
    """
    Kalshi REST API client.
    """
    
    def __init__(self, config: KalshiConfig):
        self.config = config
        self.rate_limiter = KalshiRateLimiter(10)
        self._session: Optional[aiohttp.ClientSession] = None
        self._token: Optional[str] = None
        self._member_id: Optional[str] = None
        self._submitted_orders: Dict[str, str] = {}
    
    @property
    def headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        return headers
    
    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session
    
    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()
    
    async def authenticate(self):
        """Authenticate and get session token."""
        if self.config.api_key:
            # API key auth
            self._token = self.config.api_key
            return
        
        # Email/password auth
        session = await self._get_session()
        async with session.post(
            f"{self.config.base_url}/login",
            json={"email": self.config.email, "password": self.config.password}
        ) as response:
            response.raise_for_status()
            data = await response.json()
            self._token = data["token"]
            self._member_id = data["member_id"]
            logger.info(f"Authenticated as member {self._member_id}")
    
    async def _request(
        self,
        method: str,
        endpoint: str,
        **kwargs
    ) -> Dict[str, Any]:
        """Make API request with rate limiting."""
        await self.rate_limiter.acquire()
        
        if not self._token:
            await self.authenticate()
        
        url = f"{self.config.base_url}{endpoint}"
        session = await self._get_session()
        
        max_retries = 3
        for attempt in range(max_retries):
            try:
                async with session.request(
                    method, url, headers=self.headers, **kwargs
                ) as response:
                    if response.status == 429:
                        retry_after = float(response.headers.get("Retry-After", "1"))
                        logger.warning(f"Rate limited, retrying after {retry_after}s")
                        await asyncio.sleep(retry_after)
                        continue
                    
                    if response.status == 401:
                        # Re-authenticate
                        self._token = None
                        await self.authenticate()
                        continue
                    
                    response.raise_for_status()
                    
                    if response.content_length == 0:
                        return {}
                    return await response.json()
                    
            except aiohttp.ClientError as e:
                if attempt == max_retries - 1:
                    raise
                await asyncio.sleep(2 ** attempt)
        
        raise RuntimeError("Max retries exceeded")
    
    # Portfolio endpoints
    async def get_balance(self) -> Dict[str, Any]:
        """Get account balance."""
        return await self._request("GET", "/portfolio/balance")
    
    async def get_positions(self, limit: int = 100, cursor: Optional[str] = None) -> Dict[str, Any]:
        """Get all positions."""
        params = {"limit": limit}
        if cursor:
            params["cursor"] = cursor
        return await self._request("GET", "/portfolio/positions", params=params)
    
    async def get_portfolio_settlements(self, limit: int = 100) -> Dict[str, Any]:
        """Get settlement history."""
        return await self._request("GET", "/portfolio/settlements", params={"limit": limit})
    
    # Market endpoints
    async def get_events(
        self,
        limit: int = 100,
        status: Optional[str] = None,
        series_ticker: Optional[str] = None,
        cursor: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get events (prediction market categories)."""
        params = {"limit": limit}
        if status:
            params["status"] = status
        if series_ticker:
            params["series_ticker"] = series_ticker
        if cursor:
            params["cursor"] = cursor
        return await self._request("GET", "/events", params=params)
    
    async def get_event(self, event_ticker: str) -> Dict[str, Any]:
        """Get single event details."""
        return await self._request("GET", f"/events/{event_ticker}")
    
    async def get_markets(
        self,
        limit: int = 100,
        event_ticker: Optional[str] = None,
        status: Optional[str] = None,
        tickers: Optional[List[str]] = None,
        cursor: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get markets."""
        params = {"limit": limit}
        if event_ticker:
            params["event_ticker"] = event_ticker
        if status:
            params["status"] = status
        if tickers:
            params["tickers"] = ",".join(tickers)
        if cursor:
            params["cursor"] = cursor
        return await self._request("GET", "/markets", params=params)
    
    async def get_market(self, ticker: str) -> Dict[str, Any]:
        """Get single market details."""
        return await self._request("GET", f"/markets/{ticker}")
    
    async def get_orderbook(self, ticker: str, depth: int = 10) -> Dict[str, Any]:
        """Get market orderbook."""
        return await self._request("GET", f"/markets/{ticker}/orderbook", params={"depth": depth})
    
    async def get_trades(
        self,
        ticker: Optional[str] = None,
        limit: int = 100,
        cursor: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get recent trades."""
        params = {"limit": limit}
        if ticker:
            params["ticker"] = ticker
        if cursor:
            params["cursor"] = cursor
        return await self._request("GET", "/markets/trades", params=params)
    
    # Order endpoints
    async def submit_order(
        self,
        ticker: str,
        side: str,  # "yes" or "no"
        action: str,  # "buy" or "sell"
        count: int,  # Number of contracts
        type: str = "limit",
        yes_price: Optional[int] = None,  # Price in cents (1-99)
        no_price: Optional[int] = None,
        client_order_id: Optional[str] = None,
        expiration_ts: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Submit an order with idempotency.
        
        Note: Kalshi only supports limit orders. For market-like execution,
        use yes_price=99 (buying yes) or no_price=99 (buying no).
        """
        if client_order_id is None:
            client_order_id = str(uuid.uuid4())
        
        # Check for duplicate
        if client_order_id in self._submitted_orders:
            order_id = self._submitted_orders[client_order_id]
            return await self.get_order(order_id)
        
        data = {
            "ticker": ticker,
            "side": side,
            "action": action,
            "count": count,
            "type": type,
            "client_order_id": client_order_id,
        }
        
        if yes_price is not None:
            data["yes_price"] = yes_price
        if no_price is not None:
            data["no_price"] = no_price
        if expiration_ts is not None:
            data["expiration_ts"] = expiration_ts
        
        result = await self._request("POST", "/portfolio/orders", json=data)
        
        if "order" in result:
            self._submitted_orders[client_order_id] = result["order"]["order_id"]
        
        return result
    
    async def get_order(self, order_id: str) -> Dict[str, Any]:
        """Get order by ID."""
        return await self._request("GET", f"/portfolio/orders/{order_id}")
    
    async def get_orders(
        self,
        ticker: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100,
        cursor: Optional[str] = None
    ) -> Dict[str, Any]:
        """List orders."""
        params = {"limit": limit}
        if ticker:
            params["ticker"] = ticker
        if status:
            params["status"] = status
        if cursor:
            params["cursor"] = cursor
        return await self._request("GET", "/portfolio/orders", params=params)
    
    async def cancel_order(self, order_id: str) -> Dict[str, Any]:
        """Cancel an order."""
        return await self._request("DELETE", f"/portfolio/orders/{order_id}")
    
    async def batch_cancel_orders(self, order_ids: List[str]) -> Dict[str, Any]:
        """Cancel multiple orders."""
        return await self._request(
            "DELETE", 
            "/portfolio/orders",
            json={"order_ids": order_ids}
        )
    
    async def amend_order(
        self,
        order_id: str,
        count: Optional[int] = None,
        yes_price: Optional[int] = None,
        no_price: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Amend (modify) an existing order."""
        data = {}
        if count is not None:
            data["count"] = count
        if yes_price is not None:
            data["yes_price"] = yes_price
        if no_price is not None:
            data["no_price"] = no_price
        
        return await self._request("POST", f"/portfolio/orders/{order_id}/amend", json=data)
    
    # Fills
    async def get_fills(
        self,
        ticker: Optional[str] = None,
        order_id: Optional[str] = None,
        limit: int = 100,
        cursor: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get fills (executed trades)."""
        params = {"limit": limit}
        if ticker:
            params["ticker"] = ticker
        if order_id:
            params["order_id"] = order_id
        if cursor:
            params["cursor"] = cursor
        return await self._request("GET", "/portfolio/fills", params=params)


class KalshiStream:
    """
    Kalshi WebSocket streaming client.
    
    Handles orderbook updates, trades, and fill notifications.
    """
    
    def __init__(
        self,
        config: KalshiConfig,
        on_orderbook: Optional[Callable[[Dict], None]] = None,
        on_trade: Optional[Callable[[Dict], None]] = None,
        on_fill: Optional[Callable[[Dict], None]] = None,
        on_order_update: Optional[Callable[[Dict], None]] = None,
    ):
        self.config = config
        self.on_orderbook = on_orderbook
        self.on_trade = on_trade
        self.on_fill = on_fill
        self.on_order_update = on_order_update
        
        self._ws: Optional[websockets.WebSocketClientProtocol] = None
        self._token: Optional[str] = None
        self._subscriptions: Dict[str, set] = {
            "orderbook_delta": set(),
            "trade": set(),
            "fill": set(),
        }
        self._running = False
        self._seq: int = 0  # Sequence number for gap detection
        self._reconnect_delay = 1
    
    async def connect(self, token: str):
        """Connect to WebSocket with auth token."""
        self._token = token
        self._running = True
        await self._connect_loop()
    
    async def _connect_loop(self):
        """Connection loop with reconnection."""
        while self._running:
            try:
                async with websockets.connect(
                    self.config.ws_url,
                    extra_headers={"Authorization": f"Bearer {self._token}"}
                ) as ws:
                    self._ws = ws
                    self._reconnect_delay = 1
                    logger.info("Kalshi WebSocket connected")
                    
                    # Resubscribe
                    await self._resubscribe()
                    
                    # Message loop
                    async for message in ws:
                        await self._handle_message(json.loads(message))
                        
            except websockets.ConnectionClosed:
                logger.warning("Kalshi WebSocket disconnected")
            except Exception as e:
                logger.error(f"Kalshi WebSocket error: {e}")
            
            if self._running:
                logger.info(f"Reconnecting in {self._reconnect_delay}s...")
                await asyncio.sleep(self._reconnect_delay)
                self._reconnect_delay = min(self._reconnect_delay * 2, 60)
    
    async def _handle_message(self, msg: Dict):
        """Handle incoming WebSocket message."""
        msg_type = msg.get("type")
        
        # Check sequence number for gap detection
        if "seq" in msg:
            expected = self._seq + 1
            received = msg["seq"]
            if received != expected and self._seq > 0:
                logger.warning(f"Sequence gap detected: expected {expected}, got {received}")
                # Could request snapshot here to recover
            self._seq = received
        
        if msg_type == "orderbook_delta" and self.on_orderbook:
            self.on_orderbook(msg)
        elif msg_type == "trade" and self.on_trade:
            self.on_trade(msg)
        elif msg_type == "fill" and self.on_fill:
            self.on_fill(msg)
        elif msg_type == "order" and self.on_order_update:
            self.on_order_update(msg)
        elif msg_type == "subscribed":
            logger.debug(f"Subscribed: {msg}")
        elif msg_type == "error":
            logger.error(f"WebSocket error: {msg}")
    
    async def subscribe_orderbook(self, tickers: List[str]):
        """Subscribe to orderbook updates."""
        self._subscriptions["orderbook_delta"].update(tickers)
        if self._ws:
            for ticker in tickers:
                await self._ws.send(json.dumps({
                    "id": 1,
                    "cmd": "subscribe",
                    "params": {"channels": ["orderbook_delta"], "market_tickers": [ticker]}
                }))
    
    async def subscribe_trades(self, tickers: List[str]):
        """Subscribe to trade updates."""
        self._subscriptions["trade"].update(tickers)
        if self._ws:
            for ticker in tickers:
                await self._ws.send(json.dumps({
                    "id": 2,
                    "cmd": "subscribe",
                    "params": {"channels": ["trade"], "market_tickers": [ticker]}
                }))
    
    async def subscribe_fills(self):
        """Subscribe to fill notifications (all fills for authenticated user)."""
        self._subscriptions["fill"].add("*")
        if self._ws:
            await self._ws.send(json.dumps({
                "id": 3,
                "cmd": "subscribe",
                "params": {"channels": ["fill"]}
            }))
    
    async def _resubscribe(self):
        """Resubscribe after reconnect."""
        if self._subscriptions["orderbook_delta"]:
            await self.subscribe_orderbook(list(self._subscriptions["orderbook_delta"]))
        if self._subscriptions["trade"]:
            await self.subscribe_trades(list(self._subscriptions["trade"]))
        if self._subscriptions["fill"]:
            await self.subscribe_fills()
    
    async def disconnect(self):
        """Disconnect from WebSocket."""
        self._running = False
        if self._ws:
            await self._ws.close()


# Factory function
def create_kalshi_client(demo: bool = True) -> KalshiClient:
    """Create Kalshi client from environment variables."""
    config = KalshiConfig.from_env(demo=demo)
    return KalshiClient(config)
