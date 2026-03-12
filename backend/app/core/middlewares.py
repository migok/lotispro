"""Application middlewares for security, logging, and performance.

Includes CORS, security headers, request logging, and GZip compression.
"""

import time
from collections.abc import Awaitable, Callable
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.core.logging import get_logger, set_request_id, set_user_id

logger = get_logger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware for logging requests and adding correlation IDs."""

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        # Generate or extract request ID
        request_id = request.headers.get("X-Request-ID", str(uuid4()))
        set_request_id(request_id)

        # Reset user context (will be set by auth dependency)
        set_user_id(None)

        # Log request start
        start_time = time.perf_counter()
        logger.info(
            "Request started",
            method=request.method,
            path=request.url.path,
            query=str(request.query_params),
            client_ip=request.client.host if request.client else None,
        )

        # Process request
        try:
            response = await call_next(request)

            # Calculate duration
            duration_ms = (time.perf_counter() - start_time) * 1000

            # Log request completion
            logger.info(
                "Request completed",
                method=request.method,
                path=request.url.path,
                status_code=response.status_code,
                duration_ms=round(duration_ms, 2),
            )

            # Add correlation headers to response
            response.headers["X-Request-ID"] = request_id
            response.headers["X-Response-Time"] = f"{duration_ms:.2f}ms"

            return response

        except Exception as e:
            duration_ms = (time.perf_counter() - start_time) * 1000
            logger.error(
                "Request failed",
                method=request.method,
                path=request.url.path,
                duration_ms=round(duration_ms, 2),
                error=str(e),
                exc_info=True,
            )
            raise


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Middleware to add security headers to all responses."""

    SECURITY_HEADERS: dict[str, str] = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-XSS-Protection": "1; mode=block",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
    }

    # Additional headers for production
    PRODUCTION_HEADERS: dict[str, str] = {
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
    }

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        response = await call_next(request)

        # Add base security headers
        for header, value in self.SECURITY_HEADERS.items():
            response.headers[header] = value

        # Add production-only headers
        if settings.is_production:
            for header, value in self.PRODUCTION_HEADERS.items():
                response.headers[header] = value

        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple in-memory rate limiting middleware.

    For production, consider using Redis-backed rate limiting.
    """

    def __init__(self, app: Any, max_requests: int = 100, window_seconds: int = 60):
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests: dict[str, list[float]] = {}

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        if not settings.RATE_LIMIT_ENABLED:
            return await call_next(request)

        # Get client identifier
        client_ip = request.client.host if request.client else "unknown"

        # Skip rate limiting for health checks
        if request.url.path in ["/health", "/ready", "/live"]:
            return await call_next(request)

        # Clean old requests and check rate limit
        current_time = time.time()
        if client_ip not in self.requests:
            self.requests[client_ip] = []

        # Remove requests outside the window
        self.requests[client_ip] = [
            req_time
            for req_time in self.requests[client_ip]
            if current_time - req_time < self.window_seconds
        ]

        # Check if rate limit exceeded
        if len(self.requests[client_ip]) >= self.max_requests:
            logger.warning(
                "Rate limit exceeded",
                client_ip=client_ip,
                requests_count=len(self.requests[client_ip]),
            )
            return Response(
                content='{"detail": "Rate limit exceeded. Please try again later."}',
                status_code=429,
                media_type="application/json",
                headers={
                    "Retry-After": str(self.window_seconds),
                    "X-RateLimit-Limit": str(self.max_requests),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(int(current_time + self.window_seconds)),
                },
            )

        # Record this request
        self.requests[client_ip].append(current_time)

        # Process request
        response = await call_next(request)

        # Add rate limit headers
        remaining = self.max_requests - len(self.requests[client_ip])
        response.headers["X-RateLimit-Limit"] = str(self.max_requests)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(
            int(current_time + self.window_seconds)
        )

        return response


def setup_middlewares(app: FastAPI) -> None:
    """Configure all application middlewares.

    Middleware order matters - they are executed in reverse order of addition.
    Last added = first executed for request, last executed for response.
    """
    # GZip compression (innermost - closest to the application)
    app.add_middleware(GZipMiddleware, minimum_size=1000)

    # Rate limiting
    if settings.RATE_LIMIT_ENABLED:
        app.add_middleware(
            RateLimitMiddleware,
            max_requests=settings.RATE_LIMIT_REQUESTS,
            window_seconds=settings.RATE_LIMIT_WINDOW_SECONDS,
        )

    # Security headers
    app.add_middleware(SecurityHeadersMiddleware)

    # Request logging (should be early to capture full request lifecycle)
    app.add_middleware(RequestLoggingMiddleware)

    # CORS (outermost - first to handle request)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
        allow_methods=settings.CORS_ALLOW_METHODS,
        allow_headers=settings.CORS_ALLOW_HEADERS,
        expose_headers=["X-Request-ID", "X-Response-Time"],
    )

    logger.info(
        "Middlewares configured",
        cors_origins=settings.CORS_ORIGINS,
        rate_limit_enabled=settings.RATE_LIMIT_ENABLED,
    )
