"""Lot-related schemas for API requests and responses."""

from datetime import datetime
from typing import Any, Literal

from pydantic import Field

from app.domain.schemas.common import BaseSchema


class LotCreate(BaseSchema):
    """Schema for creating a new lot."""

    numero: str = Field(min_length=1, max_length=50, description="Lot number/identifier")
    zone: str | None = Field(default=None, max_length=50, description="Zone identifier")
    surface: float | None = Field(default=None, ge=0, description="Surface area in m²")
    price: float | None = Field(default=None, ge=0, description="Lot price")
    status: Literal["available", "reserved", "sold", "blocked"] = Field(
        default="available",
        description="Lot status",
    )
    project_id: int = Field(description="Parent project ID")
    geometry: dict[str, Any] | None = Field(default=None, description="GeoJSON geometry")
    # Metadata fields
    type_lot: str | None = Field(default=None, max_length=50, description="Type de lot (ex: commercial, résidentiel)")
    emplacement: str | None = Field(default=None, max_length=50, description="Emplacement (ex: 2 façade, 3 façade)")
    type_maison: str | None = Field(default=None, max_length=50, description="Type de maison (ex: villa, appartement)")


class LotUpdate(BaseSchema):
    """Schema for updating a lot."""

    numero: str | None = Field(
        default=None,
        min_length=1,
        max_length=50,
        description="Lot number",
    )
    zone: str | None = Field(default=None, max_length=50, description="Zone identifier")
    surface: float | None = Field(default=None, ge=0, description="Surface area")
    price: float | None = Field(default=None, ge=0, description="Lot price")
    status: Literal["available", "reserved", "sold", "blocked"] | None = Field(
        default=None,
        description="Lot status",
    )
    # Metadata fields
    type_lot: str | None = Field(default=None, max_length=50, description="Type de lot")
    emplacement: str | None = Field(default=None, max_length=50, description="Emplacement")
    type_maison: str | None = Field(default=None, max_length=50, description="Type de maison")


class LotResponse(BaseSchema):
    """Schema for lot data in responses."""

    id: int
    project_id: int
    numero: str
    zone: str | None
    surface: float | None
    price: float | None
    status: str
    current_reservation_id: int | None
    geometry: dict[str, Any] | None = None
    # Metadata fields
    type_lot: str | None = None
    emplacement: str | None = None
    type_maison: str | None = None
    created_at: datetime
    updated_at: datetime


class LotWithDetails(LotResponse):
    """Schema for lot with extended details (reservation, client info)."""

    # Reservation info
    reservation_id: int | None = None
    reservation_date: datetime | None = None
    expiration_date: datetime | None = None
    deposit: float | None = None
    reservation_status: str | None = None

    # Client info
    client_id: int | None = None
    client_name: str | None = None
    client_phone: str | None = None

    # Computed fields
    days_in_status: int | None = None


class LotFilter(BaseSchema):
    """Schema for lot filtering parameters."""

    project_id: int | None = None
    numero: str | None = None
    zone: str | None = None
    status: Literal["available", "reserved", "sold", "blocked"] | None = None
    surface_min: float | None = Field(default=None, ge=0)
    surface_max: float | None = Field(default=None, ge=0)
    price_min: float | None = Field(default=None, ge=0)
    price_max: float | None = Field(default=None, ge=0)
    # Metadata filters
    type_lot: str | None = None
    emplacement: str | None = None
    type_maison: str | None = None


class LotBulkMetadataUpdate(BaseSchema):
    """Schema for bulk metadata update on multiple lots (manager only)."""

    lot_ids: list[int] = Field(min_length=1, description="List of lot IDs to update")
    # Optional metadata fields — only non-None values will be applied
    type_lot: str | None = Field(default=None, max_length=50, description="Type de lot")
    emplacement: str | None = Field(default=None, max_length=50, description="Emplacement")
    type_maison: str | None = Field(default=None, max_length=50, description="Type de maison")
    price: float | None = Field(default=None, ge=0, description="Prix du lot")
    surface: float | None = Field(default=None, ge=0, description="Surface en m²")
    zone: str | None = Field(default=None, max_length=50, description="Zone")
