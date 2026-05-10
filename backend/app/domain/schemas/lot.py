"""Lot-related schemas for API requests and responses."""

from datetime import date, datetime
from typing import Any, Literal

from pydantic import Field, field_validator

from app.domain.schemas.common import BaseSchema

# Central lot status type — single source of truth for all schema validators
LOT_STATUS = Literal[
    "creation",
    "available",
    "option",
    "reservation_a_finaliser",
    "reservation_engagee",
    "reservation_soldee",
    "chez_notaire",
    "chez_proprietaire",
    "blocked",
]

# Statuses that are part of an active sales workflow
ACTIVE_LOT_STATUSES = (
    "option",
    "reservation_a_finaliser",
    "reservation_engagee",
    "reservation_soldee",
    "chez_notaire",
    "chez_proprietaire",
)

# Statuses that can be set via direct lot update (not transition endpoints)
DIRECT_UPDATE_STATUSES = ("creation", "available", "blocked")

# Statuses that prevent lot deletion
NON_DELETABLE_STATUSES = (
    "option",
    "reservation_a_finaliser",
    "reservation_engagee",
    "reservation_soldee",
    "chez_notaire",
    "chez_proprietaire",
)


class LotCreate(BaseSchema):
    """Schema for creating a new lot."""

    numero: str = Field(min_length=1, max_length=50, description="Lot number/identifier")
    zone: str | None = Field(default=None, max_length=50, description="Zone identifier")
    surface: float | None = Field(default=None, ge=0, description="Surface area in m²")
    price: float | None = Field(default=None, ge=0, description="Prix catalogue (auto-calculé si price_per_sqm fourni)")
    price_per_sqm: float | None = Field(default=None, ge=0, description="Prix par m² — calcule price automatiquement")
    status: LOT_STATUS = Field(
        default="creation",
        description="Lot status",
    )
    project_id: int = Field(description="Parent project ID")
    geometry: dict[str, Any] | None = Field(default=None, description="GeoJSON geometry")
    # Metadata fields
    type_lot: str | None = Field(default=None, max_length=50, description="Type de lot (ex: commercial, résidentiel)")
    emplacement: str | None = Field(default=None, max_length=50, description="Emplacement (ex: 2 façade, 3 façade)")
    type_maison: str | None = Field(default=None, max_length=50, description="Type de maison (ex: villa, appartement)")

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, v: str | None) -> str | None:
        return v.strip().lower() if isinstance(v, str) else v


class LotUpdate(BaseSchema):
    """Schema for updating a lot (direct fields only).

    Status changes for workflow transitions must use dedicated transition endpoints.
    Only creation/available/blocked can be set directly here.
    """

    numero: str | None = Field(
        default=None,
        min_length=1,
        max_length=50,
        description="Lot number",
    )
    zone: str | None = Field(default=None, max_length=50, description="Zone identifier")
    surface: float | None = Field(default=None, ge=0, description="Surface area")
    price: float | None = Field(default=None, ge=0, description="Prix catalogue (auto-calculé si price_per_sqm fourni)")
    price_per_sqm: float | None = Field(default=None, ge=0, description="Prix par m² catalogue — calcule price automatiquement")
    price_per_sqm_acte: float | None = Field(default=None, ge=0, description="Prix par m² acte notarié")
    status: LOT_STATUS | None = Field(
        default=None,
        description="Lot status (direct update limited to creation/available/blocked)",
    )
    # Metadata fields
    type_lot: str | None = Field(default=None, max_length=50, description="Type de lot")
    emplacement: str | None = Field(default=None, max_length=50, description="Emplacement")
    type_maison: str | None = Field(default=None, max_length=50, description="Type de maison")

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, v: str | None) -> str | None:
        return v.strip().lower() if isinstance(v, str) else v


class LotResponse(BaseSchema):
    """Schema for lot data in responses."""

    id: int
    project_id: int
    numero: str
    zone: str | None
    surface: float | None
    price: float | None
    price_per_sqm: float | None = None
    price_per_sqm_acte: float | None = None
    status: str
    current_reservation_id: int | None
    geometry: dict[str, Any] | None = None
    # Metadata fields
    type_lot: str | None = None
    emplacement: str | None = None
    type_maison: str | None = None
    created_at: datetime
    updated_at: datetime

    @field_validator("geometry", mode="before")
    @classmethod
    def parse_geometry(cls, v: Any) -> dict[str, Any] | None:
        """Accept both JSON strings (from ORM) and dicts (from manual construction)."""
        if v is None:
            return None
        if isinstance(v, dict):
            return v
        if isinstance(v, str):
            import json
            try:
                return json.loads(v)
            except (json.JSONDecodeError, ValueError):
                return None
        return None


class LotWithDetails(LotResponse):
    """Schema for lot with extended details (reservation, client info)."""

    # Reservation info
    reservation_id: int | None = None
    reservation_date: datetime | None = None
    expiration_date: datetime | None = None
    deposit: float | None = None
    reservation_status: str | None = None

    # New workflow fields from reservation
    guarantee_amount: float | None = None
    payment_type: str | None = None
    notaire_id: int | None = None
    notary_name: str | None = None
    notary_date: date | None = None

    # Client info
    client_id: int | None = None
    client_name: str | None = None
    client_phone: str | None = None

    # Commercial who created the reservation
    reserved_by_user_id: int | None = None
    reserved_by_name: str | None = None

    # Computed fields
    days_in_status: int | None = None


class LotFilter(BaseSchema):
    """Schema for lot filtering parameters."""

    project_id: int | None = None
    numero: str | None = None
    zone: str | None = None
    status: LOT_STATUS | None = None
    surface_min: float | None = Field(default=None, ge=0)
    surface_max: float | None = Field(default=None, ge=0)
    price_min: float | None = Field(default=None, ge=0)
    price_max: float | None = Field(default=None, ge=0)
    # Metadata filters
    type_lot: str | None = None
    emplacement: str | None = None
    type_maison: str | None = None

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, v: str | None) -> str | None:
        return v.strip().lower() if isinstance(v, str) else v


class LotBulkMetadataUpdate(BaseSchema):
    """Schema for bulk metadata update on multiple lots (manager only)."""

    lot_ids: list[int] = Field(min_length=1, description="List of lot IDs to update")
    # Optional metadata fields — only non-None values will be applied
    type_lot: str | None = Field(default=None, max_length=50, description="Type de lot")
    emplacement: str | None = Field(default=None, max_length=50, description="Emplacement")
    type_maison: str | None = Field(default=None, max_length=50, description="Type de maison")
    price: float | None = Field(default=None, ge=0, description="Prix du lot")
    price_per_sqm: float | None = Field(default=None, ge=0, description="Prix par m²")
    surface: float | None = Field(default=None, ge=0, description="Surface en m²")
    zone: str | None = Field(default=None, max_length=50, description="Zone")
