"""
Order Tool

Provides:
- Order placement with idempotency
- Order cancellation and replacement
- Risk-checked order submission
- Multi-leg options orders
- Bracket/OCO orders
"""

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional, Dict, List, Any

from ..risk.engine import RiskEngine, Order as RiskOrder, Position, RiskCheckResult, RiskAction

logger = logging.getLogger(__name__)


class OrderSide(Enum):
    BUY = "buy"
    SELL = "sell"


class OrderType(Enum):
    MARKET = "market"
    LIMIT = "limit"
    STOP = "stop"
    STOP_LIMIT = "stop_limit"
    TRAILING_STOP = "trailing_stop"


class TimeInForce(Enum):
    DAY = "day"
    GTC = "gtc"
    IOC = "ioc"
    FOK = "fok"
    OPG = "opg"  # Market on open
    CLS = "cls"  # Market on close


class OrderStatus(Enum):
    NEW = "new"
    PENDING_NEW = "pending_new"
    ACCEPTED = "accepted"
    PARTIALLY_FILLED = "partially_filled"
    FILLED = "filled"
    CANCELED = "canceled"
    PENDING_CANCEL = "pending_cancel"
    REJECTED = "rejected"
    EXPIRED = "expired"
    REPLACED = "replaced"


class OrderClass(Enum):
    SIMPLE = "simple"
    BRACKET = "bracket"
    OCO = "oco"
    OTO = "oto"


@dataclass
class OrderRequest:
    """Order request with all parameters."""
    symbol: str
    side: OrderSide
    qty: int
    order_type: OrderType
    time_in_force: TimeInForce = TimeInForce.DAY
    limit_price: Optional[Decimal] = None
    stop_price: Optional[Decimal] = None
    client_order_id: Optional[str] = None
    extended_hours: bool = False
    
    # Bracket/OCO params
    order_class: OrderClass = OrderClass.SIMPLE
    take_profit_price: Optional[Decimal] = None
    stop_loss_price: Optional[Decimal] = None
    stop_loss_limit_price: Optional[Decimal] = None
    
    # Trailing stop params
    trail_percent: Optional[Decimal] = None
    trail_price: Optional[Decimal] = None
    
    # Metadata
    strategy: Optional[str] = None
    reason: Optional[str] = None
    
    def __post_init__(self):
        if self.client_order_id is None:
            self.client_order_id = str(uuid.uuid4())


@dataclass
class OrderResult:
    """Result of an order operation."""
    success: bool
    order_id: Optional[str] = None
    client_order_id: Optional[str] = None
    status: Optional[OrderStatus] = None
    filled_qty: int = 0
    filled_avg_price: Optional[Decimal] = None
    error: Optional[str] = None
    risk_result: Optional[RiskCheckResult] = None
    raw_response: Optional[Dict] = None
    
    @property
    def is_filled(self) -> bool:
        return self.status == OrderStatus.FILLED
    
    @property
    def is_partial(self) -> bool:
        return self.status == OrderStatus.PARTIALLY_FILLED


@dataclass
class KalshiOrderRequest:
    """Kalshi-specific order request."""
    ticker: str
    side: str  # "yes" or "no"
    action: str  # "buy" or "sell"
    count: int
    price: int  # Price in cents (1-99)
    client_order_id: Optional[str] = None
    
    def __post_init__(self):
        if self.client_order_id is None:
            self.client_order_id = str(uuid.uuid4())


class OrderTool:
    """
    Agent tool for order management.
    
    Features:
    - Idempotent order submission
    - Pre-trade risk checks
    - Bracket/OCO order support
    - Order replacement
    - Automatic audit logging
    
    Usage:
        tool = OrderTool(alpaca_client, risk_engine)
        
        # Place a simple market order
        result = await tool.place_order(OrderRequest(
            symbol="AAPL",
            side=OrderSide.BUY,
            qty=10,
            order_type=OrderType.MARKET,
        ))
        
        # Place a bracket order
        result = await tool.place_bracket_order(
            symbol="AAPL",
            side=OrderSide.BUY,
            qty=10,
            limit_price=Decimal("150.00"),
            take_profit=Decimal("160.00"),
            stop_loss=Decimal("145.00"),
        )
    """
    
    def __init__(
        self,
        alpaca_client=None,
        kalshi_client=None,
        risk_engine: Optional[RiskEngine] = None,
        market_data_tool=None,
        journal_tool=None,
    ):
        self.alpaca = alpaca_client
        self.kalshi = kalshi_client
        self.risk_engine = risk_engine
        self.market_data = market_data_tool
        self.journal = journal_tool
        
        # Track pending orders for idempotency
        self._pending_orders: Dict[str, OrderRequest] = {}
    
    async def place_order(
        self,
        request: OrderRequest,
        skip_risk_check: bool = False,
        dry_run: bool = False,
    ) -> OrderResult:
        """
        Place an order with risk checks.
        
        Args:
            request: Order request details
            skip_risk_check: Skip risk engine (use with caution)
            dry_run: Simulate order without submitting
        
        Returns:
            OrderResult with status and fill info
        """
        # Log the order attempt
        if self.journal:
            await self.journal.log_order_attempt(request)
        
        # Check for duplicate submission
        if request.client_order_id in self._pending_orders:
            existing = self._pending_orders[request.client_order_id]
            if self.alpaca:
                try:
                    order = await self.alpaca.get_order_by_client_id(request.client_order_id)
                    return self._parse_alpaca_order(order)
                except Exception:
                    pass  # Order might not exist yet
        
        # Get market price for risk checks
        market_price = Decimal("0")
        if self.market_data:
            try:
                quote = await self.market_data.get_quote(request.symbol)
                market_price = quote.ask_price if request.side == OrderSide.BUY else quote.bid_price
            except Exception as e:
                logger.warning(f"Could not get market price: {e}")
        elif request.limit_price:
            market_price = request.limit_price
        
        # Risk check
        risk_result = None
        if self.risk_engine and not skip_risk_check:
            # Convert to risk engine format
            risk_order = RiskOrder(
                symbol=request.symbol,
                side=request.side.value,
                qty=request.qty,
                order_type=request.order_type.value,
                limit_price=request.limit_price,
                stop_price=request.stop_price,
                time_in_force=request.time_in_force.value,
                client_order_id=request.client_order_id,
                extended_hours=request.extended_hours,
            )
            
            # Get current positions
            positions = await self._get_positions_for_risk()
            
            # Get account equity
            account_equity = None
            if self.alpaca:
                try:
                    account = await self.alpaca.get_account()
                    account_equity = Decimal(account["equity"])
                except Exception:
                    pass
            
            risk_result = await self.risk_engine.check_order(
                risk_order, positions, market_price, account_equity
            )
            
            if risk_result.action == RiskAction.REJECT:
                error = f"Risk check failed: {', '.join(risk_result.checks_failed)}"
                if self.journal:
                    await self.journal.log_order_rejected(request, error)
                return OrderResult(
                    success=False,
                    client_order_id=request.client_order_id,
                    error=error,
                    risk_result=risk_result,
                )
            
            if risk_result.action == RiskAction.REQUIRE_APPROVAL:
                # TODO: Queue for human approval
                error = f"Human approval required: {risk_result.approval_reason}"
                if self.journal:
                    await self.journal.log_order_pending_approval(request, risk_result.approval_reason)
                return OrderResult(
                    success=False,
                    client_order_id=request.client_order_id,
                    error=error,
                    risk_result=risk_result,
                )
            
            if risk_result.action == RiskAction.DRY_RUN or dry_run:
                if self.journal:
                    await self.journal.log_order_dry_run(request, risk_result)
                return OrderResult(
                    success=True,
                    client_order_id=request.client_order_id,
                    status=OrderStatus.NEW,
                    risk_result=risk_result,
                    error="DRY_RUN - Order not submitted",
                )
        
        # Track pending order
        self._pending_orders[request.client_order_id] = request
        
        try:
            # Submit to broker
            if self.alpaca:
                result = await self._submit_alpaca_order(request)
            else:
                raise ValueError("No broker client available")
            
            # Record with risk engine
            if self.risk_engine and result.success:
                notional = market_price * request.qty
                self.risk_engine.record_fill(notional)
            
            # Log result
            if self.journal:
                if result.success:
                    await self.journal.log_order_submitted(request, result)
                else:
                    await self.journal.log_order_rejected(request, result.error)
            
            return result
            
        except Exception as e:
            logger.error(f"Order submission failed: {e}")
            if self.risk_engine:
                self.risk_engine.record_reject(str(e))
            if self.journal:
                await self.journal.log_order_error(request, str(e))
            return OrderResult(
                success=False,
                client_order_id=request.client_order_id,
                error=str(e),
            )
        finally:
            # Remove from pending
            self._pending_orders.pop(request.client_order_id, None)
    
    async def _submit_alpaca_order(self, request: OrderRequest) -> OrderResult:
        """Submit order to Alpaca."""
        # Build order params
        params = {
            "symbol": request.symbol,
            "qty": request.qty,
            "side": request.side.value,
            "order_type": request.order_type.value,
            "time_in_force": request.time_in_force.value,
            "client_order_id": request.client_order_id,
            "extended_hours": request.extended_hours,
        }
        
        if request.limit_price:
            params["limit_price"] = float(request.limit_price)
        if request.stop_price:
            params["stop_price"] = float(request.stop_price)
        
        # Bracket/OCO params
        if request.order_class != OrderClass.SIMPLE:
            params["order_class"] = request.order_class.value
            
            if request.take_profit_price:
                params["take_profit"] = {"limit_price": float(request.take_profit_price)}
            
            if request.stop_loss_price:
                stop_loss = {"stop_price": float(request.stop_loss_price)}
                if request.stop_loss_limit_price:
                    stop_loss["limit_price"] = float(request.stop_loss_limit_price)
                params["stop_loss"] = stop_loss
        
        # Trailing stop
        if request.trail_percent:
            params["trail_percent"] = float(request.trail_percent)
        if request.trail_price:
            params["trail_price"] = float(request.trail_price)
        
        response = await self.alpaca.submit_order(**params)
        return self._parse_alpaca_order(response)
    
    def _parse_alpaca_order(self, response: Dict) -> OrderResult:
        """Parse Alpaca order response."""
        return OrderResult(
            success=True,
            order_id=response.get("id"),
            client_order_id=response.get("client_order_id"),
            status=OrderStatus(response.get("status", "new")),
            filled_qty=int(response.get("filled_qty", 0)),
            filled_avg_price=Decimal(response["filled_avg_price"]) if response.get("filled_avg_price") else None,
            raw_response=response,
        )
    
    async def _get_positions_for_risk(self) -> Dict[str, Position]:
        """Get positions in format expected by risk engine."""
        positions = {}
        
        if self.alpaca:
            try:
                raw_positions = await self.alpaca.get_positions()
                for p in raw_positions:
                    positions[p["symbol"]] = Position(
                        symbol=p["symbol"],
                        qty=int(p["qty"]),
                        avg_entry_price=Decimal(p["avg_entry_price"]),
                        current_price=Decimal(p["current_price"]),
                        market_value=Decimal(p["market_value"]),
                        unrealized_pnl=Decimal(p["unrealized_pl"]),
                    )
            except Exception as e:
                logger.error(f"Failed to get positions: {e}")
        
        return positions
    
    # Convenience methods
    async def buy(
        self,
        symbol: str,
        qty: int,
        limit_price: Optional[Decimal] = None,
        **kwargs
    ) -> OrderResult:
        """Place a buy order."""
        order_type = OrderType.LIMIT if limit_price else OrderType.MARKET
        return await self.place_order(OrderRequest(
            symbol=symbol,
            side=OrderSide.BUY,
            qty=qty,
            order_type=order_type,
            limit_price=limit_price,
            **kwargs
        ))
    
    async def sell(
        self,
        symbol: str,
        qty: int,
        limit_price: Optional[Decimal] = None,
        **kwargs
    ) -> OrderResult:
        """Place a sell order."""
        order_type = OrderType.LIMIT if limit_price else OrderType.MARKET
        return await self.place_order(OrderRequest(
            symbol=symbol,
            side=OrderSide.SELL,
            qty=qty,
            order_type=order_type,
            limit_price=limit_price,
            **kwargs
        ))
    
    async def place_bracket_order(
        self,
        symbol: str,
        side: OrderSide,
        qty: int,
        limit_price: Decimal,
        take_profit: Decimal,
        stop_loss: Decimal,
        stop_loss_limit: Optional[Decimal] = None,
        **kwargs
    ) -> OrderResult:
        """Place a bracket order with take-profit and stop-loss."""
        return await self.place_order(OrderRequest(
            symbol=symbol,
            side=side,
            qty=qty,
            order_type=OrderType.LIMIT,
            limit_price=limit_price,
            order_class=OrderClass.BRACKET,
            take_profit_price=take_profit,
            stop_loss_price=stop_loss,
            stop_loss_limit_price=stop_loss_limit,
            **kwargs
        ))
    
    async def place_oco_order(
        self,
        symbol: str,
        qty: int,
        take_profit: Decimal,
        stop_loss: Decimal,
        stop_loss_limit: Optional[Decimal] = None,
        **kwargs
    ) -> OrderResult:
        """Place an OCO (one-cancels-other) order."""
        return await self.place_order(OrderRequest(
            symbol=symbol,
            side=OrderSide.SELL,
            qty=qty,
            order_type=OrderType.LIMIT,
            limit_price=take_profit,
            order_class=OrderClass.OCO,
            stop_loss_price=stop_loss,
            stop_loss_limit_price=stop_loss_limit,
            **kwargs
        ))
    
    # Order management
    async def cancel_order(self, order_id: str) -> OrderResult:
        """Cancel an order by ID."""
        if self.alpaca:
            try:
                await self.alpaca.cancel_order(order_id)
                return OrderResult(
                    success=True,
                    order_id=order_id,
                    status=OrderStatus.CANCELED,
                )
            except Exception as e:
                return OrderResult(
                    success=False,
                    order_id=order_id,
                    error=str(e),
                )
        
        raise ValueError("No broker client available")
    
    async def cancel_all_orders(self) -> List[OrderResult]:
        """Cancel all open orders."""
        results = []
        
        if self.alpaca:
            try:
                canceled = await self.alpaca.cancel_all_orders()
                for order in canceled:
                    results.append(OrderResult(
                        success=True,
                        order_id=order.get("id"),
                        status=OrderStatus.CANCELED,
                    ))
            except Exception as e:
                results.append(OrderResult(success=False, error=str(e)))
        
        return results
    
    async def replace_order(
        self,
        order_id: str,
        qty: Optional[int] = None,
        limit_price: Optional[Decimal] = None,
        stop_price: Optional[Decimal] = None,
        time_in_force: Optional[TimeInForce] = None,
    ) -> OrderResult:
        """
        Replace (modify) an existing order.
        
        Note: Alpaca implements this as cancel-then-new (not atomic).
        """
        if self.alpaca:
            try:
                response = await self.alpaca.replace_order(
                    order_id,
                    qty=qty,
                    limit_price=float(limit_price) if limit_price else None,
                    stop_price=float(stop_price) if stop_price else None,
                    time_in_force=time_in_force.value if time_in_force else None,
                )
                return self._parse_alpaca_order(response)
            except Exception as e:
                return OrderResult(
                    success=False,
                    order_id=order_id,
                    error=str(e),
                )
        
        raise ValueError("No broker client available")
    
    async def get_order(self, order_id: str) -> OrderResult:
        """Get order status by ID."""
        if self.alpaca:
            try:
                response = await self.alpaca.get_order(order_id)
                return self._parse_alpaca_order(response)
            except Exception as e:
                return OrderResult(success=False, order_id=order_id, error=str(e))
        
        raise ValueError("No broker client available")
    
    async def list_orders(
        self,
        status: str = "open",
        limit: int = 50,
        symbols: Optional[List[str]] = None,
    ) -> List[Dict]:
        """List orders with filters."""
        if self.alpaca:
            return await self.alpaca.list_orders(
                status=status,
                limit=limit,
                symbols=symbols,
            )
        
        raise ValueError("No broker client available")
    
    # Kalshi orders
    async def place_kalshi_order(
        self,
        request: KalshiOrderRequest,
        skip_risk_check: bool = False,
    ) -> OrderResult:
        """Place a Kalshi prediction market order."""
        if not self.kalshi:
            raise ValueError("Kalshi client required")
        
        try:
            response = await self.kalshi.submit_order(
                ticker=request.ticker,
                side=request.side,
                action=request.action,
                count=request.count,
                yes_price=request.price if request.side == "yes" else None,
                no_price=request.price if request.side == "no" else None,
                client_order_id=request.client_order_id,
            )
            
            order = response.get("order", {})
            return OrderResult(
                success=True,
                order_id=order.get("order_id"),
                client_order_id=request.client_order_id,
                status=OrderStatus(order.get("status", "new")),
                filled_qty=order.get("remaining_count", 0),
                raw_response=response,
            )
        except Exception as e:
            return OrderResult(
                success=False,
                client_order_id=request.client_order_id,
                error=str(e),
            )
