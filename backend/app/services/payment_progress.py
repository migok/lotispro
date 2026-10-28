"""Payment progress of reservations, for the lot lists (dashboard, GeoJSON).

Computed from the money actually received (``reservation_payments``), never
from the installment statuses: a partial payment counts, the first payment
received at engagement counts, and so does the gap installment.

- ``deposit_paid_pct``: deposit phase = first payment + ``deposit``
  installments (+ the ``gap`` installment when it is due at the start, as in
  rule R2);
- ``balance_paid_pct``: balance phase = ``balance`` installments (+ the
  ``gap`` installment otherwise);
- ``first_deposit_days``: days until the earliest ``deposit`` installment not
  fully received (``None`` when there is none).
"""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.domain.reservation_amounts import installment_status, to_cents
from app.infrastructure.database.models import (
    PaymentInstallmentModel,
    PaymentScheduleModel,
    ReservationModel,
)
from app.infrastructure.database.repositories.reservation_payment_repository import (
    ReservationPaymentRepository,
)


def _pct(received_cents: int, due_cents: int) -> int:
    return round(received_cents * 100 / due_cents) if due_cents > 0 else 0


def _in_deposit_phase(inst: PaymentInstallmentModel, gap_at_start: bool) -> bool:
    return inst.payment_type == "deposit" or (
        inst.payment_type == "gap" and gap_at_start
    )


async def payment_progress(
    session: AsyncSession, reservation_ids: list[int], now: datetime
) -> dict[int, dict]:
    """``{reservation_id: {deposit_paid_pct, balance_paid_pct, first_deposit_days}}``.

    Only reservations with a payment schedule are returned.
    """
    if not reservation_ids:
        return {}
    schedules = (
        (
            await session.execute(
                select(PaymentScheduleModel)
                .where(PaymentScheduleModel.reservation_id.in_(reservation_ids))
                .options(selectinload(PaymentScheduleModel.installments))
            )
        )
        .scalars()
        .all()
    )
    timings = dict(
        (
            await session.execute(
                select(ReservationModel.id, ReservationModel.gap_due_timing).where(
                    ReservationModel.id.in_(reservation_ids)
                )
            )
        ).all()
    )
    payments = ReservationPaymentRepository(session)
    first_payments = await payments.first_payment_totals(reservation_ids)
    received = await payments.totals_by_installment(
        [i.id for s in schedules for i in s.installments]
    )

    progress: dict[int, dict] = {}
    for schedule in schedules:
        rid = schedule.reservation_id
        gap_at_start = timings.get(rid) == "debut"
        first = to_cents(first_payments.get(rid, 0.0))
        deposit_due = deposit_got = first
        balance_due = balance_got = 0
        still_due: list[PaymentInstallmentModel] = []
        for inst in schedule.installments:
            got = received.get(inst.id, 0.0)
            if _in_deposit_phase(inst, gap_at_start):
                deposit_due += to_cents(inst.amount)
                deposit_got += to_cents(got)
            else:
                balance_due += to_cents(inst.amount)
                balance_got += to_cents(got)
            if (
                inst.payment_type == "deposit"
                and installment_status(inst.amount, got) != "paid"
            ):
                still_due.append(inst)

        first_deposit_days = None
        if still_due:
            due = min(still_due, key=lambda i: i.due_date).due_date
            if due.tzinfo is None:
                due = due.replace(tzinfo=UTC)
            first_deposit_days = (due - now).days

        progress[rid] = {
            "deposit_paid_pct": _pct(deposit_got, deposit_due),
            "balance_paid_pct": _pct(balance_got, balance_due),
            "first_deposit_days": first_deposit_days,
        }
    return progress
