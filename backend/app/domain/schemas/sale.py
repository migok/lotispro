"""Sale-related schemas for API requests and responses."""

from datetime import datetime

from pydantic import Field

from app.domain.schemas.common import BaseSchema


class SaleCreate(BaseSchema):
    """Schema for creating a direct sale."""

    lot_id: int = Field(description="Lot being sold")
    client_id: int = Field(description="Client purchasing the lot")
    price: float = Field(ge=0, description="Sale price")
    reservation_id: int | None = Field(
        default=None,
        description="Associated reservation ID (if converting from reservation)",
    )
    notes: str | None = Field(default=None, max_length=2000, description="Notes")


class SaleFromReservation(BaseSchema):
    """Schema for converting a reservation to a sale."""

    price: float | None = Field(
        default=None,
        ge=0,
        description=(
            "Ignoré : le prix de la vente est le prix total convenu de la "
            "réservation (conservé pour compatibilité)"
        ),
    )
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
