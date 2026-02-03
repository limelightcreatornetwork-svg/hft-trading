"""
Risk module - Comprehensive Risk Management for HFT Trading

Components:
- RiskEngine: Core pre-trade and runtime risk controls
- PositionSizer: Kelly criterion and risk-based position sizing
- DrawdownProtector: Max drawdown protection and auto-liquidation
- CorrelationRiskManager: Sector/correlation-based position limits
- PnLTracker: Real-time P&L tracking with alerts
- IntegratedRiskManager: Unified interface combining all components
- ApprovalWorkflow: Human approval queue for large/risky orders
"""

# Core Risk Engine
from .engine import (
    RiskEngine,
    RiskLimits,
    RiskCheckResult,
    RiskAction,
    Order,
    Position,
    CircuitState,
    SpendTracker,
    LossTracker,
    CircuitBreaker,
    get_risk_engine,
    configure_risk_engine,
)

# Approval Workflow
from .approval import (
    ApprovalWorkflow,
    ApprovalRequest,
    ApprovalStatus,
    get_approval_workflow,
    configure_approval_workflow,
)

# Position Sizing (Kelly Criterion)
from .position_sizing import (
    PositionSizer,
    SizingMethod,
    TradeStats,
    PositionSizeResult,
    calculate_kelly_from_trades,
    optimal_f_from_trades,
)

# Drawdown Protection
from .drawdown_protection import (
    DrawdownProtector,
    DrawdownConfig,
    DrawdownState,
    DrawdownLevel,
    LossLimitType,
    LiquidationOrder,
    create_conservative_protector,
)

# Correlation-Based Limits
from .correlation_limits import (
    CorrelationRiskManager,
    CorrelationLimits,
    ExposureCheckResult,
    PortfolioExposure,
    Sector,
    SYMBOL_SECTORS,
    CORRELATION_GROUPS,
)

# Real-Time P&L Tracking
from .pnl_tracker import (
    PnLTracker,
    AlertConfig,
    AlertType,
    AlertPriority,
    PnLAlert,
    PositionPnL,
    PortfolioPnL,
    create_small_account_tracker,
)

# Integrated Risk Manager
from .integrated_risk_manager import (
    IntegratedRiskManager,
    RiskManagerConfig,
    TradeDecision,
    create_risk_manager,
)

__all__ = [
    # Core Risk Engine
    "RiskEngine",
    "RiskLimits",
    "RiskCheckResult",
    "RiskAction",
    "Order",
    "Position",
    "CircuitState",
    "SpendTracker",
    "LossTracker",
    "CircuitBreaker",
    "get_risk_engine",
    "configure_risk_engine",
    
    # Approval Workflow
    "ApprovalWorkflow",
    "ApprovalRequest",
    "ApprovalStatus",
    "get_approval_workflow",
    "configure_approval_workflow",
    
    # Position Sizing
    "PositionSizer",
    "SizingMethod",
    "TradeStats",
    "PositionSizeResult",
    "calculate_kelly_from_trades",
    "optimal_f_from_trades",
    
    # Drawdown Protection
    "DrawdownProtector",
    "DrawdownConfig",
    "DrawdownState",
    "DrawdownLevel",
    "LossLimitType",
    "LiquidationOrder",
    "create_conservative_protector",
    
    # Correlation Limits
    "CorrelationRiskManager",
    "CorrelationLimits",
    "ExposureCheckResult",
    "PortfolioExposure",
    "Sector",
    "SYMBOL_SECTORS",
    "CORRELATION_GROUPS",
    
    # P&L Tracking
    "PnLTracker",
    "AlertConfig",
    "AlertType",
    "AlertPriority",
    "PnLAlert",
    "PositionPnL",
    "PortfolioPnL",
    "create_small_account_tracker",
    
    # Integrated Manager
    "IntegratedRiskManager",
    "RiskManagerConfig",
    "TradeDecision",
    "create_risk_manager",
]
