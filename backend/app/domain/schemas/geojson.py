"""GeoJSON-related schemas for API requests and responses."""

from typing import Any

from pydantic import Field

from app.domain.schemas.common import BaseSchema


class GeoJSONFeature(BaseSchema):
    """Schema for a GeoJSON feature."""

    type: str = "Feature"
    geometry: dict[str, Any] | None = Field(description="GeoJSON geometry object")
    properties: dict[str, Any] = Field(default_factory=dict, description="Feature properties")


class GeoJSONFeatureCollection(BaseSchema):
    """Schema for a GeoJSON feature collection."""

    type: str = "FeatureCollection"
    features: list[GeoJSONFeature] = Field(default_factory=list)


class GeoJSONUploadResult(BaseSchema):
    """Schema for GeoJSON upload result."""

    created: int = Field(description="Number of lots created")
    updated: int = Field(description="Number of lots updated")
    skipped: int = Field(description="Number of lots skipped")
    errors: list[str] = Field(default_factory=list, description="Error messages")


class LotGeoJSONProperties(BaseSchema):
    """Schema for lot properties in GeoJSON export."""

    id: int
    numero: str
    zone: str | None
    surface: float | None
    price: float | None
    status: str
    client_name: str | None = None
    reservation_date: str | None = None
    expiration_date: str | None = None
