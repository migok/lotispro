"""Dashboard-related schemas for API responses."""

from datetime import datetime

from pydantic import Field

from app.domain.schemas.common import BaseSchema


class DashboardCounts(BaseSchema):
    """Schema for lot count statistics (9-status workflow)."""

    total: int
    # Individual statuses
    creation: int = 0
    available: int = 0
    option: int = 0
    reservation_a_finaliser: int = 0
    reservation_engagee: int = 0
    reservation_soldee: int = 0
    chez_notaire: int = 0
    chez_proprietaire: int = 0
    blocked: int = 0
    # Aggregated for backward compatibility
    en_cours: int = Field(
        default=0,
        description="Active lots in workflow (option + raf + engagee + soldee + notaire + proprietaire)",
    )
    # Legacy fields kept for backward compatibility
    reserved: int = Field(default=0, description="Legacy: option + reservation_a_finaliser + reservation_engagee")
    sold: int = Field(default=0, description="Legacy: chez_proprietaire")


class DashboardSurfaces(BaseSchema):
    """Schema for surface statistics by status."""

    total: float = Field(default=0, description="Total surface in m²")
    available: float = Field(default=0, description="Available surface in m²")
    en_cours: float = Field(default=0, description="Active workflow surface in m²")
    chez_proprietaire: float = Field(default=0, description="Completed sales surface in m²")
    blocked: float = Field(default=0, description="Blocked surface in m²")
    # Legacy
    reserved: float = Field(default=0, description="Legacy reserved surface in m²")
    sold: float = Field(default=0, description="Legacy sold surface in m²")


class DashboardPercentages(BaseSchema):
    """Schema for lot status percentages."""

    available: float
    en_cours: float
    chez_proprietaire: float
    blocked: float
    # Legacy
    reserved: float = 0.0
    sold: float = 0.0


class CategoryStats(BaseSchema):
    """Schema for statistics by category."""

    sold: int = 0
    reserved: int = 0
    available: int = 0
    en_cours: int = 0


class DashboardStats(BaseSchema):
    """Schema for main dashboard statistics."""

    counts: DashboardCounts
    percentages: DashboardPercentages
    surfaces: DashboardSurfaces = Field(
        default_factory=DashboardSurfaces,
        description="Surface statistics by status",
    )
    ca_realise: float = Field(description="Revenue realized from sales")
    ca_potentiel: float = Field(description="Potential revenue from reserved lots")
    ca_total: float = Field(default=0, description="Total project value (sum of all lot prices)")
    taux_vente: float = Field(description="Sales rate percentage")
    taux_transformation: float = Field(description="Reservation to sale conversion rate")
    lots_liberes: int = Field(default=0, description="Count of released/expired reservations (lots freed up)")
    by_type_lot: dict[str, CategoryStats] = Field(
        default_factory=dict,
        description="Statistics grouped by lot type",
    )
    by_emplacement: dict[str, CategoryStats] = Field(
        default_factory=dict,
        description="Statistics grouped by location/emplacement",
    )
    by_type_maison: dict[str, CategoryStats] = Field(
        default_factory=dict,
        description="Statistics grouped by house type",
    )


class SalesByPeriod(BaseSchema):
    """Schema for sales aggregated by period."""

    period: str
    count: int
    total_amount: float


class ReservationsVsSales(BaseSchema):
    """Schema for reservations vs sales comparison."""

    period: str
    reservations: int
    sales: int


class AverageDurations(BaseSchema):
    """Schema for average state durations."""

    available_to_reserved: float | None = Field(
        default=None,
        description="Average days from available to reserved",
    )
    reserved_to_sold: float | None = Field(
        default=None,
        description="Average days from reserved to sold",
    )


class PerformanceData(BaseSchema):
    """Schema for performance analytics."""

    sales_by_period: list[SalesByPeriod]
    reservations_vs_sales: list[ReservationsVsSales]
    average_durations: AverageDurations


class ClientPipeline(BaseSchema):
    """Schema for client in the sales pipeline."""

    id: int
    name: str
    phone: str | None
    email: str | None
    cin: str | None
    client_type: str | None
    notes: str | None
    created_by_user_id: int | None
    created_at: datetime
    updated_at: datetime
    active_reservations: int
    total_sales: int
    total_deposit: float
    total_purchases: float
    last_activity: datetime | None
    pipeline_status: str = Field(
        description="buyer, active_reservation, past_reservation, or prospect"
    )


class CommercialPerformance(BaseSchema):
    """Schema for commercial user performance."""

    user_id: int
    name: str
    email: str
    total_sales: int
    ca_total: float
    total_reservations: int
    converted_reservations: int
    taux_transformation: float
    ca_moyen: float


class AlertsSummary(BaseSchema):
    """Schema for lot workflow alerts summary."""

    # Expired options (lot in 'option' status past expiration date)
    expired_options: int = 0
    # Expired reservations to finalize (lot in 'reservation_a_finaliser' past finalization date)
    expired_finalisations: int = 0
    # At-risk options expiring within threshold
    expiring_soon_options: int = 0
    # Legacy fields
    expired_count: int = 0
    expiring_soon_count: int = 0
    total_at_risk: int
    value_at_risk: float
    deposit_at_risk: float
