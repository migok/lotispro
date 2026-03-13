"""Dashboard and analytics endpoints."""

from fastapi import APIRouter, Query

from app.api.dependencies import CurrentUser, DashboardServiceDep, ManagerUser
from app.domain.schemas.dashboard import (
    CommercialPerformance,
    DashboardStats,
    PerformanceData,
)

router = APIRouter()


@router.get(
    "/stats",
    response_model=DashboardStats,
    summary="Dashboard statistics",
    description="Get main dashboard KPIs and statistics",
)
async def get_dashboard_stats(
    current_user: CurrentUser,
    dashboard_service: DashboardServiceDep,
    project_id: int | None = Query(default=None, description="Filter by project"),
    user_id: int | None = Query(default=None, description="Filter by user"),
) -> DashboardStats:
    """Get dashboard statistics."""
    return await dashboard_service.get_dashboard_stats(
        project_id=project_id,
        user_id=user_id,
    )


@router.get(
    "/alerts",
    summary="Reservation alerts",
    description="Get reservations at risk (expiring soon or expired)",
)
async def get_alerts(
    current_user: CurrentUser,
    dashboard_service: DashboardServiceDep,
    days: int = Query(default=3, ge=1, le=30, description="Days threshold"),
    project_id: int | None = Query(default=None, description="Filter by project"),
    user_id: int | None = Query(default=None, description="Filter by user"),
) -> dict:
    """Get reservations at risk."""
    reservations, summary = await dashboard_service.get_alerts(
        days_threshold=days,
        project_id=project_id,
        user_id=user_id,
    )
    return {
        "reservations": reservations,
        "summary": summary,
    }


@router.get(
    "/performance",
    response_model=PerformanceData,
    summary="Performance analytics",
    description="Get performance data for analytics",
)
async def get_performance(
    current_user: CurrentUser,
    dashboard_service: DashboardServiceDep,
    project_id: int | None = Query(default=None, description="Filter by project"),
    user_id: int | None = Query(default=None, description="Filter by user"),
    period: str = Query(default="month", description="Aggregation period"),
) -> PerformanceData:
    """Get performance analytics data."""
    return await dashboard_service.get_performance_data(
        project_id=project_id,
        user_id=user_id,
        period=period,
    )


@router.get(
    "/commercials-performance",
    response_model=list[CommercialPerformance],
    summary="Commercial performance",
    description="Get commercial team performance metrics (manager only)",
)
async def get_commercials_performance(
    current_user: ManagerUser,
    dashboard_service: DashboardServiceDep,
    project_id: int | None = Query(default=None, description="Filter by project"),
) -> list[CommercialPerformance]:
    """Get commercial performance metrics. Manager only."""
    return await dashboard_service.get_commercials_performance(project_id=project_id)


@router.get(
    "/commercial-stats",
    summary="Commercial statistics",
    description="Get commercial team statistics with deposits (manager only)",
)
async def get_commercial_stats(
    current_user: ManagerUser,
    dashboard_service: DashboardServiceDep,
    project_id: int | None = Query(default=None, description="Filter by project"),
) -> list[dict]:
    """Get commercial statistics including deposits. Manager only."""
    return await dashboard_service.get_commercial_stats(project_id=project_id)


@router.get(
    "/commercial-monthly",
    summary="Commercial monthly performance",
    description="Per-commercial monthly sales data for the last N months (manager only)",
)
async def get_commercial_monthly(
    current_user: ManagerUser,
    dashboard_service: DashboardServiceDep,
    months_back: int = Query(default=6, ge=1, le=24),
    project_id: int | None = Query(default=None),
) -> list[dict]:
    """Get per-commercial monthly performance. Manager only."""
    return await dashboard_service.get_commercial_monthly(
        months_back=months_back,
        project_id=project_id,
    )


@router.get(
    "/clients-pipeline",
    summary="Clients pipeline",
    description="Get clients pipeline with purchase status and activity",
)
async def get_clients_pipeline(
    current_user: CurrentUser,
    dashboard_service: DashboardServiceDep,
    project_id: int | None = Query(default=None, description="Filter by project"),
    user_id: int | None = Query(default=None, description="Filter by user"),
) -> list[dict]:
    """Get clients pipeline sorted by status (buyer, active reservation, prospect).

    For commercial users, only their own clients are shown.
    Managers can see all clients.
    """
    # Commercial users can only see their own clients
    if current_user.role == "commercial":
        user_id = current_user.id
    # Managers can see all clients (user_id remains None or as specified)

    return await dashboard_service.get_clients_pipeline(
        project_id=project_id,
        user_id=user_id,
    )


@router.get(
    "/monthly-breakdown",
    summary="Monthly lots breakdown",
    description="Get monthly breakdown of sold and reserved lots",
)
async def get_monthly_breakdown(
    current_user: CurrentUser,
    dashboard_service: DashboardServiceDep,
    months_back: int = Query(default=6, ge=1, le=24),
    project_id: int | None = Query(default=None),
    user_id: int | None = Query(default=None),
) -> list[dict]:
    """Get monthly breakdown of sold and reserved lots."""
    if current_user.role == "commercial":
        user_id = current_user.id
    return await dashboard_service.get_monthly_breakdown(
        months_back=months_back,
        project_id=project_id,
        user_id=user_id,
    )


@router.get(
    "/late-payments",
    summary="Late payments",
    description="Get pending installments whose due date has passed (overdue)",
)
async def get_late_payments(
    current_user: CurrentUser,
    dashboard_service: DashboardServiceDep,
    project_id: int | None = Query(default=None, description="Filter by project"),
    user_id: int | None = Query(default=None, description="Filter by user"),
) -> list[dict]:
    """Get overdue installments. Commercials see only their own clients."""
    if current_user.role == "commercial":
        user_id = current_user.id
    return await dashboard_service.get_late_payments(
        project_id=project_id,
        user_id=user_id,
    )


@router.get(
    "/lots",
    summary="Lots with details",
    description="Get all lots with reservation and client details",
)
async def get_lots_dashboard(
    current_user: CurrentUser,
    dashboard_service: DashboardServiceDep,
    project_id: int | None = Query(default=None, description="Filter by project"),
    user_id: int | None = Query(default=None, description="Filter by user"),
) -> list[dict]:
    """Get lots with reservation and client details for dashboard display."""
    return await dashboard_service.get_lots_dashboard(
        project_id=project_id,
        user_id=user_id,
    )
