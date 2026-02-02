"""
API Package for HFT Trading Dashboard

Provides REST and WebSocket endpoints for the trading dashboard.
"""

from .server import create_app, api_router

__all__ = ["create_app", "api_router"]
