"""Reservation payments repository (encaissements, never updated nor deleted)."""

from sqlalchemy import Select, or_, select

from app.domain.reservation_amounts import to_cents
from app.infrastructure.database.models import (
    PaymentInstallmentModel,
    PaymentScheduleModel,
    ReservationPaymentModel,
    UserModel,
)
from app.infrastructure.database.repositories.base import BaseRepository


def _sum(amounts: list[float]) -> float:
    """Exact sum to the cent (R5)."""
    return sum(to_cents(a) for a in amounts) / 100


def installment_for_update(installment_id: int) -> Select:
    """The installment and its reservation id, row locked (``FOR UPDATE``).

    Taken before checking an installment's remaining amount so that two
    payments on the same installment cannot both pass the check (PostgreSQL;
    SQLite ignores the lock and serialises writes anyway).
    """
    return (
        select(PaymentInstallmentModel, PaymentScheduleModel.reservation_id)
        .join(
            PaymentScheduleModel,
            PaymentScheduleModel.id == PaymentInstallmentModel.schedule_id,
        )
        .where(PaymentInstallmentModel.id == installment_id)
        .with_for_update(of=PaymentInstallmentModel)
        .execution_options(populate_existing=True)
    )


class ReservationPaymentRepository(BaseRepository[ReservationPaymentModel]):
    """Data access for ``reservation_payments``.

    Only ``create`` and reads are meant to be used: a payment is never
    updated nor deleted by the application.
    """

    model = ReservationPaymentModel

    def _filtered(self, query: Select, installment_types: set[str] | None) -> Select:
        """Keep the payments without installment + those of ``installment_types``."""
        if installment_types is None:
            return query
        return query.outerjoin(
            PaymentInstallmentModel,
            ReservationPaymentModel.installment_id == PaymentInstallmentModel.id,
        ).where(
            or_(
                ReservationPaymentModel.installment_id.is_(None),
                PaymentInstallmentModel.payment_type.in_(installment_types),
            )
        )

    async def list_for_reservation(
        self, reservation_id: int, *, installment_types: set[str] | None = None
    ) -> list[ReservationPaymentModel]:
        """Payments of a reservation, oldest first (``paid_on``, ``id``).

        ``installment_types`` filters as in :meth:`total_for_reservation`
        (``set()`` keeps only the payments without installment).
        """
        query = self._filtered(
            select(ReservationPaymentModel).where(
                ReservationPaymentModel.reservation_id == reservation_id
            ),
            installment_types,
        ).order_by(ReservationPaymentModel.paid_on, ReservationPaymentModel.id)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def list_with_recorder(
        self, reservation_id: int
    ) -> list[tuple[ReservationPaymentModel, str | None]]:
        """Payments (``paid_on``, ``id`` order) with the recording user's name."""
        result = await self.session.execute(
            select(ReservationPaymentModel, UserModel.name)
            .outerjoin(
                UserModel, UserModel.id == ReservationPaymentModel.recorded_by_user_id
            )
            .where(ReservationPaymentModel.reservation_id == reservation_id)
            .order_by(ReservationPaymentModel.paid_on, ReservationPaymentModel.id)
        )
        return [(payment, name) for payment, name in result.all()]

    async def total_for_reservation(
        self, reservation_id: int, *, installment_types: set[str] | None = None
    ) -> float:
        """Total received for a reservation.

        ``installment_types`` restricts the payments allocated to an
        installment to those types (e.g. ``{"deposit", "balance"}``); the
        payments received at engagement (no installment) are always counted.
        """
        query = self._filtered(
            select(ReservationPaymentModel.amount).where(
                ReservationPaymentModel.reservation_id == reservation_id
            ),
            installment_types,
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
        totals = await self.totals_by_installment([installment_id])
        return totals.get(installment_id, 0.0)

    async def totals_by_installment(
        self, installment_ids: list[int]
    ) -> dict[int, float]:
        """Total received per installment (installments without payment omitted)."""
        if not installment_ids:
            return {}
        result = await self.session.execute(
            select(
                ReservationPaymentModel.installment_id, ReservationPaymentModel.amount
            ).where(ReservationPaymentModel.installment_id.in_(installment_ids))
        )
        cents: dict[int, int] = {}
        for installment_id, amount in result.all():
            cents[installment_id] = cents.get(installment_id, 0) + to_cents(amount)
        return {iid: total / 100 for iid, total in cents.items()}
