"""
Human Approval Workflow

Provides:
- Approval queue for orders requiring human review
- Notification integration (webhook, telegram, etc.)
- Timeout handling
- Approval/rejection tracking
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from decimal import Decimal
from enum import Enum
from typing import Optional, Dict, List, Callable, Any, Awaitable
from collections import deque
import uuid
import json

logger = logging.getLogger(__name__)


class ApprovalStatus(Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


@dataclass
class ApprovalRequest:
    """A request requiring human approval."""
    request_id: str
    created_at: datetime
    symbol: str
    side: str
    qty: int
    order_type: str
    notional: Decimal
    reason: str  # Why approval is required
    
    # Order details
    limit_price: Optional[Decimal] = None
    stop_price: Optional[Decimal] = None
    client_order_id: Optional[str] = None
    
    # Status
    status: ApprovalStatus = ApprovalStatus.PENDING
    expires_at: Optional[datetime] = None
    
    # Response
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    
    # Context
    risk_checks_passed: List[str] = field(default_factory=list)
    risk_warnings: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "request_id": self.request_id,
            "created_at": self.created_at.isoformat(),
            "symbol": self.symbol,
            "side": self.side,
            "qty": self.qty,
            "order_type": self.order_type,
            "notional": str(self.notional),
            "reason": self.reason,
            "limit_price": str(self.limit_price) if self.limit_price else None,
            "stop_price": str(self.stop_price) if self.stop_price else None,
            "client_order_id": self.client_order_id,
            "status": self.status.value,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "approved_by": self.approved_by,
            "approved_at": self.approved_at.isoformat() if self.approved_at else None,
            "rejection_reason": self.rejection_reason,
            "risk_checks_passed": self.risk_checks_passed,
            "risk_warnings": self.risk_warnings,
        }
    
    def format_message(self) -> str:
        """Format as human-readable message."""
        lines = [
            f"🔔 **Approval Required**",
            f"",
            f"**Symbol:** {self.symbol}",
            f"**Action:** {self.side.upper()} {self.qty} shares",
            f"**Type:** {self.order_type}",
            f"**Notional:** ${self.notional:,.2f}",
        ]
        
        if self.limit_price:
            lines.append(f"**Limit:** ${self.limit_price}")
        if self.stop_price:
            lines.append(f"**Stop:** ${self.stop_price}")
        
        lines.extend([
            f"",
            f"**Reason:** {self.reason}",
            f"",
            f"**Request ID:** `{self.request_id[:8]}`",
            f"**Expires:** {self.expires_at.strftime('%H:%M:%S') if self.expires_at else 'Never'}",
        ])
        
        if self.risk_warnings:
            lines.append(f"")
            lines.append(f"⚠️ **Warnings:**")
            for w in self.risk_warnings:
                lines.append(f"  • {w}")
        
        return "\n".join(lines)


class ApprovalWorkflow:
    """
    Human approval workflow manager.
    
    Features:
    - Queue pending approvals
    - Timeout handling
    - Callback notifications
    - Approval/rejection API
    
    Usage:
        workflow = ApprovalWorkflow(timeout_minutes=10)
        
        # Configure notification
        workflow.on_approval_needed = async_notify_function
        
        # Queue an order for approval
        request = await workflow.queue_for_approval(order, risk_result)
        
        # Wait for approval (or check status)
        result = await workflow.wait_for_approval(request.request_id, timeout=60)
        
        # Or approve/reject via API
        workflow.approve(request_id, approver="admin")
        workflow.reject(request_id, reason="Too risky")
    """
    
    def __init__(
        self,
        timeout_minutes: int = 10,
        max_pending: int = 100,
        on_approval_needed: Optional[Callable[[ApprovalRequest], Awaitable[None]]] = None,
        on_approval_resolved: Optional[Callable[[ApprovalRequest], Awaitable[None]]] = None,
    ):
        self.timeout_minutes = timeout_minutes
        self.max_pending = max_pending
        self.on_approval_needed = on_approval_needed
        self.on_approval_resolved = on_approval_resolved
        
        # Pending requests
        self._pending: Dict[str, ApprovalRequest] = {}
        
        # History
        self._history: deque = deque(maxlen=1000)
        
        # Waiters for blocking approval
        self._waiters: Dict[str, asyncio.Event] = {}
    
    async def queue_for_approval(
        self,
        symbol: str,
        side: str,
        qty: int,
        order_type: str,
        notional: Decimal,
        reason: str,
        limit_price: Optional[Decimal] = None,
        stop_price: Optional[Decimal] = None,
        client_order_id: Optional[str] = None,
        risk_checks_passed: Optional[List[str]] = None,
        risk_warnings: Optional[List[str]] = None,
        metadata: Optional[Dict] = None,
    ) -> ApprovalRequest:
        """
        Queue an order for human approval.
        
        Args:
            symbol: Trading symbol
            side: buy/sell
            qty: Order quantity
            order_type: market/limit/etc
            notional: Order value
            reason: Why approval is required
            ... other order details
        
        Returns:
            ApprovalRequest object
        """
        if len(self._pending) >= self.max_pending:
            # Expire oldest pending request
            oldest_id = next(iter(self._pending))
            await self._expire(oldest_id)
        
        request = ApprovalRequest(
            request_id=str(uuid.uuid4()),
            created_at=datetime.now(),
            symbol=symbol,
            side=side,
            qty=qty,
            order_type=order_type,
            notional=notional,
            reason=reason,
            limit_price=limit_price,
            stop_price=stop_price,
            client_order_id=client_order_id,
            expires_at=datetime.now() + timedelta(minutes=self.timeout_minutes),
            risk_checks_passed=risk_checks_passed or [],
            risk_warnings=risk_warnings or [],
            metadata=metadata or {},
        )
        
        self._pending[request.request_id] = request
        self._waiters[request.request_id] = asyncio.Event()
        
        logger.info(f"Approval queued: {request.request_id[:8]} - {symbol} {side} {qty}")
        
        # Notify
        if self.on_approval_needed:
            try:
                await self.on_approval_needed(request)
            except Exception as e:
                logger.error(f"Approval notification failed: {e}")
        
        return request
    
    async def wait_for_approval(
        self,
        request_id: str,
        timeout: Optional[float] = None,
    ) -> ApprovalRequest:
        """
        Wait for an approval decision.
        
        Args:
            request_id: The request ID to wait for
            timeout: Max seconds to wait (None = use request expiry)
        
        Returns:
            ApprovalRequest with updated status
        
        Raises:
            TimeoutError: If approval times out
            KeyError: If request not found
        """
        if request_id not in self._pending:
            # Check history
            for req in self._history:
                if req.request_id == request_id:
                    return req
            raise KeyError(f"Request not found: {request_id}")
        
        request = self._pending[request_id]
        event = self._waiters[request_id]
        
        # Calculate timeout
        if timeout is None and request.expires_at:
            timeout = (request.expires_at - datetime.now()).total_seconds()
        
        try:
            await asyncio.wait_for(event.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            await self._expire(request_id)
            raise TimeoutError(f"Approval timed out: {request_id}")
        
        return request
    
    def approve(
        self,
        request_id: str,
        approver: str = "system",
        notes: Optional[str] = None,
    ) -> ApprovalRequest:
        """
        Approve a pending request.
        
        Args:
            request_id: Request to approve
            approver: Who approved it
            notes: Optional notes
        
        Returns:
            Updated ApprovalRequest
        """
        if request_id not in self._pending:
            raise KeyError(f"Request not found or already resolved: {request_id}")
        
        request = self._pending[request_id]
        request.status = ApprovalStatus.APPROVED
        request.approved_by = approver
        request.approved_at = datetime.now()
        if notes:
            request.metadata["approval_notes"] = notes
        
        self._resolve(request_id)
        
        logger.info(f"Approved: {request_id[:8]} by {approver}")
        
        return request
    
    def reject(
        self,
        request_id: str,
        reason: str,
        rejector: str = "system",
    ) -> ApprovalRequest:
        """
        Reject a pending request.
        
        Args:
            request_id: Request to reject
            reason: Rejection reason
            rejector: Who rejected it
        
        Returns:
            Updated ApprovalRequest
        """
        if request_id not in self._pending:
            raise KeyError(f"Request not found or already resolved: {request_id}")
        
        request = self._pending[request_id]
        request.status = ApprovalStatus.REJECTED
        request.rejection_reason = reason
        request.approved_by = rejector
        request.approved_at = datetime.now()
        
        self._resolve(request_id)
        
        logger.info(f"Rejected: {request_id[:8]} - {reason}")
        
        return request
    
    def cancel(self, request_id: str) -> ApprovalRequest:
        """Cancel a pending request."""
        if request_id not in self._pending:
            raise KeyError(f"Request not found: {request_id}")
        
        request = self._pending[request_id]
        request.status = ApprovalStatus.CANCELLED
        
        self._resolve(request_id)
        
        logger.info(f"Cancelled: {request_id[:8]}")
        
        return request
    
    async def _expire(self, request_id: str):
        """Expire a request that timed out."""
        if request_id not in self._pending:
            return
        
        request = self._pending[request_id]
        request.status = ApprovalStatus.EXPIRED
        
        self._resolve(request_id)
        
        logger.warning(f"Expired: {request_id[:8]}")
    
    def _resolve(self, request_id: str):
        """Move request from pending to history."""
        if request_id in self._pending:
            request = self._pending.pop(request_id)
            self._history.append(request)
            
            # Notify waiter
            if request_id in self._waiters:
                self._waiters[request_id].set()
                del self._waiters[request_id]
            
            # Callback
            if self.on_approval_resolved:
                asyncio.create_task(self._notify_resolved(request))
    
    async def _notify_resolved(self, request: ApprovalRequest):
        """Notify that a request was resolved."""
        try:
            await self.on_approval_resolved(request)
        except Exception as e:
            logger.error(f"Resolution notification failed: {e}")
    
    # Query methods
    def get_pending(self) -> List[ApprovalRequest]:
        """Get all pending approval requests."""
        return list(self._pending.values())
    
    def get_request(self, request_id: str) -> Optional[ApprovalRequest]:
        """Get a specific request by ID."""
        if request_id in self._pending:
            return self._pending[request_id]
        
        for req in self._history:
            if req.request_id == request_id:
                return req
        
        return None
    
    def get_history(
        self,
        limit: int = 100,
        status: Optional[ApprovalStatus] = None,
    ) -> List[ApprovalRequest]:
        """Get approval history."""
        history = list(self._history)
        
        if status:
            history = [r for r in history if r.status == status]
        
        return history[-limit:]
    
    def get_stats(self) -> Dict[str, Any]:
        """Get approval statistics."""
        history = list(self._history)
        
        total = len(history)
        approved = len([r for r in history if r.status == ApprovalStatus.APPROVED])
        rejected = len([r for r in history if r.status == ApprovalStatus.REJECTED])
        expired = len([r for r in history if r.status == ApprovalStatus.EXPIRED])
        
        return {
            "pending": len(self._pending),
            "total_processed": total,
            "approved": approved,
            "rejected": rejected,
            "expired": expired,
            "approval_rate": approved / total if total > 0 else 0,
            "expiry_rate": expired / total if total > 0 else 0,
        }
    
    async def expire_stale(self):
        """Check and expire stale requests. Call periodically."""
        now = datetime.now()
        to_expire = [
            rid for rid, req in self._pending.items()
            if req.expires_at and req.expires_at < now
        ]
        
        for rid in to_expire:
            await self._expire(rid)


# Singleton instance
_approval_workflow: Optional[ApprovalWorkflow] = None

def get_approval_workflow() -> ApprovalWorkflow:
    global _approval_workflow
    if _approval_workflow is None:
        _approval_workflow = ApprovalWorkflow()
    return _approval_workflow

def configure_approval_workflow(**kwargs) -> ApprovalWorkflow:
    global _approval_workflow
    _approval_workflow = ApprovalWorkflow(**kwargs)
    return _approval_workflow
