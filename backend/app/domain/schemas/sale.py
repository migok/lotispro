"""Sale-related schemas for API requests and responses."""

from datetime import datetime

from pydantic import Field

from app.domain.schemas.common import BaseSchema


class SaleCreate(BaseSchema):
    """Schema for creating a direct sale."""

    lot_id: int = Field(description="Lot being sold")
    client_id: int = Field(description="Client purchasing the lot")
    price: float = Field(ge=0, description="Sale price")
    notes: str | None = Field(default=None, max_length=2000, description="Notes")


class SaleFromReservation(BaseSchema):
    """Schema for converting a reservation to a sale."""

    price: float = Field(ge=0, description="Final sale price")
    notes: str | None = Field(default=None, max_length=2000, description="Notes")


class SaleResponse(BaseSchema):
    """Schema for sale data in responses."""

    id: int
    project_id: int
    lot_id: int
    client_id: int
    reservation_id: int | None
    sold_by_user_id: int | None
    sale_date: datetime
    price: float
    notes: str | None
    created_at: datetime


class SaleWithDetails(SaleResponse):
    """Schema for sale with extended details."""

    lot_numero: str
    lot_surface: float | None
    lot_zone: str | None
    client_name: str
    client_phone: str | None
    project_name: str
    sold_by_name: str | None


class SaleFilter(BaseSchema):
    """Schema for sale filtering parameters."""

    project_id: int | None = None
    lot_id: int | None = None
    client_id: int | None = None
    sold_by_user_id: int | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
