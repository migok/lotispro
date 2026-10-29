"""Payments received for a reservation (encaissements) and financial summary."""

import math
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, field_validator

from app.core.config import settings
from app.domain.schemas.common import BaseSchema
from app.domain.schemas.reservation import PAYMENT_TYPE

InstallmentType = Literal["deposit", "balance", "gap"]
InstallmentStatus = Literal["pending", "partial", "paid"]

FUTURE_DATE_MESSAGE = "La date d'encaissement ne peut pas être dans le futur."
INVALID_AMOUNT_MESSAGE = "Montant invalide."
NON_POSITIVE_AMOUNT_MESSAGE = "Le montant doit être supérieur à 0."
TOO_PRECISE_AMOUNT_MESSAGE = "Le montant ne peut pas avoir plus de 2 décimales."


def business_today() -> date:
    """Today in the business time zone (``REMINDER_TIMEZONE``, Morocco).

    Falls back to UTC when the time zone database is missing.
    """
    try:
        return datetime.now(ZoneInfo(settings.REMINDER_TIMEZONE)).date()
    except ZoneInfoNotFoundError:
        return datetime.now(UTC).date()


class ReservationPaymentForm(BaseSchema):
    """Multipart fields of ``POST /reservations/{id}/payments`` (file aside).

    ``amount`` is a decimal string (``150000``, ``150000.50``, ``150 000,50``);
    ``paid_on`` must not be after :func:`business_today`.
    """

    amount: str = Field(description="Montant encaissé (décimal, > 0)")
    paid_on: date = Field(description="Date d'encaissement (pas dans le futur)")
    method: PAYMENT_TYPE = Field(description="Mode : cash, card, check, transfer")
    reference: str | None = Field(default=None, max_length=255)
    installment_id: int | None = Field(
        default=None, description="Échéance à laquelle l'encaissement est affecté"
    )

    @field_validator("amount")
    @classmethod
    def _amount_is_positive_decimal(cls, value: str) -> str:
        text = value.replace(" ", "").replace(" ", "").replace(",", ".")
        try:
            number = Decimal(text)
        except InvalidOperation as exc:
            raise ValueError(INVALID_AMOUNT_MESSAGE) from exc
        if not number.is_finite() or not math.isfinite(float(number)):
            raise ValueError(INVALID_AMOUNT_MESSAGE)
        if number <= 0:
            raise ValueError(NON_POSITIVE_AMOUNT_MESSAGE)
        if number != number.quantize(Decimal("0.01")):
            raise ValueError(TOO_PRECISE_AMOUNT_MESSAGE)
        return text

    @field_validator("paid_on")
    @classmethod
    def _paid_on_not_in_future(cls, value: date) -> date:
        if value > business_today():
            raise ValueError(FUTURE_DATE_MESSAGE)
        return value

    @property
    def amount_value(self) -> float:
        """``amount`` as a float (validated > 0)."""
        return float(Decimal(self.amount))


class ReservationPaymentResponse(BaseSchema):
    """One payment received (never updated nor deleted)."""

    id: int
    amount: float
    paid_on: date
    method: str
    reference: str | None
    installment_id: int | None = Field(
        description="Échéance concernée ; null = premier acompte reçu à l'engagement"
    )
    document_id: int | None = Field(description="Justificatif (facultatif)")
    recorded_by_user_id: int | None
    recorded_by_name: str | None
    created_at: datetime


class InstallmentSummary(BaseSchema):
    """An installment with what was received for it (status computed)."""

    id: int
    payment_type: InstallmentType
    installment_number: int
    amount: float
    due_date: datetime
    received: float
    remaining: float
    status: InstallmentStatus


class FinancialSummaryResponse(BaseSchema):
    """Amounts of a reservation (spec E4-T5 definitions).

    ``legacy``: engaged before E4-T5 (no prix total convenu). The amounts of
    the new model are then ``null`` (never invented from the catalogue price);
    the installments are returned as stored.
    """

    legacy: bool = Field(
        description="Réservation engagée avant la nouvelle gestion des montants"
    )
    catalogue_price: float | None = Field(description="Prix catalogue (lots.price)")
    agreed_total_price: float | None = Field(description="Prix total convenu")
    acte_price: float | None = Field(description="Prix figurant sur l'acte")
    gap_amount: float | None = Field(description="Écart à régulariser = convenu − acte")
    gap_due_timing: str | None
    gap_due_date: date | None
    first_payment: float | None = Field(description="Premier acompte reçu")
    total_received: float | None
    remaining: float | None = Field(description="Reste à payer = convenu − encaissé")
    acte_min_paid_pct: float
    acte_threshold_amount: float | None
    acte_available: bool
    installments: list[InstallmentSummary]
    updated_at: datetime
