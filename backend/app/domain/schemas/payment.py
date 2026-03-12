"""Payment schedule and installment schemas for API requests and responses."""

from datetime import datetime

from pydantic import Field, field_validator

from app.domain.schemas.common import BaseSchema


class InstallmentConfig(BaseSchema):
    """Configuration for one payment tranche (deposit or balance).

    Note: the start date is NOT set here — deposit start is set on the schedule,
    and balance start is automatically derived from the last deposit date + delay.
    """

    count: int = Field(ge=1, le=120, description="Number of installments")
    periodicity_months: int = Field(
        default=1,
        ge=1,
        le=24,
        description="Months between installments",
    )


class PaymentScheduleCreate(BaseSchema):
    """Schema for creating a payment schedule linked to a reservation."""

    reservation_id: int = Field(description="Reservation to attach the schedule to")
    lot_price: float = Field(gt=0, description="Lot price snapshot at schedule creation")
    deposit_pct: float = Field(
        default=50.0,
        ge=0,
        le=100,
        description="Deposit percentage (balance = 100 - deposit_pct)",
    )
    deposit_start_date: datetime | None = Field(
        default=None,
        description="Date of first deposit installment (defaults to today if omitted)",
    )
    balance_delay_months: int = Field(
        default=0,
        ge=0,
        le=60,
        description="Months to wait after the last deposit installment before starting balance",
    )
    deposit_installments: InstallmentConfig = Field(
        description="Installment configuration for the deposit tranche",
    )
    balance_installments: InstallmentConfig = Field(
        description="Installment configuration for the balance tranche",
    )

    @field_validator("deposit_pct")
    @classmethod
    def validate_deposit_pct(cls, v: float) -> float:
        """Ensure percentages are valid."""
        if v < 0 or v > 100:
            msg = "deposit_pct must be between 0 and 100"
            raise ValueError(msg)
        return round(v, 4)


class PaymentInstallmentResponse(BaseSchema):
    """Schema for a single payment installment."""

    id: int
    schedule_id: int
    payment_type: str
    installment_number: int
    amount: float
    due_date: datetime
    status: str
    paid_date: datetime | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class PaymentScheduleResponse(BaseSchema):
    """Schema for a complete payment schedule with all installments."""

    id: int
    reservation_id: int
    lot_price: float
    deposit_pct: float
    balance_pct: float
    deposit_total: float
    balance_total: float
    balance_delay_months: int
    installments: list[PaymentInstallmentResponse]
    created_at: datetime
    updated_at: datetime


class PaymentInstallmentUpdate(BaseSchema):
    """Schema for updating an installment status."""

    status: str = Field(description="'pending' or 'paid'")
    paid_date: datetime | None = Field(default=None)
    notes: str | None = Field(default=None, max_length=500)
