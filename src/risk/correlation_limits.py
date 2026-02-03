"""
Correlation-Based Position Limits - Sector and Asset Correlation Risk Management

Implements:
- Sector exposure limits
- Correlated asset position limits
- Portfolio concentration by factor
- Real-time correlation-adjusted exposure tracking
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Optional, Dict, List, Set, Tuple
from enum import Enum

logger = logging.getLogger(__name__)


class Sector(Enum):
    """Standard market sectors."""
    TECHNOLOGY = "technology"
    HEALTHCARE = "healthcare"
    FINANCIAL = "financial"
    CONSUMER_CYCLICAL = "consumer_cyclical"
    CONSUMER_DEFENSIVE = "consumer_defensive"
    INDUSTRIALS = "industrials"
    ENERGY = "energy"
    UTILITIES = "utilities"
    REAL_ESTATE = "real_estate"
    MATERIALS = "materials"
    COMMUNICATION = "communication"
    CRYPTO = "crypto"
    UNKNOWN = "unknown"


# Common symbol to sector mapping
SYMBOL_SECTORS: Dict[str, Sector] = {
    # Technology
    "AAPL": Sector.TECHNOLOGY,
    "MSFT": Sector.TECHNOLOGY,
    "GOOGL": Sector.TECHNOLOGY,
    "GOOG": Sector.TECHNOLOGY,
    "META": Sector.TECHNOLOGY,
    "NVDA": Sector.TECHNOLOGY,
    "AMD": Sector.TECHNOLOGY,
    "INTC": Sector.TECHNOLOGY,
    "CRM": Sector.TECHNOLOGY,
    "ORCL": Sector.TECHNOLOGY,
    "ADBE": Sector.TECHNOLOGY,
    "CSCO": Sector.TECHNOLOGY,
    "AVGO": Sector.TECHNOLOGY,
    "TSM": Sector.TECHNOLOGY,
    "ASML": Sector.TECHNOLOGY,
    
    # Healthcare
    "JNJ": Sector.HEALTHCARE,
    "UNH": Sector.HEALTHCARE,
    "PFE": Sector.HEALTHCARE,
    "ABBV": Sector.HEALTHCARE,
    "MRK": Sector.HEALTHCARE,
    "LLY": Sector.HEALTHCARE,
    "TMO": Sector.HEALTHCARE,
    "ABT": Sector.HEALTHCARE,
    
    # Financial
    "JPM": Sector.FINANCIAL,
    "BAC": Sector.FINANCIAL,
    "WFC": Sector.FINANCIAL,
    "GS": Sector.FINANCIAL,
    "MS": Sector.FINANCIAL,
    "C": Sector.FINANCIAL,
    "BLK": Sector.FINANCIAL,
    "SCHW": Sector.FINANCIAL,
    "V": Sector.FINANCIAL,
    "MA": Sector.FINANCIAL,
    "AXP": Sector.FINANCIAL,
    
    # Consumer Cyclical
    "AMZN": Sector.CONSUMER_CYCLICAL,
    "TSLA": Sector.CONSUMER_CYCLICAL,
    "HD": Sector.CONSUMER_CYCLICAL,
    "NKE": Sector.CONSUMER_CYCLICAL,
    "MCD": Sector.CONSUMER_CYCLICAL,
    "SBUX": Sector.CONSUMER_CYCLICAL,
    "TGT": Sector.CONSUMER_CYCLICAL,
    "LOW": Sector.CONSUMER_CYCLICAL,
    
    # Consumer Defensive
    "WMT": Sector.CONSUMER_DEFENSIVE,
    "PG": Sector.CONSUMER_DEFENSIVE,
    "KO": Sector.CONSUMER_DEFENSIVE,
    "PEP": Sector.CONSUMER_DEFENSIVE,
    "COST": Sector.CONSUMER_DEFENSIVE,
    "PM": Sector.CONSUMER_DEFENSIVE,
    
    # Energy
    "XOM": Sector.ENERGY,
    "CVX": Sector.ENERGY,
    "COP": Sector.ENERGY,
    "SLB": Sector.ENERGY,
    "EOG": Sector.ENERGY,
    "OXY": Sector.ENERGY,
    
    # Communication
    "NFLX": Sector.COMMUNICATION,
    "DIS": Sector.COMMUNICATION,
    "CMCSA": Sector.COMMUNICATION,
    "T": Sector.COMMUNICATION,
    "VZ": Sector.COMMUNICATION,
    "TMUS": Sector.COMMUNICATION,
    
    # Industrials
    "BA": Sector.INDUSTRIALS,
    "CAT": Sector.INDUSTRIALS,
    "HON": Sector.INDUSTRIALS,
    "UNP": Sector.INDUSTRIALS,
    "UPS": Sector.INDUSTRIALS,
    "RTX": Sector.INDUSTRIALS,
    "GE": Sector.INDUSTRIALS,
    "LMT": Sector.INDUSTRIALS,
    
    # Utilities
    "NEE": Sector.UTILITIES,
    "DUK": Sector.UTILITIES,
    "SO": Sector.UTILITIES,
    "D": Sector.UTILITIES,
    
    # Real Estate
    "AMT": Sector.REAL_ESTATE,
    "PLD": Sector.REAL_ESTATE,
    "CCI": Sector.REAL_ESTATE,
    "EQIX": Sector.REAL_ESTATE,
    "SPG": Sector.REAL_ESTATE,
    
    # ETFs (treat as their primary sector)
    "SPY": Sector.UNKNOWN,  # Broad market
    "QQQ": Sector.TECHNOLOGY,
    "XLK": Sector.TECHNOLOGY,
    "XLF": Sector.FINANCIAL,
    "XLE": Sector.ENERGY,
    "XLV": Sector.HEALTHCARE,
    "XLI": Sector.INDUSTRIALS,
    "XLP": Sector.CONSUMER_DEFENSIVE,
    "XLY": Sector.CONSUMER_CYCLICAL,
    "XLU": Sector.UTILITIES,
    "XLRE": Sector.REAL_ESTATE,
    "XLC": Sector.COMMUNICATION,
    
    # Crypto-related
    "COIN": Sector.CRYPTO,
    "MSTR": Sector.CRYPTO,
    "RIOT": Sector.CRYPTO,
    "MARA": Sector.CRYPTO,
}

# Correlation groups (assets that tend to move together)
CORRELATION_GROUPS: Dict[str, Set[str]] = {
    "magnificent_7": {"AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "META", "NVDA", "TSLA"},
    "semiconductors": {"NVDA", "AMD", "INTC", "TSM", "ASML", "AVGO", "MU", "QCOM"},
    "faang": {"META", "AAPL", "AMZN", "NFLX", "GOOGL", "GOOG"},
    "banks": {"JPM", "BAC", "WFC", "C", "GS", "MS"},
    "oil_majors": {"XOM", "CVX", "COP", "BP", "SHEL"},
    "pharma": {"PFE", "JNJ", "MRK", "ABBV", "LLY"},
    "ev_battery": {"TSLA", "RIVN", "LCID", "NIO", "F", "GM"},
    "cloud": {"AMZN", "MSFT", "GOOGL", "CRM", "SNOW", "NET"},
    "streaming": {"NFLX", "DIS", "WBD", "PARA", "CMCSA"},
    "crypto_exposed": {"COIN", "MSTR", "RIOT", "MARA", "SQ"},
    "ai_plays": {"NVDA", "MSFT", "GOOGL", "AMD", "META", "CRM", "PLTR"},
}


@dataclass
class CorrelationLimits:
    """Configuration for correlation-based limits."""
    # Sector limits (as fraction of portfolio)
    max_sector_exposure_pct: float = 0.30    # Max 30% in any sector
    max_sector_for_unknown: float = 0.10     # Max 10% in unknown sector
    
    # Correlation group limits
    max_correlation_group_pct: float = 0.25  # Max 25% in correlated group
    
    # Individual stock limits
    max_single_stock_pct: float = 0.15       # Max 15% in single stock
    
    # Diversification requirements
    min_sectors_for_large_portfolio: int = 3  # Min 3 sectors if > 50% invested
    max_positions_per_sector: int = 5         # Max positions per sector
    
    # Beta/volatility limits
    max_portfolio_beta: float = 1.5           # Max portfolio beta
    warn_high_beta_single: float = 2.0        # Warn if single stock beta > 2


@dataclass
class ExposureCheckResult:
    """Result of exposure check."""
    allowed: bool
    reason: Optional[str]
    current_exposure: Dict[str, float]  # Sector/group -> exposure %
    limit_headroom: Dict[str, float]    # How much more allowed
    warnings: List[str]
    
    def to_dict(self) -> Dict:
        return {
            "allowed": self.allowed,
            "reason": self.reason,
            "current_exposure": self.current_exposure,
            "limit_headroom": self.limit_headroom,
            "warnings": self.warnings,
        }


@dataclass
class PortfolioExposure:
    """Current portfolio exposure breakdown."""
    total_value: Decimal
    sector_exposure: Dict[Sector, Decimal]
    sector_pct: Dict[Sector, float]
    group_exposure: Dict[str, Decimal]
    group_pct: Dict[str, float]
    single_stock_pct: Dict[str, float]
    position_count_by_sector: Dict[Sector, int]
    timestamp: datetime = field(default_factory=datetime.now)


class CorrelationRiskManager:
    """
    Manages correlation-based position limits and sector exposure.
    
    Prevents over-concentration in:
    - Single sectors (tech, financial, etc.)
    - Correlated asset groups (semiconductors, banks, etc.)
    - Single stocks
    
    Usage:
        manager = CorrelationRiskManager(limits)
        
        # Check if a new position is allowed
        result = manager.check_position(
            symbol="NVDA",
            proposed_value=Decimal("100"),
            current_positions={...}
        )
        
        # Get portfolio exposure breakdown
        exposure = manager.calculate_exposure(positions, account_equity)
    """
    
    def __init__(
        self,
        limits: Optional[CorrelationLimits] = None,
        custom_sectors: Optional[Dict[str, Sector]] = None,
        custom_groups: Optional[Dict[str, Set[str]]] = None,
    ):
        self.limits = limits or CorrelationLimits()
        
        # Merge custom mappings
        self.sectors = {**SYMBOL_SECTORS}
        if custom_sectors:
            self.sectors.update(custom_sectors)
        
        self.correlation_groups = {**CORRELATION_GROUPS}
        if custom_groups:
            self.correlation_groups.update(custom_groups)
    
    def get_sector(self, symbol: str) -> Sector:
        """Get sector for a symbol."""
        return self.sectors.get(symbol.upper(), Sector.UNKNOWN)
    
    def get_correlation_groups(self, symbol: str) -> List[str]:
        """Get all correlation groups a symbol belongs to."""
        symbol = symbol.upper()
        return [
            group_name
            for group_name, symbols in self.correlation_groups.items()
            if symbol in symbols
        ]
    
    def calculate_exposure(
        self,
        positions: Dict[str, Dict],  # symbol -> {market_value, qty, ...}
        account_equity: Decimal,
    ) -> PortfolioExposure:
        """
        Calculate current portfolio exposure breakdown.
        
        Args:
            positions: Dict of symbol to position data with market_value
            account_equity: Total account equity
        
        Returns:
            PortfolioExposure with detailed breakdown
        """
        sector_exposure: Dict[Sector, Decimal] = {s: Decimal("0") for s in Sector}
        group_exposure: Dict[str, Decimal] = {g: Decimal("0") for g in self.correlation_groups}
        single_stock_pct: Dict[str, float] = {}
        position_count: Dict[Sector, int] = {s: 0 for s in Sector}
        
        total_value = Decimal("0")
        
        for symbol, pos in positions.items():
            market_value = Decimal(str(pos.get("market_value", 0)))
            market_value = abs(market_value)  # Handle shorts
            
            total_value += market_value
            
            # Sector exposure
            sector = self.get_sector(symbol)
            sector_exposure[sector] += market_value
            position_count[sector] += 1
            
            # Group exposure
            for group in self.get_correlation_groups(symbol):
                group_exposure[group] += market_value
            
            # Single stock percentage
            if account_equity > 0:
                single_stock_pct[symbol] = float(market_value / account_equity)
        
        # Calculate percentages
        sector_pct = {}
        for sector, value in sector_exposure.items():
            if account_equity > 0:
                sector_pct[sector] = float(value / account_equity)
            else:
                sector_pct[sector] = 0.0
        
        group_pct = {}
        for group, value in group_exposure.items():
            if account_equity > 0:
                group_pct[group] = float(value / account_equity)
            else:
                group_pct[group] = 0.0
        
        return PortfolioExposure(
            total_value=total_value,
            sector_exposure=sector_exposure,
            sector_pct=sector_pct,
            group_exposure=group_exposure,
            group_pct=group_pct,
            single_stock_pct=single_stock_pct,
            position_count_by_sector=position_count,
        )
    
    def check_position(
        self,
        symbol: str,
        proposed_value: Decimal,
        current_positions: Dict[str, Dict],
        account_equity: Decimal,
        is_new_position: bool = True,
    ) -> ExposureCheckResult:
        """
        Check if a proposed position is allowed under correlation limits.
        
        Args:
            symbol: Symbol to trade
            proposed_value: Proposed position value (or increase)
            current_positions: Current portfolio positions
            account_equity: Account equity
            is_new_position: True if this would be a new position
        
        Returns:
            ExposureCheckResult with allowed status and details
        """
        warnings = []
        
        if account_equity <= 0:
            return ExposureCheckResult(
                allowed=False,
                reason="Account equity is zero or negative",
                current_exposure={},
                limit_headroom={},
                warnings=["Cannot check with zero equity"],
            )
        
        # Calculate current exposure
        current_exposure = self.calculate_exposure(current_positions, account_equity)
        
        # Get target sector and groups
        target_sector = self.get_sector(symbol)
        target_groups = self.get_correlation_groups(symbol)
        
        # Calculate proposed exposure
        proposed_pct = float(proposed_value / account_equity)
        
        # Check single stock limit
        current_single = current_exposure.single_stock_pct.get(symbol, 0.0)
        new_single = current_single + proposed_pct
        
        if new_single > self.limits.max_single_stock_pct:
            return ExposureCheckResult(
                allowed=False,
                reason=f"Single stock limit exceeded: {new_single:.1%} > {self.limits.max_single_stock_pct:.0%}",
                current_exposure={"single_stock": current_single},
                limit_headroom={"single_stock": self.limits.max_single_stock_pct - current_single},
                warnings=warnings,
            )
        
        # Check sector limit
        current_sector_pct = current_exposure.sector_pct.get(target_sector, 0.0)
        new_sector_pct = current_sector_pct + proposed_pct
        
        sector_limit = (
            self.limits.max_sector_for_unknown
            if target_sector == Sector.UNKNOWN
            else self.limits.max_sector_exposure_pct
        )
        
        if new_sector_pct > sector_limit:
            return ExposureCheckResult(
                allowed=False,
                reason=f"Sector limit exceeded for {target_sector.value}: {new_sector_pct:.1%} > {sector_limit:.0%}",
                current_exposure={"sector": current_sector_pct, "sector_name": target_sector.value},
                limit_headroom={"sector": sector_limit - current_sector_pct},
                warnings=warnings,
            )
        
        # Check positions per sector limit
        if is_new_position:
            current_count = current_exposure.position_count_by_sector.get(target_sector, 0)
            if current_count >= self.limits.max_positions_per_sector:
                return ExposureCheckResult(
                    allowed=False,
                    reason=f"Max positions in {target_sector.value}: {current_count} >= {self.limits.max_positions_per_sector}",
                    current_exposure={"positions_in_sector": current_count},
                    limit_headroom={},
                    warnings=warnings,
                )
        
        # Check correlation group limits
        for group in target_groups:
            current_group_pct = current_exposure.group_pct.get(group, 0.0)
            new_group_pct = current_group_pct + proposed_pct
            
            if new_group_pct > self.limits.max_correlation_group_pct:
                return ExposureCheckResult(
                    allowed=False,
                    reason=f"Correlation group limit exceeded for '{group}': {new_group_pct:.1%} > {self.limits.max_correlation_group_pct:.0%}",
                    current_exposure={"group": current_group_pct, "group_name": group},
                    limit_headroom={"group": self.limits.max_correlation_group_pct - current_group_pct},
                    warnings=warnings,
                )
            
            # Warn if approaching limit
            if new_group_pct > self.limits.max_correlation_group_pct * 0.8:
                warnings.append(f"Approaching '{group}' group limit: {new_group_pct:.1%}")
        
        # Build exposure dict
        exposure_dict = {
            "sector": current_sector_pct,
            "sector_name": target_sector.value,
        }
        
        headroom_dict = {
            "sector": sector_limit - current_sector_pct,
            "single_stock": self.limits.max_single_stock_pct - current_single,
        }
        
        for group in target_groups:
            current_group_pct = current_exposure.group_pct.get(group, 0.0)
            exposure_dict[f"group_{group}"] = current_group_pct
            headroom_dict[f"group_{group}"] = self.limits.max_correlation_group_pct - current_group_pct
        
        return ExposureCheckResult(
            allowed=True,
            reason=None,
            current_exposure=exposure_dict,
            limit_headroom=headroom_dict,
            warnings=warnings,
        )
    
    def get_max_position_size(
        self,
        symbol: str,
        current_positions: Dict[str, Dict],
        account_equity: Decimal,
    ) -> Decimal:
        """
        Calculate maximum allowed position size for a symbol.
        
        Returns the most restrictive limit considering:
        - Single stock limit
        - Sector limit
        - Correlation group limits
        """
        if account_equity <= 0:
            return Decimal("0")
        
        current_exposure = self.calculate_exposure(current_positions, account_equity)
        
        # Single stock limit
        current_single = current_exposure.single_stock_pct.get(symbol, 0.0)
        max_by_single = (self.limits.max_single_stock_pct - current_single) * float(account_equity)
        
        # Sector limit
        sector = self.get_sector(symbol)
        current_sector = current_exposure.sector_pct.get(sector, 0.0)
        sector_limit = (
            self.limits.max_sector_for_unknown
            if sector == Sector.UNKNOWN
            else self.limits.max_sector_exposure_pct
        )
        max_by_sector = (sector_limit - current_sector) * float(account_equity)
        
        # Correlation group limits
        max_by_group = float("inf")
        for group in self.get_correlation_groups(symbol):
            current_group = current_exposure.group_pct.get(group, 0.0)
            group_max = (self.limits.max_correlation_group_pct - current_group) * float(account_equity)
            max_by_group = min(max_by_group, group_max)
        
        if max_by_group == float("inf"):
            max_by_group = max_by_sector
        
        # Return most restrictive
        max_allowed = max(0, min(max_by_single, max_by_sector, max_by_group))
        
        return Decimal(str(max_allowed))
    
    def get_diversification_score(
        self,
        positions: Dict[str, Dict],
        account_equity: Decimal,
    ) -> Dict:
        """
        Calculate portfolio diversification score.
        
        Returns metrics for portfolio diversification.
        """
        exposure = self.calculate_exposure(positions, account_equity)
        
        # Count active sectors
        active_sectors = sum(1 for pct in exposure.sector_pct.values() if pct > 0.01)
        
        # Calculate Herfindahl-Hirschman Index (HHI) for concentration
        hhi = sum(pct ** 2 for pct in exposure.single_stock_pct.values())
        
        # Effective number of stocks (1/HHI)
        effective_n = 1 / hhi if hhi > 0 else 0
        
        # Calculate largest exposures
        top_sectors = sorted(
            [(s.value, pct) for s, pct in exposure.sector_pct.items() if pct > 0],
            key=lambda x: x[1],
            reverse=True
        )[:3]
        
        top_groups = sorted(
            [(g, pct) for g, pct in exposure.group_pct.items() if pct > 0],
            key=lambda x: x[1],
            reverse=True
        )[:3]
        
        # Diversification score (0-100)
        # Higher is more diversified
        score = 0.0
        
        # Reward for multiple sectors (up to 30 points)
        score += min(30, active_sectors * 10)
        
        # Reward for low HHI (up to 40 points)
        # HHI of 0.1 or less gets full points
        score += max(0, 40 - (hhi * 400))
        
        # Reward for effective diversification (up to 30 points)
        score += min(30, effective_n * 5)
        
        return {
            "score": round(score, 1),
            "active_sectors": active_sectors,
            "position_count": len(positions),
            "hhi": round(hhi, 4),
            "effective_n": round(effective_n, 1),
            "top_sectors": top_sectors,
            "top_groups": top_groups,
            "recommendation": self._get_diversification_recommendation(score, exposure),
        }
    
    def _get_diversification_recommendation(
        self,
        score: float,
        exposure: PortfolioExposure,
    ) -> str:
        """Generate diversification recommendation."""
        if score >= 70:
            return "Well diversified portfolio"
        
        recommendations = []
        
        # Check sector concentration
        max_sector = max(exposure.sector_pct.values(), default=0)
        if max_sector > 0.40:
            recommendations.append("Reduce sector concentration (>40% in one sector)")
        
        # Check single stock concentration
        max_single = max(exposure.single_stock_pct.values(), default=0)
        if max_single > 0.20:
            recommendations.append("Reduce single stock exposure (>20%)")
        
        # Check number of positions
        if len(exposure.single_stock_pct) < 3:
            recommendations.append("Consider adding more positions for diversification")
        
        if not recommendations:
            return "Portfolio could benefit from broader diversification"
        
        return "; ".join(recommendations)
    
    def add_sector_mapping(self, symbol: str, sector: Sector):
        """Add or update a symbol's sector mapping."""
        self.sectors[symbol.upper()] = sector
    
    def add_correlation_group(self, group_name: str, symbols: Set[str]):
        """Add a new correlation group."""
        self.correlation_groups[group_name] = {s.upper() for s in symbols}
    
    def add_to_correlation_group(self, group_name: str, symbol: str):
        """Add a symbol to an existing correlation group."""
        if group_name in self.correlation_groups:
            self.correlation_groups[group_name].add(symbol.upper())
        else:
            self.correlation_groups[group_name] = {symbol.upper()}
