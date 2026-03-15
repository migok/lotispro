"""API v1 router - Aggregates all v1 endpoints."""

from fastapi import APIRouter

from app.api.v1.endpoints import (
    audit,
    auth,
    clients,
    contact,
    dashboard,
    health,
    lots,
    payments,
    projects,
    reservations,
    sales,
    users,
)

api_router = APIRouter()

# Include all endpoint routers
api_router.include_router(
    health.router,
    tags=["Health"],
)

api_router.include_router(
    auth.router,
    prefix="/auth",
    tags=["Authentication"],
)

api_router.include_router(
    users.router,
    prefix="/users",
    tags=["Users"],
)

api_router.include_router(
    projects.router,
    prefix="/projects",
    tags=["Projects"],
)

api_router.include_router(
    lots.router,
    prefix="/lots",
    tags=["Lots"],
)

api_router.include_router(
    clients.router,
    prefix="/clients",
    tags=["Clients"],
)

api_router.include_router(
    reservations.router,
    prefix="/reservations",
    tags=["Reservations"],
)

api_router.include_router(
    sales.router,
    prefix="/sales",
    tags=["Sales"],
)

api_router.include_router(
    dashboard.router,
    prefix="/dashboard",
    tags=["Dashboard"],
)

api_router.include_router(
    audit.router,
    prefix="/audit-logs",
    tags=["Audit"],
)

api_router.include_router(
    payments.router,
    prefix="/payments",
    tags=["Payments"],
)

api_router.include_router(
    contact.router,
    tags=["Contact"],
)
