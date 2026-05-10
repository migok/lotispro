"""Reservation-related schemas for API requests and responses."""

from datetime import date, datetime
from typing import Literal

from pydantic import Field

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
    deposit_count: int = Field(default=1, ge=1, le=120, description="Nombre de versements acompte")
    deposit_periodicity: int = Field(
        default=1, ge=1, le=24, description="Périodicité acompte (mois)"
    )
    balance_count: int = Field(default=1, ge=1, le=120, description="Nombre de versements solde")
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
    deposit_date: date | None = Field(default=None, description="Date the deposit was received")
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
    deposit: float = Field(default=0, ge=0, description="Initial deposit amount (optional)")
    deposit_date: date | None = Field(default=None, description="Date the deposit was received")
    notes: str | None = Field(default=None, max_length=2000, description="Notes")


class ReservationAFinaliserData(BaseSchema):
    """Schema for transitioning option → reservation_a_finaliser."""

    guarantee_amount: float = Field(gt=0, description="Guarantee amount received")
    finalization_date: datetime = Field(description="Deadline to finalize the reservation")
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


class FinaliserEngageData(BaseSchema):
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
    # Prix de vente et promotion
    sale_price: float | None = Field(
        default=None,
        ge=0,
        description="Prix de vente indiqué sur l'acte de réservation (peut différer du prix catalogue)",
    )
    promotion_paid_timing: Literal["debut", "fin"] | None = Field(
        default=None,
        description="Quand la promotion est payée : au début (avec le 1er acompte) ou à la fin",
    )
    promotion_received: bool = Field(
        default=False,
        description="Le montant de la promotion a déjà été reçu au moment de l'engagement",
    )
    # Échéancier de paiement (optionnel — créé atomiquement avec la transition)
    payment_plan: PaymentPlanData | None = Field(
        default=None,
        description="Plan de paiement à créer lors de l'engagement (optionnel)",
    )


class MarkPromotionReceivedData(BaseSchema):
    """Schema for marking a promotion as received on an engaged reservation."""

    received_date: date | None = Field(
        default=None,
        description="Date de réception du montant de la promotion (par défaut aujourd'hui)",
    )
    notes: str | None = Field(default=None, max_length=2000)


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
    finalization_date: datetime = Field(description="Deadline to finalize the reservation")
    notes: str | None = Field(default=None, max_length=2000, description="Notes")


class DirectToEngageeData(BaseSchema):
    """Schema for direct transition available → reservation_engagee (avec ND + premier acompte)."""

    client_id: int = Field(description="Client associated with the reservation")
    guarantee_amount: float = Field(gt=0, description="Initial deposit / first payment received")
    payment_type: PAYMENT_TYPE = Field(description="Payment method used")
    notes: str | None = Field(default=None, max_length=2000, description="Notes")
    # Prix de vente et promotion
    sale_price: float | None = Field(
        default=None,
        ge=0,
        description="Prix de vente indiqué sur l'acte de réservation",
    )
    promotion_paid_timing: Literal["debut", "fin"] | None = Field(
        default=None,
        description="Quand la promotion est payée : au début ou à la fin",
    )
    promotion_received: bool = Field(
        default=False,
        description="Le montant de la promotion a déjà été reçu",
    )
    # Échéancier de paiement (optionnel — créé atomiquement avec la transition)
    payment_plan: PaymentPlanData | None = Field(
        default=None,
        description="Plan de paiement à créer lors de l'engagement (optionnel)",
    )


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
    # Réservation engagée — prix de vente et promotion
    sale_price: float | None = None
    promotion_amount: float | None = None
    promotion_paid_timing: str | None = None
    promotion_received: bool = False
    # Réservation soldée — intention notaire
    wants_notaire: bool = False
    created_at: datetime
    updated_at: datetime
