"""Schemas for lot pricing configuration (prix_m2_acte / prix_m2_catalogue)."""

from datetime import datetime

from pydantic import Field

from app.domain.schemas.common import BaseSchema


class LotPricingConfigItem(BaseSchema):
    """One pricing row for a categorical combination."""

    zone: str | None = Field(default=None, max_length=50)
    type_lot: str | None = Field(default=None, max_length=50)
    type_maison: str | None = Field(default=None, max_length=50)
    emplacement: str | None = Field(default=None, max_length=50)
    prix_m2_acte: float = Field(gt=0, description="Prix au m² de vente acte (stable)")
    prix_m2_catalogue: float = Field(gt=0, description="Prix au m² catalogue (modifiable)")


class LotPricingConfigBulkUpsert(BaseSchema):
    """Bulk upsert payload for pricing configs."""

    configs: list[LotPricingConfigItem] = Field(min_length=1, max_length=200)


class LotPricingConfigResponse(LotPricingConfigItem):
    """Pricing config with DB metadata and affected lot count."""

    id: int
    project_id: int
    created_by: int
    created_at: datetime
    updated_at: datetime
    lots_affected: int = Field(
        default=0,
        description="Nombre de lots en creation/available avec cette combinaison",
    )


class LotPricingCombination(BaseSchema):
    """A categorical combination found in project lots, without a config yet."""

    zone: str | None = None
    type_lot: str | None = None
    type_maison: str | None = None
    emplacement: str | None = None
    lot_count: int = 0


class LotPricingConfigsListResponse(BaseSchema):
    """Full response: existing configs + unconfigured combinations."""

    configs: list[LotPricingConfigResponse]
    unconfigured_combinations: list[LotPricingCombination]


class ApplyPricingConfigsResponse(BaseSchema):
    """Response from applying pricing configs to existing lots."""

    lots_updated: int
    lots_activated: int
