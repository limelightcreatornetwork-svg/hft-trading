"""
Status Monitoring

Provides:
- Broker API status checking
- Health monitoring
- Alert generation
- Status page integration
"""

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional, Dict, List, Callable, Any, Awaitable
import aiohttp

logger = logging.getLogger(__name__)


class ServiceStatus(Enum):
    OPERATIONAL = "operational"
    DEGRADED = "degraded"
    PARTIAL_OUTAGE = "partial_outage"
    MAJOR_OUTAGE = "major_outage"
    UNKNOWN = "unknown"


class AlertSeverity(Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


@dataclass
class ServiceHealth:
    """Health status of a service."""
    service: str
    status: ServiceStatus
    last_check: datetime
    response_time_ms: Optional[float] = None
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}
    
    @property
    def is_healthy(self) -> bool:
        return self.status == ServiceStatus.OPERATIONAL
    
    @property
    def is_degraded(self) -> bool:
        return self.status in (ServiceStatus.DEGRADED, ServiceStatus.PARTIAL_OUTAGE)


@dataclass
class Alert:
    """A monitoring alert."""
    alert_id: str
    timestamp: datetime
    severity: AlertSeverity
    service: str
    title: str
    message: str
    resolved: bool = False
    resolved_at: Optional[datetime] = None
    
    def format_message(self) -> str:
        emoji = {
            AlertSeverity.INFO: "ℹ️",
            AlertSeverity.WARNING: "⚠️",
            AlertSeverity.ERROR: "🔴",
            AlertSeverity.CRITICAL: "🚨",
        }[self.severity]
        
        return f"{emoji} **{self.title}**\n{self.message}"


class StatusMonitor:
    """
    Monitors status of trading services.
    
    Features:
    - Periodic health checks
    - Status page integration
    - Alert generation
    - Response time tracking
    
    Usage:
        monitor = StatusMonitor()
        
        # Add custom health check
        monitor.add_check("alpaca", alpaca_health_check)
        
        # Start monitoring
        await monitor.start()
        
        # Get current status
        status = monitor.get_all_status()
    """
    
    # Known status pages
    STATUS_PAGES = {
        "alpaca": "https://status.alpaca.markets",
        "kalshi": "https://status.kalshi.com",
    }
    
    def __init__(
        self,
        check_interval: int = 60,
        on_alert: Optional[Callable[[Alert], Awaitable[None]]] = None,
    ):
        self.check_interval = check_interval
        self.on_alert = on_alert
        
        self._health: Dict[str, ServiceHealth] = {}
        self._alerts: List[Alert] = []
        self._checks: Dict[str, Callable[[], Awaitable[ServiceHealth]]] = {}
        
        self._running = False
        self._task: Optional[asyncio.Task] = None
        
        # Session for HTTP requests
        self._session: Optional[aiohttp.ClientSession] = None
    
    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=10)
            )
        return self._session
    
    def add_check(
        self,
        service: str,
        check_fn: Callable[[], Awaitable[ServiceHealth]],
    ):
        """Add a custom health check function."""
        self._checks[service] = check_fn
    
    async def check_alpaca(
        self,
        client=None,
    ) -> ServiceHealth:
        """Check Alpaca API health."""
        start = datetime.now()
        
        try:
            # Try to hit the account endpoint
            if client:
                await client.get_account()
                elapsed = (datetime.now() - start).total_seconds() * 1000
                
                return ServiceHealth(
                    service="alpaca",
                    status=ServiceStatus.OPERATIONAL,
                    last_check=datetime.now(),
                    response_time_ms=elapsed,
                )
            else:
                # Just check if API is reachable
                session = await self._get_session()
                async with session.get(
                    "https://paper-api.alpaca.markets/v2/account",
                    headers={"Accept": "application/json"},
                ) as response:
                    elapsed = (datetime.now() - start).total_seconds() * 1000
                    
                    # 401 means API is up but unauthorized (expected without creds)
                    if response.status in (200, 401):
                        return ServiceHealth(
                            service="alpaca",
                            status=ServiceStatus.OPERATIONAL,
                            last_check=datetime.now(),
                            response_time_ms=elapsed,
                        )
                    else:
                        return ServiceHealth(
                            service="alpaca",
                            status=ServiceStatus.DEGRADED,
                            last_check=datetime.now(),
                            response_time_ms=elapsed,
                            error_message=f"HTTP {response.status}",
                        )
                        
        except asyncio.TimeoutError:
            return ServiceHealth(
                service="alpaca",
                status=ServiceStatus.DEGRADED,
                last_check=datetime.now(),
                error_message="Request timeout",
            )
        except Exception as e:
            return ServiceHealth(
                service="alpaca",
                status=ServiceStatus.MAJOR_OUTAGE,
                last_check=datetime.now(),
                error_message=str(e),
            )
    
    async def check_kalshi(
        self,
        client=None,
    ) -> ServiceHealth:
        """Check Kalshi API health."""
        start = datetime.now()
        
        try:
            session = await self._get_session()
            
            # Check public markets endpoint
            async with session.get(
                "https://trading-api.kalshi.com/trade-api/v2/markets?limit=1",
            ) as response:
                elapsed = (datetime.now() - start).total_seconds() * 1000
                
                if response.status == 200:
                    return ServiceHealth(
                        service="kalshi",
                        status=ServiceStatus.OPERATIONAL,
                        last_check=datetime.now(),
                        response_time_ms=elapsed,
                    )
                else:
                    return ServiceHealth(
                        service="kalshi",
                        status=ServiceStatus.DEGRADED,
                        last_check=datetime.now(),
                        response_time_ms=elapsed,
                        error_message=f"HTTP {response.status}",
                    )
                    
        except asyncio.TimeoutError:
            return ServiceHealth(
                service="kalshi",
                status=ServiceStatus.DEGRADED,
                last_check=datetime.now(),
                error_message="Request timeout",
            )
        except Exception as e:
            return ServiceHealth(
                service="kalshi",
                status=ServiceStatus.MAJOR_OUTAGE,
                last_check=datetime.now(),
                error_message=str(e),
            )
    
    async def check_all(self) -> Dict[str, ServiceHealth]:
        """Run all health checks."""
        results = {}
        
        # Built-in checks
        results["alpaca"] = await self.check_alpaca()
        results["kalshi"] = await self.check_kalshi()
        
        # Custom checks
        for service, check_fn in self._checks.items():
            try:
                results[service] = await check_fn()
            except Exception as e:
                results[service] = ServiceHealth(
                    service=service,
                    status=ServiceStatus.UNKNOWN,
                    last_check=datetime.now(),
                    error_message=str(e),
                )
        
        # Update stored health
        old_health = self._health.copy()
        self._health = results
        
        # Check for status changes
        await self._check_for_alerts(old_health, results)
        
        return results
    
    async def _check_for_alerts(
        self,
        old: Dict[str, ServiceHealth],
        new: Dict[str, ServiceHealth],
    ):
        """Generate alerts for status changes."""
        import uuid
        
        for service, health in new.items():
            old_health = old.get(service)
            
            # Service newly unhealthy
            if not health.is_healthy:
                if old_health is None or old_health.is_healthy:
                    alert = Alert(
                        alert_id=str(uuid.uuid4()),
                        timestamp=datetime.now(),
                        severity=AlertSeverity.ERROR if health.status == ServiceStatus.MAJOR_OUTAGE else AlertSeverity.WARNING,
                        service=service,
                        title=f"{service.upper()} Status Change",
                        message=f"Status changed to {health.status.value}. {health.error_message or ''}",
                    )
                    self._alerts.append(alert)
                    
                    if self.on_alert:
                        await self.on_alert(alert)
            
            # Service recovered
            elif health.is_healthy and old_health and not old_health.is_healthy:
                alert = Alert(
                    alert_id=str(uuid.uuid4()),
                    timestamp=datetime.now(),
                    severity=AlertSeverity.INFO,
                    service=service,
                    title=f"{service.upper()} Recovered",
                    message=f"Service is now operational.",
                )
                self._alerts.append(alert)
                
                if self.on_alert:
                    await self.on_alert(alert)
    
    async def start(self):
        """Start periodic monitoring."""
        if self._running:
            return
        
        self._running = True
        self._task = asyncio.create_task(self._monitor_loop())
        logger.info("Status monitoring started")
    
    async def stop(self):
        """Stop monitoring."""
        self._running = False
        
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        
        if self._session:
            await self._session.close()
        
        logger.info("Status monitoring stopped")
    
    async def _monitor_loop(self):
        """Background monitoring loop."""
        while self._running:
            try:
                await self.check_all()
            except Exception as e:
                logger.error(f"Health check failed: {e}")
            
            await asyncio.sleep(self.check_interval)
    
    # Query methods
    def get_status(self, service: str) -> Optional[ServiceHealth]:
        """Get status for a specific service."""
        return self._health.get(service)
    
    def get_all_status(self) -> Dict[str, ServiceHealth]:
        """Get status for all services."""
        return self._health.copy()
    
    def is_all_healthy(self) -> bool:
        """Check if all services are healthy."""
        return all(h.is_healthy for h in self._health.values())
    
    def get_alerts(
        self,
        limit: int = 50,
        unresolved_only: bool = False,
    ) -> List[Alert]:
        """Get recent alerts."""
        alerts = self._alerts
        
        if unresolved_only:
            alerts = [a for a in alerts if not a.resolved]
        
        return alerts[-limit:]
    
    def resolve_alert(self, alert_id: str):
        """Mark an alert as resolved."""
        for alert in self._alerts:
            if alert.alert_id == alert_id:
                alert.resolved = True
                alert.resolved_at = datetime.now()
                return True
        return False
    
    def get_summary(self) -> Dict[str, Any]:
        """Get overall health summary."""
        return {
            "overall_status": "healthy" if self.is_all_healthy() else "degraded",
            "services": {
                service: {
                    "status": health.status.value,
                    "response_time_ms": health.response_time_ms,
                    "last_check": health.last_check.isoformat() if health.last_check else None,
                    "error": health.error_message,
                }
                for service, health in self._health.items()
            },
            "unresolved_alerts": len([a for a in self._alerts if not a.resolved]),
        }


# Singleton instance
_status_monitor: Optional[StatusMonitor] = None

def get_status_monitor() -> StatusMonitor:
    global _status_monitor
    if _status_monitor is None:
        _status_monitor = StatusMonitor()
    return _status_monitor
