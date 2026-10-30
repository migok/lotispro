"""Dashboard-related schemas for API responses."""

from datetime import date, datetime

from pydantic import Field

from app.domain.schemas.common import BaseSchema


class DashboardCounts(BaseSchema):
    """Schema for lot count statistics (one field per lot status)."""

    total: int
    # Individual statuses
    creation: int = 0
    available: int = 0
    option: int = 0
    reservation_a_finaliser: int = 0
    reservation_engagee: int = 0
    reservation_soldee: int = 0
    edl_programme: int = 0
    edl_realise: int = 0
    edl_finalise: int = 0
    chez_notaire: int = 0
    chez_proprietaire: int = 0
    blocked: int = 0
    # Aggregated for backward compatibility
    en_cours: int = Field(
        default=0,
        description="Active lots in workflow (option to chez_proprietaire, EDL included)",
    )
    # Legacy fields kept for backward compatibility
    reserved: int = Field(
        default=0,
        description="Legacy: option + reservation_a_finaliser + reservation_engagee",
    )
    sold: int = Field(default=0, description="Legacy: chez_proprietaire")


class DashboardSurfaces(BaseSchema):
    """Schema for surface statistics by status."""

    total: float = Field(default=0, description="Total surface in m²")
    available: float = Field(default=0, description="Available surface in m²")
    en_cours: float = Field(default=0, description="Active workflow surface in m²")
    chez_proprietaire: float = Field(
        default=0, description="Completed sales surface in m²"
    )
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


class PeriodRange(BaseSchema):
    """Inclusive range of business days."""

    date_from: date
    date_to: date


class FlowKpis(BaseSchema):
    """Flow KPIs over a period (see the E6 spec definitions)."""

    lots_vendus: int = 0
    ca: float = 0
    reservations_creees: int = 0
    taux_conversion: float = 0
    encaissements: float = 0


class FlowVariations(BaseSchema):
    """Percent change of each flow KPI vs the previous period (None if n/a)."""

    lots_vendus: float | None = None
    ca: float | None = None
    reservations_creees: float | None = None
    taux_conversion: float | None = None
    encaissements: float | None = None


class StateKpis(BaseSchema):
    """Lot counts by status at the end of the period (project level)."""

    available: int = 0
    option: int = 0


class PeriodStats(BaseSchema):
    """Period KPIs alone (``DashboardPeriodService.period_stats``), for the export."""

    period: PeriodRange
    previous_period: PeriodRange
    flow: FlowKpis
    flow_previous: FlowKpis
    variations: FlowVariations
    state: StateKpis
    state_kpis_available: bool
    flow_kpis_available: bool
    history_start: date | None = None


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
    ca_total: float = Field(
        default=0, description="Total project value (sum of all lot prices)"
    )
    taux_vente: float = Field(description="Sales rate percentage")
    taux_transformation: float = Field(
        description="Reservation to sale conversion rate"
    )
    lots_liberes: int = Field(
        default=0, description="Count of released/expired reservations (lots freed up)"
    )
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
    # Period KPIs (E6)
    period: PeriodRange | None = None
    previous_period: PeriodRange | None = None
    flow: FlowKpis | None = None
    flow_previous: FlowKpis | None = None
    variations: FlowVariations | None = None
    state: StateKpis | None = None
    state_kpis_available: bool = True
    flow_kpis_available: bool = True
    history_start: date | None = None


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


class PeriodBucket(BaseSchema):
    """Flow KPIs of one bucket (day, ISO week or month) of a period."""

    key: str
    lots_vendus: int = 0
    ca: float = 0
    reservations_creees: int = 0
    encaissements: float = 0


class PerformanceData(BaseSchema):
    """Schema for performance analytics."""

    sales_by_period: list[SalesByPeriod]
    reservations_vs_sales: list[ReservationsVsSales]
    average_durations: AverageDurations
    period: PeriodRange | None = None
    granularity: str | None = None
    series: list[PeriodBucket] = Field(default_factory=list)


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
