"""
Thesis Tracking System

Provides:
- Thesis creation and management
- Signal-to-thesis linking
- Thesis lifecycle tracking
- P&L attribution by thesis
- Calibration scoring
"""

import asyncio
import json
import logging
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from decimal import Decimal
from enum import Enum
from pathlib import Path
from typing import Optional, Dict, List, Any, Set
import statistics

logger = logging.getLogger(__name__)


class ThesisStatus(Enum):
    """Thesis lifecycle states."""
    DRAFT = "draft"           # Created, not yet acted on
    ACTIVE = "active"         # Has open position or pending orders
    INVALIDATED = "invalidated"  # Signals reversed, thesis abandoned
    REALIZED = "realized"     # Position closed, outcome known
    EXPIRED = "expired"       # Market closed before action


@dataclass
class Signal:
    """Trading signal that supports a thesis."""
    id: str
    signal_type: str  # momentum, volume_spike, news, model, etc.
    value: float
    strength: float  # 0-1 normalized
    timestamp: datetime
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "signal_type": self.signal_type,
            "value": self.value,
            "strength": self.strength,
            "timestamp": self.timestamp.isoformat(),
            "metadata": self.metadata,
        }
    
    @classmethod
    def from_dict(cls, data: Dict) -> "Signal":
        return cls(
            id=data["id"],
            signal_type=data["signal_type"],
            value=data["value"],
            strength=data["strength"],
            timestamp=datetime.fromisoformat(data["timestamp"]),
            metadata=data.get("metadata", {}),
        )


@dataclass
class Thesis:
    """
    Trading thesis representing a market hypothesis.
    
    A thesis connects signals to trades and provides:
    - Documented reasoning for trades
    - P&L attribution
    - Calibration tracking
    """
    id: str
    market_ticker: str
    hypothesis: str  # Human-readable explanation
    direction: str  # "yes" or "no"
    
    # Pricing
    entry_price_target: int  # 1-99 cents
    exit_price_target: int   # Expected outcome price
    model_probability: float  # Our estimated true probability
    market_probability: float  # Market implied probability at creation
    
    # Confidence
    confidence: float  # 0-1, derived from signal strength
    edge: float        # fee-adjusted expected edge
    
    # Signals
    supporting_signals: List[Signal] = field(default_factory=list)
    
    # Status
    status: ThesisStatus = ThesisStatus.DRAFT
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    invalidated_at: Optional[datetime] = None
    realized_at: Optional[datetime] = None
    invalidation_reason: Optional[str] = None
    
    # Execution
    order_ids: List[str] = field(default_factory=list)
    filled_count: int = 0
    avg_fill_price: Optional[int] = None
    
    # Outcome (after realization)
    exit_price: Optional[int] = None
    realized_pnl: Optional[Decimal] = None
    outcome_correct: Optional[bool] = None  # Did market resolve in predicted direction?
    
    # Metadata
    strategy: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    notes: str = ""
    
    def __post_init__(self):
        if not self.id:
            self.id = str(uuid.uuid4())
    
    @property
    def is_active(self) -> bool:
        return self.status == ThesisStatus.ACTIVE
    
    @property
    def signal_strength(self) -> float:
        """Average signal strength."""
        if not self.supporting_signals:
            return 0.0
        return statistics.mean(s.strength for s in self.supporting_signals)
    
    @property
    def age_hours(self) -> float:
        """Hours since thesis creation."""
        return (datetime.now() - self.created_at).total_seconds() / 3600
    
    def add_signal(self, signal: Signal):
        """Add supporting signal."""
        self.supporting_signals.append(signal)
        self.updated_at = datetime.now()
        # Recalculate confidence
        self.confidence = self.signal_strength
    
    def add_order(self, order_id: str):
        """Link order to thesis."""
        if order_id not in self.order_ids:
            self.order_ids.append(order_id)
            self.updated_at = datetime.now()
    
    def record_fill(self, count: int, price: int):
        """Record a fill against this thesis."""
        if self.status == ThesisStatus.DRAFT:
            self.status = ThesisStatus.ACTIVE
        
        # Update average fill price
        total_count = self.filled_count + count
        if self.avg_fill_price:
            self.avg_fill_price = int(
                (self.avg_fill_price * self.filled_count + price * count) / total_count
            )
        else:
            self.avg_fill_price = price
        
        self.filled_count = total_count
        self.updated_at = datetime.now()
    
    def invalidate(self, reason: str):
        """Mark thesis as invalidated."""
        self.status = ThesisStatus.INVALIDATED
        self.invalidation_reason = reason
        self.invalidated_at = datetime.now()
        self.updated_at = datetime.now()
        logger.info(f"Thesis {self.id} invalidated: {reason}")
    
    def realize(self, exit_price: int, outcome_correct: bool):
        """Mark thesis as realized with outcome."""
        self.status = ThesisStatus.REALIZED
        self.exit_price = exit_price
        self.outcome_correct = outcome_correct
        self.realized_at = datetime.now()
        self.updated_at = datetime.now()
        
        # Calculate P&L
        if self.avg_fill_price and self.filled_count:
            if self.direction == "yes":
                # Bought YES: profit if price goes up
                pnl_cents = (exit_price - self.avg_fill_price) * self.filled_count
            else:
                # Bought NO: profit if YES price goes down
                pnl_cents = (self.avg_fill_price - exit_price) * self.filled_count
            
            # Subtract fees (7 cents per contract, entry + exit)
            fees = self.filled_count * 14  # 7 entry + 7 exit
            self.realized_pnl = Decimal(pnl_cents - fees) / 100  # Convert to dollars
        
        logger.info(f"Thesis {self.id} realized: PnL=${self.realized_pnl}, correct={outcome_correct}")
    
    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "market_ticker": self.market_ticker,
            "hypothesis": self.hypothesis,
            "direction": self.direction,
            "entry_price_target": self.entry_price_target,
            "exit_price_target": self.exit_price_target,
            "model_probability": self.model_probability,
            "market_probability": self.market_probability,
            "confidence": self.confidence,
            "edge": self.edge,
            "supporting_signals": [s.to_dict() for s in self.supporting_signals],
            "status": self.status.value,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "invalidated_at": self.invalidated_at.isoformat() if self.invalidated_at else None,
            "realized_at": self.realized_at.isoformat() if self.realized_at else None,
            "invalidation_reason": self.invalidation_reason,
            "order_ids": self.order_ids,
            "filled_count": self.filled_count,
            "avg_fill_price": self.avg_fill_price,
            "exit_price": self.exit_price,
            "realized_pnl": str(self.realized_pnl) if self.realized_pnl else None,
            "outcome_correct": self.outcome_correct,
            "strategy": self.strategy,
            "tags": self.tags,
            "notes": self.notes,
        }
    
    @classmethod
    def from_dict(cls, data: Dict) -> "Thesis":
        signals = [Signal.from_dict(s) for s in data.get("supporting_signals", [])]
        return cls(
            id=data["id"],
            market_ticker=data["market_ticker"],
            hypothesis=data["hypothesis"],
            direction=data["direction"],
            entry_price_target=data["entry_price_target"],
            exit_price_target=data["exit_price_target"],
            model_probability=data["model_probability"],
            market_probability=data["market_probability"],
            confidence=data["confidence"],
            edge=data["edge"],
            supporting_signals=signals,
            status=ThesisStatus(data["status"]),
            created_at=datetime.fromisoformat(data["created_at"]),
            updated_at=datetime.fromisoformat(data["updated_at"]),
            invalidated_at=datetime.fromisoformat(data["invalidated_at"]) if data.get("invalidated_at") else None,
            realized_at=datetime.fromisoformat(data["realized_at"]) if data.get("realized_at") else None,
            invalidation_reason=data.get("invalidation_reason"),
            order_ids=data.get("order_ids", []),
            filled_count=data.get("filled_count", 0),
            avg_fill_price=data.get("avg_fill_price"),
            exit_price=data.get("exit_price"),
            realized_pnl=Decimal(data["realized_pnl"]) if data.get("realized_pnl") else None,
            outcome_correct=data.get("outcome_correct"),
            strategy=data.get("strategy"),
            tags=data.get("tags", []),
            notes=data.get("notes", ""),
        )


class ThesisTracker:
    """
    Manages thesis lifecycle and persistence.
    
    Features:
    - Create/update/query theses
    - Link orders to theses
    - Track outcomes and calibration
    - Persist to file/database
    
    Usage:
        tracker = ThesisTracker()
        
        # Create thesis
        thesis = tracker.create_thesis(
            market_ticker="TICKER-123",
            hypothesis="Market underprices YES due to recency bias",
            direction="yes",
            entry_price_target=45,
            exit_price_target=70,
            model_probability=0.68,
            market_probability=0.45,
        )
        
        # Add signal
        tracker.add_signal(thesis.id, Signal(...))
        
        # Link order
        tracker.link_order(thesis.id, "order-abc")
        
        # Record fill
        tracker.record_fill(thesis.id, count=10, price=46)
        
        # Get active theses for a market
        active = tracker.get_active_theses("TICKER-123")
    """
    
    def __init__(
        self,
        storage_dir: Optional[str] = None,
        auto_save: bool = True,
    ):
        self.storage_dir = Path(storage_dir) if storage_dir else Path.home() / ".hft" / "theses"
        self.auto_save = auto_save
        
        # In-memory storage
        self._theses: Dict[str, Thesis] = {}
        self._by_market: Dict[str, Set[str]] = {}  # market_ticker -> thesis_ids
        self._by_order: Dict[str, str] = {}  # order_id -> thesis_id
        
        # Ensure storage directory exists
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        
        # Load existing theses
        self._load_all()
    
    def _load_all(self):
        """Load all theses from storage."""
        for filepath in self.storage_dir.glob("*.json"):
            try:
                with open(filepath, "r") as f:
                    data = json.load(f)
                    thesis = Thesis.from_dict(data)
                    self._index_thesis(thesis)
            except Exception as e:
                logger.error(f"Failed to load thesis from {filepath}: {e}")
    
    def _index_thesis(self, thesis: Thesis):
        """Add thesis to indexes."""
        self._theses[thesis.id] = thesis
        
        if thesis.market_ticker not in self._by_market:
            self._by_market[thesis.market_ticker] = set()
        self._by_market[thesis.market_ticker].add(thesis.id)
        
        for order_id in thesis.order_ids:
            self._by_order[order_id] = thesis.id
    
    def _save_thesis(self, thesis: Thesis):
        """Save thesis to storage."""
        if self.auto_save:
            filepath = self.storage_dir / f"{thesis.id}.json"
            with open(filepath, "w") as f:
                json.dump(thesis.to_dict(), f, indent=2)
    
    def create_thesis(
        self,
        market_ticker: str,
        hypothesis: str,
        direction: str,
        entry_price_target: int,
        exit_price_target: int,
        model_probability: float,
        market_probability: float,
        strategy: Optional[str] = None,
        signals: Optional[List[Signal]] = None,
        tags: Optional[List[str]] = None,
    ) -> Thesis:
        """
        Create a new thesis.
        
        Args:
            market_ticker: Kalshi market ticker
            hypothesis: Human-readable explanation
            direction: "yes" or "no"
            entry_price_target: Target entry price (1-99 cents)
            exit_price_target: Expected exit/settlement price
            model_probability: Our probability estimate (0-1)
            market_probability: Market implied probability (0-1)
            strategy: Strategy that generated this thesis
            signals: Supporting signals
            tags: Categorization tags
        
        Returns:
            Created Thesis object
        """
        # Calculate edge
        from .pricing import FeeCalculator
        fee_calc = FeeCalculator()
        edge = fee_calc.calculate_edge(
            model_prob=model_probability,
            market_price=int(market_probability * 100),
            direction=direction,
        )
        
        # Calculate confidence from signals
        confidence = 0.5
        if signals:
            confidence = statistics.mean(s.strength for s in signals)
        
        thesis = Thesis(
            id=str(uuid.uuid4()),
            market_ticker=market_ticker,
            hypothesis=hypothesis,
            direction=direction,
            entry_price_target=entry_price_target,
            exit_price_target=exit_price_target,
            model_probability=model_probability,
            market_probability=market_probability,
            confidence=confidence,
            edge=edge,
            supporting_signals=signals or [],
            strategy=strategy,
            tags=tags or [],
        )
        
        self._index_thesis(thesis)
        self._save_thesis(thesis)
        
        logger.info(f"Created thesis {thesis.id} for {market_ticker}: {hypothesis[:50]}...")
        return thesis
    
    def get_thesis(self, thesis_id: str) -> Optional[Thesis]:
        """Get thesis by ID."""
        return self._theses.get(thesis_id)
    
    def get_thesis_by_order(self, order_id: str) -> Optional[Thesis]:
        """Get thesis linked to an order."""
        thesis_id = self._by_order.get(order_id)
        if thesis_id:
            return self._theses.get(thesis_id)
        return None
    
    def get_theses_for_market(
        self,
        market_ticker: str,
        status: Optional[ThesisStatus] = None,
    ) -> List[Thesis]:
        """Get all theses for a market."""
        thesis_ids = self._by_market.get(market_ticker, set())
        theses = [self._theses[tid] for tid in thesis_ids if tid in self._theses]
        
        if status:
            theses = [t for t in theses if t.status == status]
        
        return sorted(theses, key=lambda t: t.created_at, reverse=True)
    
    def get_active_theses(self, market_ticker: Optional[str] = None) -> List[Thesis]:
        """Get all active theses, optionally filtered by market."""
        if market_ticker:
            return self.get_theses_for_market(market_ticker, status=ThesisStatus.ACTIVE)
        
        return [t for t in self._theses.values() if t.status == ThesisStatus.ACTIVE]
    
    def add_signal(self, thesis_id: str, signal: Signal):
        """Add signal to thesis."""
        thesis = self.get_thesis(thesis_id)
        if thesis:
            thesis.add_signal(signal)
            self._save_thesis(thesis)
    
    def link_order(self, thesis_id: str, order_id: str):
        """Link order to thesis."""
        thesis = self.get_thesis(thesis_id)
        if thesis:
            thesis.add_order(order_id)
            self._by_order[order_id] = thesis_id
            self._save_thesis(thesis)
    
    def record_fill(self, thesis_id: str, count: int, price: int):
        """Record fill against thesis."""
        thesis = self.get_thesis(thesis_id)
        if thesis:
            thesis.record_fill(count, price)
            self._save_thesis(thesis)
    
    def invalidate_thesis(self, thesis_id: str, reason: str):
        """Invalidate a thesis."""
        thesis = self.get_thesis(thesis_id)
        if thesis:
            thesis.invalidate(reason)
            self._save_thesis(thesis)
    
    def realize_thesis(self, thesis_id: str, exit_price: int, outcome_correct: bool):
        """Mark thesis as realized."""
        thesis = self.get_thesis(thesis_id)
        if thesis:
            thesis.realize(exit_price, outcome_correct)
            self._save_thesis(thesis)
    
    def get_calibration_stats(self) -> Dict[str, Any]:
        """
        Calculate calibration statistics across realized theses.
        
        Returns:
            Dict with calibration metrics by probability bucket
        """
        realized = [t for t in self._theses.values() if t.status == ThesisStatus.REALIZED]
        
        if not realized:
            return {"error": "No realized theses"}
        
        # Bucket by predicted probability
        buckets: Dict[str, List[Thesis]] = {
            "0-20%": [],
            "20-40%": [],
            "40-60%": [],
            "60-80%": [],
            "80-100%": [],
        }
        
        for thesis in realized:
            prob = thesis.model_probability
            if prob < 0.2:
                buckets["0-20%"].append(thesis)
            elif prob < 0.4:
                buckets["20-40%"].append(thesis)
            elif prob < 0.6:
                buckets["40-60%"].append(thesis)
            elif prob < 0.8:
                buckets["60-80%"].append(thesis)
            else:
                buckets["80-100%"].append(thesis)
        
        # Calculate accuracy per bucket
        calibration = {}
        for bucket, theses in buckets.items():
            if theses:
                correct = sum(1 for t in theses if t.outcome_correct)
                calibration[bucket] = {
                    "count": len(theses),
                    "accuracy": correct / len(theses),
                    "avg_predicted": statistics.mean(t.model_probability for t in theses),
                    "avg_pnl": float(statistics.mean(
                        float(t.realized_pnl or 0) for t in theses
                    )),
                }
        
        # Calculate Brier score
        brier_scores = []
        for thesis in realized:
            actual = 1.0 if thesis.outcome_correct else 0.0
            brier_scores.append((thesis.model_probability - actual) ** 2)
        
        brier_score = statistics.mean(brier_scores) if brier_scores else 1.0
        
        return {
            "total_realized": len(realized),
            "overall_accuracy": sum(1 for t in realized if t.outcome_correct) / len(realized),
            "brier_score": brier_score,
            "calibration_by_bucket": calibration,
            "total_pnl": float(sum(float(t.realized_pnl or 0) for t in realized)),
        }
    
    def get_strategy_stats(self) -> Dict[str, Any]:
        """Get performance statistics by strategy."""
        by_strategy: Dict[str, List[Thesis]] = {}
        
        for thesis in self._theses.values():
            strategy = thesis.strategy or "unknown"
            if strategy not in by_strategy:
                by_strategy[strategy] = []
            by_strategy[strategy].append(thesis)
        
        stats = {}
        for strategy, theses in by_strategy.items():
            realized = [t for t in theses if t.status == ThesisStatus.REALIZED]
            stats[strategy] = {
                "total": len(theses),
                "active": len([t for t in theses if t.status == ThesisStatus.ACTIVE]),
                "realized": len(realized),
                "invalidated": len([t for t in theses if t.status == ThesisStatus.INVALIDATED]),
                "accuracy": (
                    sum(1 for t in realized if t.outcome_correct) / len(realized)
                    if realized else 0
                ),
                "total_pnl": float(sum(float(t.realized_pnl or 0) for t in realized)),
            }
        
        return stats
    
    def cleanup_old_theses(self, days: int = 30):
        """Remove theses older than specified days that are not active."""
        cutoff = datetime.now() - timedelta(days=days)
        to_remove = []
        
        for thesis_id, thesis in self._theses.items():
            if thesis.status != ThesisStatus.ACTIVE and thesis.updated_at < cutoff:
                to_remove.append(thesis_id)
        
        for thesis_id in to_remove:
            thesis = self._theses.pop(thesis_id)
            
            # Remove from indexes
            if thesis.market_ticker in self._by_market:
                self._by_market[thesis.market_ticker].discard(thesis_id)
            
            for order_id in thesis.order_ids:
                self._by_order.pop(order_id, None)
            
            # Delete file
            filepath = self.storage_dir / f"{thesis_id}.json"
            if filepath.exists():
                filepath.unlink()
        
        logger.info(f"Cleaned up {len(to_remove)} old theses")
        return len(to_remove)
