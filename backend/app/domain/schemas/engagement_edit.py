"""Edit of an engaged reservation (E4-T5c) and its audit trail."""

from datetime import date, datetime
from typing import Any, Literal

from pydantic import Field, model_validator

from app.domain.schemas.common import BaseSchema
from app.domain.schemas.reservation import GAP_DUE_TIMING
from app.domain.schemas.reservation_payment import FinancialSummaryResponse

GAP_DATE_REQUIRED = "Indiquez la date de l'écart."


class InstallmentEdit(BaseSchema):
    """New amount and due date of an installment not yet fully received."""

    id: int
    amount: float = Field(gt=0, description="Montant de l'échéance")
    due_date: date = Field(description="Date d'échéance")


class EngagementEdit(BaseSchema):
    """Body of ``PUT /reservations/{id}/engagement`` (full replacement).

    ``installments`` lists exactly the ``deposit`` / ``balance`` installments
    not fully received; the ``gap`` installment is never sent: it follows the
    recomputed gap and its timing (R3).
    """

    agreed_total_price: float = Field(gt=0, description="Prix total convenu")
    sale_price: float = Field(gt=0, description="Prix figurant sur l'acte")
    gap_due_timing: GAP_DUE_TIMING = Field(
        description="Échéance de l'écart : début, fin ou date précise"
    )
    gap_due_date: date | None = Field(
        default=None, description="Date de l'écart (requise si 'date')"
    )
    notes: str | None = Field(default=None, description="Notes (null = aucune)")
    installments: list[InstallmentEdit]
    reason: str = Field(
        min_length=1, max_length=500, description="Motif de la modification"
    )
    expected_updated_at: datetime = Field(
        description="updated_at lu dans le récapitulatif (contrôle de concurrence)"
    )

    @model_validator(mode="after")
    def _gap_date_required(self) -> "EngagementEdit":
        if self.gap_due_timing == "date" and self.gap_due_date is None:
            raise ValueError(GAP_DATE_REQUIRED)
        return self


class EngagementEditResponse(FinancialSummaryResponse):
    """Financial summary after the edit, plus the deed regeneration outcome.

    ``acte_status``: ``None`` when the deed price did not change (no new
    version attempted); otherwise the outcome of the new version
    (``stored``, ``not_ready`` below the threshold, ``failed``).
    """

    acte_status: Literal["stored", "not_ready", "failed"] | None


class ReservationChangeResponse(BaseSchema):
    """One entry of the edit history (only the changed fields)."""

    id: int
    user_id: int | None
    user_name: str | None
    changed_at: datetime
    reason: str
    before: dict[str, Any]
    after: dict[str, Any]
