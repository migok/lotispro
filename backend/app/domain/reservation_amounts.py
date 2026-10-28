"""Amounts of an engaged reservation (E4-T5) — pure rules, no ORM.

Vocabulary (spec E4-T5):
- prix total convenu (``agreed``): what the client pays in total;
- prix figurant sur l'acte (``acte``): printed on the deed, ≤ agreed;
- écart à régulariser (``gap``) = agreed − acte, scheduled as a ``gap``
  installment;
- premier acompte (``first_payment``): received at engagement;
- reste à payer = agreed − everything received.

Amounts are compared and combined in cents (R5): never compare floats.
"""

from typing import Literal

from app.core.exceptions import BusinessRuleError

GapTiming = Literal["debut", "fin", "date"]
InstallmentStatus = Literal["pending", "partial", "paid"]


def to_cents(x: float) -> int:
    """Amount in cents (``round(x * 100)``)."""
    return round(x * 100)


def _amount(cents: int) -> float:
    return cents / 100


def gap_amount(agreed: float, acte: float) -> float:
    """Écart à régulariser = agreed − acte (never negative)."""
    return _amount(max(0, to_cents(agreed) - to_cents(acte)))


def split_schedule(
    agreed: float,
    first_payment: float,
    gap: float,
    deposit_pct: float | None,
    gap_timing: str,
) -> tuple[float, float]:
    """Deposit and balance totals of the schedule, gap excluded (R1, R2).

    ``N = agreed − first payment − gap``; the deposit part is what remains of
    ``agreed × deposit_pct %`` once the first payment (and the gap when it is
    due at the start) are counted, capped by ``N``; the balance takes the
    rest. ``deposit_pct=None`` (no payment plan): everything is balance.
    """
    left = max(0, to_cents(agreed) - to_cents(first_payment) - to_cents(gap))
    if deposit_pct is None:
        return 0.0, _amount(left)
    gap_at_start = to_cents(gap) if gap_timing == "debut" else 0
    target = round(to_cents(agreed) * deposit_pct / 100)
    deposit = min(left, max(0, target - to_cents(first_payment) - gap_at_start))
    return _amount(deposit), _amount(left - deposit)


def gap_installment_amount(agreed: float, first_payment: float, gap: float) -> float:
    """Amount of the ``gap`` installment.

    The whole gap, unless the first payment already exceeds the deed price:
    the schedule then only holds what is left to pay (agreed − first payment).
    """
    left = max(0, to_cents(agreed) - to_cents(first_payment))
    return _amount(min(to_cents(gap), left))


def installment_status(amount: float, received: float) -> InstallmentStatus:
    """Status of an installment from what was received for it."""
    received_cents = to_cents(received)
    if received_cents <= 0:
        return "pending"
    if received_cents >= to_cents(amount):
        return "paid"
    return "partial"


def remaining(agreed: float, total_received: float) -> float:
    """Reste à payer = agreed − total received (never negative)."""
    return _amount(max(0, to_cents(agreed) - to_cents(total_received)))


def validate_amounts(agreed: float, acte: float, first_payment: float) -> None:
    """Refuse a deed price or a first payment above the agreed total price.

    Raises:
        BusinessRuleError: ``acte_price_above_agreed`` or
            ``first_payment_above_agreed``.
    """
    if to_cents(acte) > to_cents(agreed):
        raise BusinessRuleError(
            message=(
                "Le prix figurant sur l'acte ne peut pas dépasser "
                "le prix total convenu."
            ),
            rule="acte_price_above_agreed",
        )
    if to_cents(first_payment) > to_cents(agreed):
        raise BusinessRuleError(
            message=(
                "Le premier acompte reçu ne peut pas dépasser le prix total convenu."
            ),
            rule="first_payment_above_agreed",
        )


def format_mad(amount: float) -> str:
    """French amount for messages: ``400 000``, ``50 000,50`` (no currency)."""
    cents = to_cents(amount)
    units, rest = divmod(abs(cents), 100)
    text = f"{units:,}".replace(",", " ")
    if rest:
        text = f"{text},{rest:02d}"
    return f"-{text}" if cents < 0 else text
