"""Pydantic schemas for API request/response validation."""

from app.domain.schemas.client import (
    ClientCreate,
    ClientDetails,
    ClientResponse,
    ClientUpdate,
)
from app.domain.schemas.common import (
    ErrorResponse,
    HealthResponse,
    PaginatedResponse,
    PaginationParams,
)
from app.domain.schemas.lot import LotCreate, LotResponse, LotUpdate, LotWithDetails
from app.domain.schemas.project import (
    ProjectCreate,
    ProjectKPIs,
    ProjectResponse,
    ProjectUpdate,
)
from app.domain.schemas.reservation import (
    ReservationCreate,
    ReservationResponse,
)
from app.domain.schemas.sale import SaleCreate, SaleFromReservation, SaleResponse
from app.domain.schemas.user import (
    TokenResponse,
    UserCreate,
    UserLogin,
    UserResponse,
)

__all__ = [
    # Common
    "PaginationParams",
    "PaginatedResponse",
    "ErrorResponse",
    "HealthResponse",
    # User
    "UserCreate",
    "UserLogin",
    "UserResponse",
    "TokenResponse",
    # Project
    "ProjectCreate",
    "ProjectUpdate",
    "ProjectResponse",
    "ProjectKPIs",
    # Lot
    "LotCreate",
    "LotUpdate",
    "LotResponse",
    "LotWithDetails",
    # Client
    "ClientCreate",
    "ClientUpdate",
    "ClientResponse",
    "ClientDetails",
    # Reservation
    "ReservationCreate",
    "ReservationResponse",
    # Sale
    "SaleCreate",
    "SaleFromReservation",
    "SaleResponse",
]
