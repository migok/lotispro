"""Project-related schemas for API requests and responses."""

from datetime import datetime
from typing import Literal

from pydantic import Field

from app.domain.schemas.common import BaseSchema


class ProjectCreate(BaseSchema):
    """Schema for creating a new project."""

    name: str = Field(min_length=1, max_length=200, description="Project name")
    description: str | None = Field(
        default=None,
        max_length=2000,
        description="Project description",
    )
    visibility: Literal["public", "private"] = Field(
        default="private",
        description="Project visibility",
    )


class ProjectUpdate(BaseSchema):
    """Schema for updating a project."""

    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=200,
        description="Project name",
    )
    description: str | None = Field(
        default=None,
        max_length=2000,
        description="Project description",
    )
    visibility: Literal["public", "private"] | None = Field(
        default=None,
        description="Project visibility",
    )


class ProjectResponse(BaseSchema):
    """Schema for project data in responses."""

    id: int
    name: str
    description: str | None
    visibility: str
    total_lots: int
    sold_lots: int
    ca_objectif: float | None
    geojson_file_url: str | None = Field(
        default=None,
        description="URL of the uploaded GeoJSON file in Supabase Storage",
    )
    created_by: int
    created_at: datetime
    updated_at: datetime


class ProjectKPIs(BaseSchema):
    """Schema for project KPIs."""

    project_id: int
    total_lots: int
    available_lots: int
    reserved_lots: int
    sold_lots: int
    blocked_lots: int
    # Surfaces
    surface_totale: float = Field(default=0, description="Total surface in m²")
    surface_disponible: float = Field(default=0, description="Available surface in m²")
    surface_reservee: float = Field(default=0, description="Reserved surface in m²")
    surface_vendue: float = Field(default=0, description="Sold surface in m²")
    # Revenue
    ca_realise: float = Field(description="Revenue realized from sales")
    ca_potentiel: float = Field(description="Potential revenue from available lots")
    ca_objectif: float | None = Field(description="Revenue target")
    progression_ca: float = Field(default=0, description="CA progress percentage")
    prix_moyen_lot: float = Field(default=0, description="Average price per sold lot")
    prix_moyen_m2: float = Field(default=0, description="Average price per m²")
    # Rates
    taux_vente: float = Field(description="Sales rate percentage")
    taux_reservation: float = Field(default=0, description="Reservation rate percentage")
    taux_transformation: float = Field(description="Reservation to sale conversion rate")
    taux_conversion: float = Field(default=0, description="Alias for taux_transformation")
    # Deposits
    total_deposits: float = Field(default=0, description="Total deposits from active reservations")
    # Monthly stats
    ventes_mois: int = Field(default=0, description="Sales count this month")
    ca_mois: float = Field(default=0, description="Revenue this month")
    tendance_ventes: float = Field(default=0, description="Sales trend vs previous month (%)")
    tendance_ca: float = Field(default=0, description="Revenue trend vs previous month (%)")


class ProjectPerformance(BaseSchema):
    """Schema for commercial performance on a project."""

    user_id: int
    user_name: str
    total_sales: int
    total_reservations: int
    converted_reservations: int
    ca_total: float
    taux_transformation: float


class AssignmentResponse(BaseSchema):
    """Schema for project assignment response."""

    id: int
    user_id: int
    project_id: int
    assigned_at: datetime
    assigned_by: int


class AssignUserRequest(BaseSchema):
    """Schema for assigning a user to a project."""

    user_id: int = Field(description="ID of the user to assign")
