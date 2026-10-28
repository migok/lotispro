"""Reservation-related schemas for API requests and responses."""

from datetime import date, datetime
from typing import Literal

from pydantic import Field, model_validator

from app.domain.schemas.common import BaseSchema


class PaymentPlanData(BaseSchema):
    """Inline payment schedule parameters, embedded inside engagement transitions.

    Maps 1-to-1 with the frontend DEFAULT_PAYMENT_PLAN state object so the
    frontend can send the configurator values directly without transformation.
    """

    deposit_pct: float = Field(
        default=50.0,
        ge=0,
        le=100,
        description="Acompte en pourcentage du prix de vente",
    )
    deposit_start_date: datetime | None = Field(
        default=None,
        description="Date du premier versement acompte (aujourd'hui si absent)",
    )
    balance_delay_months: int = Field(
        default=0,
        ge=0,
        le=60,
        description="Délai en mois après le dernier acompte avant le premier solde",
    )
    deposit_count: int = Field(
        default=1, ge=1, le=120, description="Nombre de versements acompte"
    )
    deposit_periodicity: int = Field(
        default=1, ge=1, le=24, description="Périodicité acompte (mois)"
    )
    balance_count: int = Field(
        default=1, ge=1, le=120, description="Nombre de versements solde"
    )
    balance_periodicity: int = Field(
        default=1, ge=1, le=24, description="Périodicité solde (mois)"
    )


PAYMENT_TYPE = Literal["cash", "card", "check", "transfer"]


class ReservationFilter(BaseSchema):
    """Schema for filtering reservations."""

    project_id: int | None = None
    lot_id: int | None = None
    client_id: int | None = None
    status: str | None = None
    reserved_by_user_id: int | None = None


# ---------------------------------------------------------------------------
# Legacy schemas — kept for backward compatibility with existing tests/clients
# ---------------------------------------------------------------------------


class ReservationCreate(BaseSchema):
    """Schema for creating a new reservation (legacy — prefer OptionCreate)."""

    lot_id: int = Field(description="Lot to reserve")
    client_id: int = Field(description="Client making the reservation")
    reservation_days: int = Field(
        default=7,
        ge=1,
        le=365,
        description="Number of days the reservation is valid (default: 7 days)",
    )
    expiration_date: datetime | None = Field(
        default=None,
        description="Reservation expiration date (overrides reservation_days if provided)",
    )
    deposit: float = Field(default=0, ge=0, description="Deposit amount")
    deposit_date: date | None = Field(
        default=None, description="Date the deposit was received"
    )
    notes: str | None = Field(default=None, max_length=2000, description="Notes")


class ReservationExtend(BaseSchema):
    """Schema for extending an option expiration date."""

    additional_days: int = Field(
        ge=1,
        le=365,
        description="Number of days to add to the option expiration",
    )


class ReservationRelease(BaseSchema):
    """Schema for releasing (cancelling) a reservation with optional refund info."""

    deposit_refund_amount: float | None = Field(
        default=None,
        ge=0,
        description="Amount of deposit refunded to the client (None = no refund recorded)",
    )
    deposit_refund_date: date | None = Field(
        default=None,
        description="Date the deposit was refunded",
    )
    release_reason: str | None = Field(
        default=None,
        max_length=2000,
        description="Reason for releasing the reservation",
    )


# ---------------------------------------------------------------------------
# New transition schemas
# ---------------------------------------------------------------------------


class OptionCreate(BaseSchema):
    """Schema for starting an option (available → option)."""

    client_id: int = Field(description="Client associated with the option")
    expiration_date: datetime = Field(description="Option expiration date (required)")
    deposit: float = Field(
        default=0, ge=0, description="Initial deposit amount (optional)"
    )
    deposit_date: date | None = Field(
        default=None, description="Date the deposit was received"
    )
    notes: str | None = Field(default=None, max_length=2000, description="Notes")


class ReservationAFinaliserData(BaseSchema):
    """Schema for transitioning option → reservation_a_finaliser."""

    guarantee_amount: float = Field(gt=0, description="Guarantee amount received")
    finalization_date: datetime = Field(
        description="Deadline to finalize the reservation"
    )
    payment_type: PAYMENT_TYPE = Field(description="Payment method used for guarantee")
    notes: str | None = Field(default=None, max_length=2000, description="Notes")


class FinaliserRefundData(BaseSchema):
    """Schema for reservation_a_finaliser → available (refund path)."""

    refund_amount: float = Field(ge=0, description="Amount refunded to the client")
    refund_date: date = Field(description="Date of the refund")
    release_reason: str | None = Field(
        default=None,
        max_length=2000,
        description="Reason for cancellation",
    )


GAP_DUE_TIMING = Literal["debut", "fin", "date"]


class EngagementAmountsData(BaseSchema):
    """Montants d'un engagement (E4-T5), communs aux trois chemins d'engagement.

    ``sale_price`` garde son nom : c'est le prix figurant sur l'acte.
    L'écart à régulariser (convenu − acte) n'est jamais saisi.
    """

    agreed_total_price: float | None = Field(
        default=None,
        gt=0,
        description="Prix total convenu (par défaut : prix catalogue du lot)",
    )
    sale_price: float | None = Field(
        default=None,
        ge=0,
        description=(
            "Prix figurant sur l'acte (par défaut : grille de prix, sinon prix "
            "total convenu) ; ne peut pas dépasser le prix total convenu"
        ),
    )
    gap_due_timing: GAP_DUE_TIMING = Field(
        default="fin",
        description="Échéance de l'écart à régulariser : début, fin ou date précise",
    )
    gap_due_date: date | None = Field(
        default=None,
        description="Date de l'écart (requise si gap_due_timing = 'date')",
    )
    # Échéancier de paiement (optionnel — sans plan, échéancier minimal)
    payment_plan: PaymentPlanData | None = Field(
        default=None,
        description="Plan de paiement à créer lors de l'engagement (optionnel)",
    )

    @model_validator(mode="after")
    def _gap_date_required(self) -> "EngagementAmountsData":
        if self.gap_due_timing == "date" and self.gap_due_date is None:
            raise ValueError("Indiquez la date de l'écart.")
        return self


class FinaliserEngageData(EngagementAmountsData):
    """Schema for reservation_a_finaliser → reservation_engagee.

    Both guarantee actions advance the lot to reservation_engagee.
    - deduct: guarantee is kept as part of payment
    - refund: guarantee is physically returned to client (e.g. cheque returned),
              but the reservation still advances — client will provide new guarantee
    """

    guarantee_action: Literal["deduct", "refund"] = Field(
        default="deduct",
        description="How the guarantee is handled: kept (deduct) or returned (refund)",
    )
    refund_amount: float | None = Field(
        default=None,
        ge=0,
        description="Amount returned to client (only when guarantee_action=refund)",
    )
    refund_date: date | None = Field(
        default=None,
        description="Date the guarantee was returned (only when guarantee_action=refund)",
    )
    refund_payment_type: PAYMENT_TYPE | None = Field(
        default=None,
        description="Payment method used for the refund (only when guarantee_action=refund)",
    )


class ChezNotaireData(BaseSchema):
    """Schema for reservation_soldee → chez_notaire."""

    notaire_id: int = Field(description="ID du notaire sélectionné")
    notary_date: date = Field(description="Date de l'acte notarial")
    notes: str | None = Field(default=None, max_length=2000, description="Notes")


class DirectToRAFData(BaseSchema):
    """Schema for direct transition available → reservation_a_finaliser (sans passer par option)."""

    client_id: int = Field(description="Client associated with the reservation")
    guarantee_amount: float = Field(gt=0, description="Guarantee amount received")
    payment_type: PAYMENT_TYPE = Field(description="Payment method used for guarantee")
    finalization_date: datetime = Field(
        description="Deadline to finalize the reservation"
    )
    notes: str | None = Field(default=None, max_length=2000, description="Notes")


class EngageBaseData(EngagementAmountsData):
    """Champs communs aux engagements directs (premier acompte, prix, échéancier)."""

    guarantee_amount: float = Field(
        gt=0, description="Premier acompte reçu à l'engagement"
    )
    payment_type: PAYMENT_TYPE = Field(description="Payment method used")
    notes: str | None = Field(default=None, max_length=2000, description="Notes")


class OptionEngageData(EngageBaseData):
    """Schema for option → reservation_engagee (réservation d'option existante).

    Mêmes champs que ``DirectToEngageeData`` sans ``client_id`` (le client est
    celui de l'option), plus le sort de l'acompte versé pendant l'option.
    """

    deposit_action: Literal["deduct", "refund"] | None = Field(
        default=None,
        description=(
            "Sort de l'acompte de l'option : conservé (deduct) ou remboursé "
            "(refund). Requis si l'option a un acompte."
        ),
    )
    refund_amount: float | None = Field(
        default=None,
        ge=0,
        description="Amount returned to client (only when deposit_action=refund)",
    )
    refund_date: date | None = Field(
        default=None,
        description="Date the deposit was returned (only when deposit_action=refund)",
    )
    refund_payment_type: PAYMENT_TYPE | None = Field(
        default=None,
        description="Payment method used for the refund (only when deposit_action=refund)",
    )


class DirectToEngageeData(EngageBaseData):
    """Schema for direct transition available → reservation_engagee (avec ND + premier acompte)."""

    client_id: int = Field(description="Client associated with the reservation")


class SetNotaireIntentData(BaseSchema):
    """Schema for setting the notaire intent tag on a reservation_soldee lot."""

    wants_notaire: bool = Field(
        description="Si True, le client souhaite passer chez le notaire"
    )
    notes: str | None = Field(default=None, max_length=2000)


class BlockLotData(BaseSchema):
    """Schema for blocking a lot."""

    reason: str | None = Field(
        default=None,
        max_length=2000,
        description="Reason for blocking the lot",
    )


class UnblockLotData(BaseSchema):
    """Schema for unblocking a lot."""

    notes: str | None = Field(default=None, max_length=2000)


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class ReservationResponse(BaseSchema):
    """Schema for reservation data in responses."""

    id: int
    project_id: int
    lot_id: int
    client_id: int
    reserved_by_user_id: int | None
    reservation_date: datetime
    expiration_date: datetime
    deposit: float
    deposit_date: date | None = None
    deposit_refund_amount: float | None = None
    deposit_refund_date: date | None = None
    deposit_refund_payment_type: str | None = None
    release_reason: str | None = None
    notes: str | None
    status: str
    # New workflow fields
    payment_type: str | None = None
    guarantee_amount: float | None = None
    notaire_id: int | None = None
    notary_name: str | None = None
    notary_date: date | None = None
    # Réservation engagée — montants (E4-T5)
    sale_price: float | None = None  # prix figurant sur l'acte
    agreed_total_price: float | None = None
    gap_amount: float | None = None  # calculé : convenu − acte
    gap_due_timing: str | None = None
    gap_due_date: date | None = None
    # Premier acompte reçu = somme des encaissements sans échéance (calculé)
    first_payment: float = 0.0
    # Dépréciés (E4-T5) : plus écrits par l'engagement
    promotion_amount: float | None = None
    promotion_paid_timing: str | None = None
    promotion_received: bool = False
    # Réservation soldée — intention notaire
    wants_notaire: bool = False
    # Clôture définitive (chez_notaire → chez_proprietaire)
    closed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
