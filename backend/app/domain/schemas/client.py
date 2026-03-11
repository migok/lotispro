"""Client-related schemas for API requests and responses."""

from datetime import date, datetime
from typing import Literal

from pydantic import EmailStr, Field

from app.domain.schemas.common import BaseSchema


class ClientCreate(BaseSchema):
    """Schema for creating a new client."""

    name: str = Field(min_length=1, max_length=200, description="Client full name")
    phone: str | None = Field(default=None, max_length=20, description="Phone number")
    email: EmailStr | None = Field(default=None, description="Email address")
    cin: str | None = Field(default=None, max_length=20, description="National ID (CIN)")
    address: str | None = Field(default=None, max_length=500, description="Client address")
    client_type: Literal["proprietaire", "revendeur", "investisseur", "autre"] = Field(
        default="autre",
        description="Client type",
    )
    notes: str | None = Field(default=None, max_length=2000, description="Additional notes")


class ClientUpdate(BaseSchema):
    """Schema for updating a client."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    phone: str | None = Field(default=None, max_length=20)
    email: EmailStr | None = None
    cin: str | None = Field(default=None, max_length=20)
    address: str | None = Field(default=None, max_length=500)
    client_type: Literal["proprietaire", "revendeur", "investisseur", "autre"] | None = None
    notes: str | None = Field(default=None, max_length=2000)


class ClientResponse(BaseSchema):
    """Schema for client data in responses."""

    id: int
    name: str
    phone: str | None
    email: str | None
    cin: str | None
    address: str | None = None
    client_type: str | None
    notes: str | None
    created_by_user_id: int | None
    created_at: datetime
    updated_at: datetime


class SaleHistory(BaseSchema):
    """Schema for client sale history entry."""

    id: int
    sale_date: datetime
    price: float
    notes: str | None
    lot_numero: str
    lot_surface: float | None
    lot_zone: str | None
    project_id: int
    project_name: str
    sold_by_user_id: int | None
    sold_by_name: str | None


class ReservationHistory(BaseSchema):
    """Schema for client reservation history entry."""

    id: int
    reservation_date: datetime
    expiration_date: datetime
    deposit: float
    deposit_date: date | None = None
    deposit_refund_amount: float | None = None
    deposit_refund_date: date | None = None
    release_reason: str | None = None
    status: str
    notes: str | None
    lot_numero: str
    lot_surface: float | None
    lot_zone: str | None
    lot_price: float | None
    project_id: int
    project_name: str
    reserved_by_user_id: int | None
    reserved_by_name: str | None


class ClientStats(BaseSchema):
    """Schema for client statistics."""

    total_purchases: float
    total_lots: int
    total_deposit: float
    active_reservations: int
    total_reservations: int
    converted_reservations: int


class ClientDetails(ClientResponse):
    """Schema for detailed client information."""

    created_by: dict | None = None
    sales_history: list[SaleHistory] = Field(default_factory=list)
    reservations_history: list[ReservationHistory] = Field(default_factory=list)
    stats: ClientStats | None = None


class ClientFilter(BaseSchema):
    """Schema for client filtering parameters."""

    search: str | None = Field(
        default=None,
        description="Search by name, phone, or CIN",
    )
    client_type: Literal["proprietaire", "revendeur", "investisseur", "autre"] | None = None
