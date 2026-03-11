"""Reservation-related schemas for API requests and responses."""

from datetime import date, datetime

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
    deposit_date: date | None = Field(default=None, description="Date the deposit was received")
    notes: str | None = Field(default=None, max_length=2000, description="Notes")


class ReservationExtend(BaseSchema):
    """Schema for extending a reservation."""

    additional_days: int = Field(
        ge=1,
        le=365,
        description="Number of days to add to the reservation",
    )


class ReservationRelease(BaseSchema):
    """Schema for releasing (cancelling) a reservation with optional refund info."""

    deposit_refund_amount: float | None = Field(
        default=None,
        ge=0,
        description="Amount of deposit refunded to the client (None = no refund recorded)",
    )
    deposit_refund_date: date | None = Field(
        default=None,
        description="Date the deposit was refunded",
    )
    release_reason: str | None = Field(
        default=None,
        max_length=2000,
        description="Reason for releasing the reservation",
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
    deposit_date: date | None = None
    deposit_refund_amount: float | None = None
    deposit_refund_date: date | None = None
    release_reason: str | None = None
    notes: str | None
    status: str
    created_at: datetime
    updated_at: datetime


class ReservationWithDetails(ReservationResponse):
    """Schema for reservation with extended details."""

    lot_numero: str
    lot_price: float | None
    lot_surface: float | None
    client_name: str
    client_phone: str | None
    client_email: str | None
    reserved_by_name: str | None


class ReservationAtRisk(ReservationWithDetails):
    """Schema for at-risk reservation (expiring soon or expired)."""

    risk_type: str = Field(description="expired or expiring_soon")
    days_remaining: int = Field(description="Days until expiration (negative if expired)")


class ReservationFilter(BaseSchema):
    """Schema for reservation filtering parameters."""

    project_id: int | None = None
    lot_id: int | None = None
    client_id: int | None = None
    status: str | None = None
    reserved_by_user_id: int | None = None
