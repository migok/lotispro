"""Reservation-related schemas for API requests and responses."""

from datetime import datetime

from pydantic import Field

from app.domain.schemas.common import BaseSchema


class ReservationCreate(BaseSchema):
    """Schema for creating a new reservation."""

    lot_id: int = Field(description="Lot to reserve")
    client_id: int = Field(description="Client making the reservation")
    reservation_days: int = Field(
        default=7,
        ge=1,
        le=365,
        description="Number of days the reservation is valid (default: 7 days)",
    )
    expiration_date: datetime | None = Field(
        default=None,
        description="Reservation expiration date (overrides reservation_days if provided)",
    )
    deposit: float = Field(default=0, ge=0, description="Deposit amount")
    notes: str | None = Field(default=None, max_length=2000, description="Notes")


class ReservationExtend(BaseSchema):
    """Schema for extending a reservation."""

    additional_days: int = Field(
        ge=1,
        le=365,
        description="Number of days to add to the reservation",
    )


class ReservationResponse(BaseSchema):
    """Schema for reservation data in responses."""

    id: int
    project_id: int
    lot_id: int
    client_id: int
    reserved_by_user_id: int | None
    reservation_date: datetime
    expiration_date: datetime
    deposit: float
    notes: str | None
    status: str
    created_at: datetime
    updated_at: datetime
