"""Core module - Configuration, security, logging, and cross-cutting concerns."""

from app.core.config import settings
from app.core.logging import get_logger, setup_logging

__all__ = ["get_logger", "settings", "setup_logging"]
