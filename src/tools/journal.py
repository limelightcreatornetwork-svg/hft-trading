"""
Journal Tool

Provides:
- Audit trail for all trading decisions
- Order logging with full context
- Risk event logging
- Performance tracking
- Export capabilities
"""

import asyncio
import json
import logging
from dataclasses import dataclass, asdict
from datetime import datetime, date
from decimal import Decimal
from enum import Enum
from pathlib import Path
from typing import Optional, Dict, List, Any, Union
import uuid

logger = logging.getLogger(__name__)


class JournalEventType(Enum):
    # Order events
    ORDER_ATTEMPT = "order_attempt"
    ORDER_SUBMITTED = "order_submitted"
    ORDER_FILLED = "order_filled"
    ORDER_PARTIAL_FILL = "order_partial_fill"
    ORDER_REJECTED = "order_rejected"
    ORDER_CANCELED = "order_canceled"
    ORDER_REPLACED = "order_replaced"
    ORDER_PENDING_APPROVAL = "order_pending_approval"
    ORDER_DRY_RUN = "order_dry_run"
    ORDER_ERROR = "order_error"
    
    # Risk events
    RISK_CHECK_PASSED = "risk_check_passed"
    RISK_CHECK_FAILED = "risk_check_failed"
    RISK_LIMIT_WARNING = "risk_limit_warning"
    RISK_LIMIT_UPDATED = "risk_limit_updated"
    
    # System events
    KILL_SWITCH_ACTIVATED = "kill_switch_activated"
    KILL_SWITCH_DEACTIVATED = "kill_switch_deactivated"
    CIRCUIT_BREAKER_TRIPPED = "circuit_breaker_tripped"
    CIRCUIT_BREAKER_RESET = "circuit_breaker_reset"
    
    # Position events
    POSITION_OPENED = "position_opened"
    POSITION_CLOSED = "position_closed"
    POSITION_SCALED = "position_scaled"
    
    # Strategy events
    SIGNAL_GENERATED = "signal_generated"
    TRADE_DECISION = "trade_decision"
    STRATEGY_PAUSED = "strategy_paused"
    STRATEGY_RESUMED = "strategy_resumed"
    
    # Custom
    NOTE = "note"
    CUSTOM = "custom"


@dataclass
class JournalEntry:
    """A single journal entry."""
    event_id: str
    timestamp: datetime
    event_type: JournalEventType
    symbol: Optional[str]
    data: Dict[str, Any]
    
    # Context
    strategy: Optional[str] = None
    session_id: Optional[str] = None
    order_id: Optional[str] = None
    client_order_id: Optional[str] = None
    
    # Outcome
    success: Optional[bool] = None
    error: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_id": self.event_id,
            "timestamp": self.timestamp.isoformat(),
            "event_type": self.event_type.value,
            "symbol": self.symbol,
            "data": self.data,
            "strategy": self.strategy,
            "session_id": self.session_id,
            "order_id": self.order_id,
            "client_order_id": self.client_order_id,
            "success": self.success,
            "error": self.error,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "JournalEntry":
        return cls(
            event_id=data["event_id"],
            timestamp=datetime.fromisoformat(data["timestamp"]),
            event_type=JournalEventType(data["event_type"]),
            symbol=data.get("symbol"),
            data=data.get("data", {}),
            strategy=data.get("strategy"),
            session_id=data.get("session_id"),
            order_id=data.get("order_id"),
            client_order_id=data.get("client_order_id"),
            success=data.get("success"),
            error=data.get("error"),
        )


class DecimalEncoder(json.JSONEncoder):
    """JSON encoder that handles Decimal types."""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return str(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        if isinstance(obj, Enum):
            return obj.value
        return super().default(obj)


class JournalTool:
    """
    Agent tool for audit trail and decision logging.
    
    Features:
    - Structured event logging
    - Full order lifecycle tracking
    - Risk event documentation
    - File-based persistence
    - Query capabilities
    
    Usage:
        tool = JournalTool(journal_dir="/path/to/journals")
        
        # Log a trade decision
        await tool.log_trade_decision(
            symbol="AAPL",
            action="buy",
            reason="RSI oversold + support level",
            inputs={"rsi": 28, "price": 150.50},
        )
        
        # Get today's journal
        entries = tool.get_entries(date=date.today())
        
        # Export to JSON
        tool.export_json("journal_export.json")
    """
    
    def __init__(
        self,
        journal_dir: Optional[str] = None,
        session_id: Optional[str] = None,
        persist_to_file: bool = True,
        max_memory_entries: int = 10000,
    ):
        self.journal_dir = Path(journal_dir) if journal_dir else Path.home() / ".hft" / "journals"
        self.session_id = session_id or str(uuid.uuid4())[:8]
        self.persist_to_file = persist_to_file
        self.max_memory_entries = max_memory_entries
        
        # In-memory buffer
        self._entries: List[JournalEntry] = []
        
        # Ensure directory exists
        if persist_to_file:
            self.journal_dir.mkdir(parents=True, exist_ok=True)
    
    def _create_entry(
        self,
        event_type: JournalEventType,
        symbol: Optional[str] = None,
        data: Optional[Dict] = None,
        strategy: Optional[str] = None,
        order_id: Optional[str] = None,
        client_order_id: Optional[str] = None,
        success: Optional[bool] = None,
        error: Optional[str] = None,
    ) -> JournalEntry:
        """Create a journal entry."""
        entry = JournalEntry(
            event_id=str(uuid.uuid4()),
            timestamp=datetime.now(),
            event_type=event_type,
            symbol=symbol,
            data=data or {},
            strategy=strategy,
            session_id=self.session_id,
            order_id=order_id,
            client_order_id=client_order_id,
            success=success,
            error=error,
        )
        
        # Add to memory
        self._entries.append(entry)
        if len(self._entries) > self.max_memory_entries:
            self._entries = self._entries[-self.max_memory_entries:]
        
        # Persist
        if self.persist_to_file:
            self._write_entry(entry)
        
        return entry
    
    def _write_entry(self, entry: JournalEntry):
        """Write entry to file."""
        date_str = entry.timestamp.strftime("%Y-%m-%d")
        filepath = self.journal_dir / f"{date_str}.jsonl"
        
        try:
            with open(filepath, "a") as f:
                f.write(json.dumps(entry.to_dict(), cls=DecimalEncoder) + "\n")
        except Exception as e:
            logger.error(f"Failed to write journal entry: {e}")
    
    # Order logging methods
    async def log_order_attempt(self, order_request) -> JournalEntry:
        """Log an order attempt."""
        data = {
            "symbol": order_request.symbol,
            "side": order_request.side.value if hasattr(order_request.side, 'value') else order_request.side,
            "qty": order_request.qty,
            "order_type": order_request.order_type.value if hasattr(order_request.order_type, 'value') else order_request.order_type,
            "limit_price": str(order_request.limit_price) if order_request.limit_price else None,
            "stop_price": str(order_request.stop_price) if order_request.stop_price else None,
            "time_in_force": order_request.time_in_force.value if hasattr(order_request.time_in_force, 'value') else order_request.time_in_force,
            "extended_hours": getattr(order_request, 'extended_hours', False),
            "reason": getattr(order_request, 'reason', None),
        }
        
        return self._create_entry(
            JournalEventType.ORDER_ATTEMPT,
            symbol=order_request.symbol,
            data=data,
            strategy=getattr(order_request, 'strategy', None),
            client_order_id=order_request.client_order_id,
        )
    
    async def log_order_submitted(self, order_request, result) -> JournalEntry:
        """Log a successfully submitted order."""
        data = {
            "symbol": order_request.symbol,
            "side": order_request.side.value if hasattr(order_request.side, 'value') else order_request.side,
            "qty": order_request.qty,
            "order_id": result.order_id,
            "status": result.status.value if result.status else None,
        }
        
        return self._create_entry(
            JournalEventType.ORDER_SUBMITTED,
            symbol=order_request.symbol,
            data=data,
            order_id=result.order_id,
            client_order_id=result.client_order_id,
            success=True,
        )
    
    async def log_order_filled(
        self,
        order_id: str,
        symbol: str,
        filled_qty: int,
        filled_price: Decimal,
        side: str,
    ) -> JournalEntry:
        """Log a filled order."""
        data = {
            "filled_qty": filled_qty,
            "filled_price": str(filled_price),
            "side": side,
            "notional": str(filled_qty * filled_price),
        }
        
        return self._create_entry(
            JournalEventType.ORDER_FILLED,
            symbol=symbol,
            data=data,
            order_id=order_id,
            success=True,
        )
    
    async def log_order_rejected(self, order_request, reason: str) -> JournalEntry:
        """Log a rejected order."""
        data = {
            "symbol": order_request.symbol,
            "side": order_request.side.value if hasattr(order_request.side, 'value') else order_request.side,
            "qty": order_request.qty,
            "rejection_reason": reason,
        }
        
        return self._create_entry(
            JournalEventType.ORDER_REJECTED,
            symbol=order_request.symbol,
            data=data,
            client_order_id=order_request.client_order_id,
            success=False,
            error=reason,
        )
    
    async def log_order_pending_approval(self, order_request, reason: str) -> JournalEntry:
        """Log an order pending human approval."""
        data = {
            "symbol": order_request.symbol,
            "side": order_request.side.value if hasattr(order_request.side, 'value') else order_request.side,
            "qty": order_request.qty,
            "approval_reason": reason,
        }
        
        return self._create_entry(
            JournalEventType.ORDER_PENDING_APPROVAL,
            symbol=order_request.symbol,
            data=data,
            client_order_id=order_request.client_order_id,
        )
    
    async def log_order_dry_run(self, order_request, risk_result) -> JournalEntry:
        """Log a dry-run order."""
        data = {
            "symbol": order_request.symbol,
            "side": order_request.side.value if hasattr(order_request.side, 'value') else order_request.side,
            "qty": order_request.qty,
            "risk_checks_passed": risk_result.checks_passed,
            "risk_warnings": risk_result.warnings,
        }
        
        return self._create_entry(
            JournalEventType.ORDER_DRY_RUN,
            symbol=order_request.symbol,
            data=data,
            client_order_id=order_request.client_order_id,
            success=True,
        )
    
    async def log_order_error(self, order_request, error: str) -> JournalEntry:
        """Log an order error."""
        return self._create_entry(
            JournalEventType.ORDER_ERROR,
            symbol=order_request.symbol,
            data={"error_details": error},
            client_order_id=order_request.client_order_id,
            success=False,
            error=error,
        )
    
    # Risk event logging
    async def log_risk_check(
        self,
        symbol: str,
        passed: bool,
        checks_passed: List[str],
        checks_failed: List[str],
        warnings: List[str],
    ) -> JournalEntry:
        """Log a risk check result."""
        event_type = JournalEventType.RISK_CHECK_PASSED if passed else JournalEventType.RISK_CHECK_FAILED
        
        return self._create_entry(
            event_type,
            symbol=symbol,
            data={
                "checks_passed": checks_passed,
                "checks_failed": checks_failed,
                "warnings": warnings,
            },
            success=passed,
        )
    
    async def log_kill_switch(self, reason: str) -> JournalEntry:
        """Log kill switch activation."""
        return self._create_entry(
            JournalEventType.KILL_SWITCH_ACTIVATED,
            data={"reason": reason},
            success=True,
        )
    
    async def log_circuit_breaker_trip(self, reason: str) -> JournalEntry:
        """Log circuit breaker trip."""
        return self._create_entry(
            JournalEventType.CIRCUIT_BREAKER_TRIPPED,
            data={"reason": reason},
            success=True,
        )
    
    # Trade decision logging
    async def log_trade_decision(
        self,
        symbol: str,
        action: str,  # "buy", "sell", "hold", "pass"
        reason: str,
        inputs: Optional[Dict] = None,
        strategy: Optional[str] = None,
        confidence: Optional[float] = None,
    ) -> JournalEntry:
        """
        Log a trade decision with full context.
        
        Args:
            symbol: The symbol being evaluated
            action: Decision action (buy/sell/hold/pass)
            reason: Human-readable reason for decision
            inputs: Data inputs that led to decision (signals, indicators, etc.)
            strategy: Strategy name
            confidence: Confidence level 0-1
        """
        data = {
            "action": action,
            "reason": reason,
            "inputs": inputs or {},
            "confidence": confidence,
        }
        
        return self._create_entry(
            JournalEventType.TRADE_DECISION,
            symbol=symbol,
            data=data,
            strategy=strategy,
        )
    
    async def log_signal(
        self,
        symbol: str,
        signal_type: str,
        signal_value: Any,
        strategy: Optional[str] = None,
        metadata: Optional[Dict] = None,
    ) -> JournalEntry:
        """Log a trading signal."""
        data = {
            "signal_type": signal_type,
            "signal_value": signal_value,
            "metadata": metadata or {},
        }
        
        return self._create_entry(
            JournalEventType.SIGNAL_GENERATED,
            symbol=symbol,
            data=data,
            strategy=strategy,
        )
    
    async def log_note(
        self,
        note: str,
        symbol: Optional[str] = None,
        tags: Optional[List[str]] = None,
    ) -> JournalEntry:
        """Log a free-form note."""
        return self._create_entry(
            JournalEventType.NOTE,
            symbol=symbol,
            data={"note": note, "tags": tags or []},
        )
    
    # Query methods
    def get_entries(
        self,
        date: Optional[date] = None,
        event_type: Optional[JournalEventType] = None,
        symbol: Optional[str] = None,
        limit: int = 100,
    ) -> List[JournalEntry]:
        """
        Get journal entries with filters.
        
        Args:
            date: Filter by date (None for all)
            event_type: Filter by event type
            symbol: Filter by symbol
            limit: Max entries to return
        
        Returns:
            List of matching entries
        """
        entries = self._entries.copy()
        
        # Also load from file if date specified
        if date and self.persist_to_file:
            filepath = self.journal_dir / f"{date.isoformat()}.jsonl"
            if filepath.exists():
                with open(filepath, "r") as f:
                    for line in f:
                        try:
                            entry = JournalEntry.from_dict(json.loads(line))
                            if entry not in entries:
                                entries.append(entry)
                        except Exception:
                            pass
        
        # Filter
        if date:
            entries = [e for e in entries if e.timestamp.date() == date]
        if event_type:
            entries = [e for e in entries if e.event_type == event_type]
        if symbol:
            entries = [e for e in entries if e.symbol == symbol]
        
        # Sort by timestamp descending
        entries.sort(key=lambda e: e.timestamp, reverse=True)
        
        return entries[:limit]
    
    def get_order_history(self, client_order_id: str) -> List[JournalEntry]:
        """Get all entries for a specific order."""
        return [
            e for e in self._entries
            if e.client_order_id == client_order_id
        ]
    
    def get_daily_summary(self, date: Optional[date] = None) -> Dict[str, Any]:
        """Get summary statistics for a day."""
        target_date = date or datetime.now().date()
        entries = self.get_entries(date=target_date, limit=10000)
        
        orders_attempted = len([e for e in entries if e.event_type == JournalEventType.ORDER_ATTEMPT])
        orders_submitted = len([e for e in entries if e.event_type == JournalEventType.ORDER_SUBMITTED])
        orders_filled = len([e for e in entries if e.event_type == JournalEventType.ORDER_FILLED])
        orders_rejected = len([e for e in entries if e.event_type == JournalEventType.ORDER_REJECTED])
        
        return {
            "date": target_date.isoformat(),
            "total_entries": len(entries),
            "orders_attempted": orders_attempted,
            "orders_submitted": orders_submitted,
            "orders_filled": orders_filled,
            "orders_rejected": orders_rejected,
            "fill_rate": orders_filled / orders_submitted if orders_submitted > 0 else 0,
            "rejection_rate": orders_rejected / orders_attempted if orders_attempted > 0 else 0,
            "risk_events": len([e for e in entries if "risk" in e.event_type.value.lower()]),
            "kill_switch_events": len([e for e in entries if "kill_switch" in e.event_type.value]),
        }
    
    # Export methods
    def export_json(self, filepath: str, date: Optional[date] = None):
        """Export entries to JSON file."""
        entries = self.get_entries(date=date, limit=100000)
        
        with open(filepath, "w") as f:
            json.dump(
                [e.to_dict() for e in entries],
                f,
                cls=DecimalEncoder,
                indent=2,
            )
    
    def export_csv(self, filepath: str, date: Optional[date] = None):
        """Export entries to CSV file."""
        import csv
        
        entries = self.get_entries(date=date, limit=100000)
        
        with open(filepath, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=[
                "event_id", "timestamp", "event_type", "symbol",
                "order_id", "client_order_id", "success", "error",
            ])
            writer.writeheader()
            for e in entries:
                writer.writerow({
                    "event_id": e.event_id,
                    "timestamp": e.timestamp.isoformat(),
                    "event_type": e.event_type.value,
                    "symbol": e.symbol,
                    "order_id": e.order_id,
                    "client_order_id": e.client_order_id,
                    "success": e.success,
                    "error": e.error,
                })
