"""Health check endpoints."""

from fastapi import APIRouter, status

from app.core.config import settings
from app.domain.schemas.common import HealthResponse
from app.infrastructure.database.session import check_db_connection

router = APIRouter()


@router.get(
    "/health",
    response_model=HealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Basic health check",
    description="Returns basic application health status",
)
async def health_check() -> HealthResponse:
    """Basic health check endpoint."""
    return HealthResponse(
        status="healthy",
        version=settings.APP_VERSION,
        environment=settings.ENVIRONMENT,
    )


@router.get(
    "/ready",
    response_model=HealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Readiness check",
    description="Returns readiness status including database connectivity",
)
async def readiness_check() -> HealthResponse:
    """Readiness check - includes database connectivity."""
    db_healthy = await check_db_connection()

    checks = {
        "database": "healthy" if db_healthy else "unhealthy",
    }

    overall_status = "healthy" if db_healthy else "degraded"

    return HealthResponse(
        status=overall_status,
        version=settings.APP_VERSION,
        environment=settings.ENVIRONMENT,
        checks=checks,
    )


@router.get(
    "/live",
    status_code=status.HTTP_200_OK,
    summary="Liveness check",
    description="Simple liveness probe for container orchestration",
)
async def liveness_check() -> dict:
    """Liveness probe - just confirms the app is running."""
    return {"ok": True}
