"""Reservation payments repository (encaissements, never updated nor deleted)."""

from sqlalchemy import or_, select

from app.domain.reservation_amounts import to_cents
from app.infrastructure.database.models import (
    PaymentInstallmentModel,
    ReservationPaymentModel,
)
from app.infrastructure.database.repositories.base import BaseRepository


def _sum(amounts: list[float]) -> float:
    """Exact sum to the cent (R5)."""
    return sum(to_cents(a) for a in amounts) / 100


class ReservationPaymentRepository(BaseRepository[ReservationPaymentModel]):
    """Data access for ``reservation_payments``.

    Only ``create`` and reads are meant to be used: a payment is never
    updated nor deleted by the application.
    """

    model = ReservationPaymentModel

    async def list_for_reservation(
        self, reservation_id: int
    ) -> list[ReservationPaymentModel]:
        """Payments of a reservation, oldest first (``paid_on``, ``id``)."""
        result = await self.session.execute(
            select(ReservationPaymentModel)
            .where(ReservationPaymentModel.reservation_id == reservation_id)
            .order_by(ReservationPaymentModel.paid_on, ReservationPaymentModel.id)
        )
        return list(result.scalars().all())

    async def total_for_reservation(
        self, reservation_id: int, *, installment_types: set[str] | None = None
    ) -> float:
        """Total received for a reservation.

        ``installment_types`` restricts the payments allocated to an
        installment to those types (e.g. ``{"deposit", "balance"}``); the
        payments received at engagement (no installment) are always counted.
        """
        query = select(ReservationPaymentModel.amount).where(
            ReservationPaymentModel.reservation_id == reservation_id
        )
        if installment_types is not None:
            query = query.outerjoin(
                PaymentInstallmentModel,
                ReservationPaymentModel.installment_id == PaymentInstallmentModel.id,
            ).where(
                or_(
                    ReservationPaymentModel.installment_id.is_(None),
                    PaymentInstallmentModel.payment_type.in_(installment_types),
                )
            )
        result = await self.session.execute(query)
        return _sum(list(result.scalars().all()))

    async def first_payment_total(self, reservation_id: int) -> float:
        """« Premier acompte reçu »: sum of the payments without installment.

        Single source of truth (spec E4-T5): 0 when the guarantee was
        refunded; includes the option deposit kept at engagement.
        """
        totals = await self.first_payment_totals([reservation_id])
        return totals.get(reservation_id, 0.0)

    async def first_payment_totals(
        self, reservation_ids: list[int]
    ) -> dict[int, float]:
        """:meth:`first_payment_total` of several reservations in one query."""
        if not reservation_ids:
            return {}
        result = await self.session.execute(
            select(
                ReservationPaymentModel.reservation_id, ReservationPaymentModel.amount
            ).where(
                ReservationPaymentModel.reservation_id.in_(reservation_ids),
                ReservationPaymentModel.installment_id.is_(None),
            )
        )
        cents: dict[int, int] = {}
        for reservation_id, amount in result.all():
            cents[reservation_id] = cents.get(reservation_id, 0) + to_cents(amount)
        return {rid: total / 100 for rid, total in cents.items()}

    async def total_for_installment(self, installment_id: int) -> float:
        """Total received for one installment."""
        result = await self.session.execute(
            select(ReservationPaymentModel.amount).where(
                ReservationPaymentModel.installment_id == installment_id
            )
        )
        return _sum(list(result.scalars().all()))
