"""Edit an engaged reservation (E4-T5c) with an audit trail.

Editable: agreed total price, deed price, gap timing / date, notes, amounts
and due dates of the ``deposit`` / ``balance`` installments not fully
received. The ``gap`` installment follows the recomputed gap and R3. Not
editable: lot, client, status, payments, first payment.

Everything is checked under row locks before anything is written, then the
edit is saved in one transaction with a ``reservation_changes`` row holding
only the changed fields (before / after). A new deed version is generated
when the deed price changes, and the first deed when the edit makes the
reservation reach the paid threshold (never fails the edit).

Single lock order for every write on an engaged reservation — payments
(Task 6), this edit and the solde transition: reservation (``FOR UPDATE``)
→ lot → installments. The edit locks the lot ``FOR NO KEY UPDATE``: it
blocks a concurrent status change but not the ``FOR KEY SHARE`` a payment
takes on the lot when it inserts a proof document (FK ``lot_documents.lot_id``).
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime, time
from typing import Any

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    AuthorizationError,
    BusinessRuleError,
    ConflictError,
    NotFoundError,
)
from app.core.logging import get_logger
from app.domain.reservation_amounts import (
    ensure_not_legacy,
    format_mad,
    gap_amount,
    gap_installment_amount,
    installment_status,
    to_cents,
    validate_amounts,
)
from app.domain.schemas.engagement_edit import (
    EngagementEdit,
    EngagementEditResponse,
    ReservationChangeResponse,
)
from app.infrastructure.database.models import (
    LotModel,
    PaymentInstallmentModel,
    PaymentScheduleModel,
    UserModel,
    utc_now,
)
from app.infrastructure.database.repositories import (
    PaymentRepository,
    ReservationChangeRepository,
    ReservationPaymentRepository,
    ReservationRepository,
)
from app.infrastructure.database.repositories.reservation_repository import (
    reservation_for_update,
)
from app.services.acte_service import ActeService
from app.services.reservation_payment_service import ReservationPaymentService

logger = get_logger(__name__)

STALE_MESSAGE = "La réservation a été modifiée entre-temps. Rechargez la fiche."


def lot_for_update(lot_id: int) -> Select:
    """The lot, ``FOR NO KEY UPDATE`` (taken after the reservation lock).

    No transition can change the lot's status meanwhile; a payment's
    ``FOR KEY SHARE`` (proof document FK) is not blocked.
    """
    return (
        select(LotModel)
        .where(LotModel.id == lot_id)
        .with_for_update(key_share=True)
        .execution_options(populate_existing=True)
    )


def installments_for_update(reservation_id: int) -> Select:
    """Every installment of the reservation's schedule, row locked."""
    return (
        select(PaymentInstallmentModel)
        .join(
            PaymentScheduleModel,
            PaymentScheduleModel.id == PaymentInstallmentModel.schedule_id,
        )
        .where(PaymentScheduleModel.reservation_id == reservation_id)
        .with_for_update(of=PaymentInstallmentModel)
        .execution_options(populate_existing=True)
    )


def _utc(value: datetime) -> datetime:
    """Aware UTC datetime (SQLite returns naive values, stored as UTC)."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _day_start(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=UTC)


def _money(cents: int | None) -> float | None:
    return None if cents is None else cents / 100


def _cents(amount: float | None) -> int | None:
    return None if amount is None else to_cents(amount)


@dataclass
class _Line:
    """Planned state of one installment (``None`` amount = deleted / absent)."""

    installment: PaymentInstallmentModel | None
    old: tuple[int, date] | None
    new: tuple[int, date] | None

    @property
    def changed(self) -> bool:
        return self.old != self.new


def _entry(installment_id: int, state: tuple[int, date]) -> dict[str, Any]:
    cents, day = state
    return {"id": installment_id, "amount": cents / 100, "due_date": day.isoformat()}


def _below_received(position: int, received_cents: int) -> BusinessRuleError:
    return BusinessRuleError(
        message=(
            f"L'échéance n° {position} a déjà reçu "
            f"{format_mad(received_cents / 100)} MAD."
        ),
        rule="installment_below_received",
    )


class EngagementEditService:
    """Edit an engaged reservation and list its edit history."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.reservation_repo = ReservationRepository(session)
        self.schedule_repo = PaymentRepository(session)
        self.received_repo = ReservationPaymentRepository(session)
        self.change_repo = ReservationChangeRepository(session)
        self.acte_service = ActeService(session)
        self.summary_service = ReservationPaymentService(session)

    async def edit(
        self, reservation_id: int, data: EngagementEdit, user: UserModel
    ) -> EngagementEditResponse:
        """Apply an edit to an engaged reservation (atomic, journaled).

        Raises:
            NotFoundError: Reservation not found.
            AuthorizationError: Neither the reservation's commercial nor a manager.
            BusinessRuleError: Not engaged, legacy (engaged before E4-T5),
                agreed total below what was received, deed price above the
                agreed total, installment list not matching the schedule,
                total not matching, installment below what it already
                received, received installment changed, or nothing to change.
            ConflictError: ``expected_updated_at`` is stale.
        """
        found = await self.reservation_repo.get_by_id(reservation_id)
        if found is None:
            raise NotFoundError("Reservation", reservation_id)
        if user.role != "manager" and found.reserved_by_user_id != user.id:
            raise AuthorizationError(
                message=(
                    "Seuls le commercial auteur de la réservation et les managers "
                    "peuvent modifier la réservation."
                )
            )

        # ── Locks: reservation, lot, installments ────────────────────────
        reservation = (
            await self.session.execute(reservation_for_update(reservation_id))
        ).scalar_one()
        lot = (
            await self.session.execute(lot_for_update(reservation.lot_id))
        ).scalar_one_or_none()
        if (
            lot is None
            or lot.status != "reservation_engagee"
            or lot.current_reservation_id != reservation.id
        ):
            raise BusinessRuleError(
                message="Seule une réservation engagée peut être modifiée.",
                rule="reservation_not_engaged",
            )
        ensure_not_legacy(reservation.agreed_total_price)
        if _utc(reservation.updated_at) != _utc(data.expected_updated_at):
            raise ConflictError(STALE_MESSAGE)
        installments = list(
            (await self.session.execute(installments_for_update(reservation_id)))
            .scalars()
            .all()
        )
        schedule = (
            await self.session.execute(
                select(PaymentScheduleModel).where(
                    PaymentScheduleModel.reservation_id == reservation_id
                )
            )
        ).scalar_one_or_none()

        # ── What was received ────────────────────────────────────────────
        payments = await self.received_repo.list_for_reservation(reservation_id)
        received: dict[int, int] = {}
        last_paid_on: dict[int, date] = {}
        first_cents = total_cents = 0
        for payment in payments:
            total_cents += to_cents(payment.amount)
            if payment.installment_id is None:
                first_cents += to_cents(payment.amount)
            else:
                iid = payment.installment_id
                received[iid] = received.get(iid, 0) + to_cents(payment.amount)
                last_paid_on[iid] = payment.paid_on

        # ── Amounts ──────────────────────────────────────────────────────
        agreed_cents = to_cents(data.agreed_total_price)
        acte_cents = to_cents(data.sale_price)
        agreed, acte, first = agreed_cents / 100, acte_cents / 100, first_cents / 100
        if agreed_cents < total_cents:
            raise BusinessRuleError(
                message=(
                    "Le prix total convenu ne peut pas être inférieur au total "
                    f"déjà encaissé ({format_mad(total_cents / 100)} MAD)."
                ),
                rule="agreed_below_received",
            )
        validate_amounts(agreed, acte, first)

        # ── Installments ─────────────────────────────────────────────────
        ordered = sorted(installments, key=lambda i: (_utc(i.due_date), i.id))
        position = {inst.id: n for n, inst in enumerate(ordered, start=1)}
        non_gap = [i for i in ordered if i.payment_type != "gap"]
        gap_inst = next((i for i in ordered if i.payment_type == "gap"), None)

        def state(inst: PaymentInstallmentModel) -> tuple[int, date]:
            return to_cents(inst.amount), _utc(inst.due_date).date()

        def fully_received(inst: PaymentInstallmentModel) -> bool:
            return installment_status(inst.amount, received.get(inst.id, 0) / 100) == (
                "paid"
            )

        editable = {i.id for i in non_gap if not fully_received(i)}
        body_ids = [line.id for line in data.installments]
        if len(body_ids) != len(set(body_ids)) or set(body_ids) != editable:
            raise BusinessRuleError(
                message="La liste des échéances ne correspond pas à l'échéancier.",
                rule="installments_mismatch",
            )
        new_state = {i.id: state(i) for i in non_gap}
        for line in data.installments:
            new_state[line.id] = (to_cents(line.amount), line.due_date)

        gap_cents = to_cents(
            gap_installment_amount(agreed, first, gap_amount(agreed, acte))
        )
        expected_cents = agreed_cents - first_cents
        actual_cents = sum(cents for cents, _ in new_state.values()) + gap_cents
        if actual_cents != expected_cents:
            raise BusinessRuleError(
                message=(
                    f"Les échéances doivent totaliser "
                    f"{format_mad(expected_cents / 100)} MAD (actuellement "
                    f"{format_mad(actual_cents / 100)} MAD)."
                ),
                rule="installments_total_mismatch",
            )
        for inst in non_gap:
            got = received.get(inst.id, 0)
            if new_state[inst.id][0] < got:
                raise _below_received(position[inst.id], got)

        gap_date = data.gap_due_date if data.gap_due_timing == "date" else None
        gap_line = self._plan_gap(
            gap_inst,
            gap_cents,
            received,
            position,
            timing=data.gap_due_timing,
            gap_date=gap_date,
            timing_changed=(
                data.gap_due_timing != reservation.gap_due_timing
                or gap_date != reservation.gap_due_date
            ),
            non_gap_days={i.id: (i.payment_type, new_state[i.id][1]) for i in non_gap},
            engaged_on=_utc(schedule.created_at).date() if schedule else None,
        )
        lines = [_Line(i, state(i), new_state[i.id]) for i in non_gap] + [gap_line]

        # ── Before / after (changed fields only) ─────────────────────────
        notes = data.notes or None
        before: dict[str, Any] = {}
        after: dict[str, Any] = {}
        for name, old, new in (
            (
                "agreed_total_price",
                _cents(reservation.agreed_total_price),
                agreed_cents,
            ),
            ("sale_price", _cents(reservation.sale_price), acte_cents),
        ):
            if old != new:
                before[name], after[name] = _money(old), _money(new)
        for name, old, new in (
            ("gap_due_timing", reservation.gap_due_timing, data.gap_due_timing),
            (
                "gap_due_date",
                reservation.gap_due_date.isoformat()
                if reservation.gap_due_date
                else None,
                gap_date.isoformat() if gap_date else None,
            ),
            ("notes", reservation.notes, notes),
        ):
            if old != new:
                before[name], after[name] = old, new
        changed_lines = [line for line in lines if line.changed]
        if not before and not changed_lines:
            raise BusinessRuleError(
                message="Aucune modification à enregistrer.", rule="no_change"
            )

        old_acte_cents = to_cents(
            reservation.sale_price or reservation.agreed_total_price or lot.price or 0.0
        )
        was_available = (
            await self.acte_service.acte_readiness(reservation_id)
        ).available

        # ── Writes ───────────────────────────────────────────────────────
        now = utc_now()
        reservation.agreed_total_price = agreed
        reservation.sale_price = acte
        reservation.gap_due_timing = data.gap_due_timing
        reservation.gap_due_date = gap_date
        reservation.notes = notes
        # Bumped on every edit, even when only installments change.
        reservation.updated_at = now

        if schedule is None:
            schedule = await self.schedule_repo.create(
                reservation_id=reservation_id,
                lot_price=expected_cents / 100,
                deposit_pct=0.0,
                balance_pct=100.0,
                deposit_total=0.0,
                balance_total=0.0,
            )
        for line in changed_lines:
            await self._apply_line(line, schedule.id, received, last_paid_on)

        totals = {"deposit": 0, "balance": 0}
        for inst in non_gap:
            totals[inst.payment_type] += new_state[inst.id][0]
        schedule.lot_price = expected_cents / 100
        schedule.deposit_total = totals["deposit"] / 100
        schedule.balance_total = totals["balance"] / 100
        await self.session.flush()

        if changed_lines:
            before["installments"] = [
                _entry(line.installment.id, line.old)  # type: ignore[union-attr]
                for line in changed_lines
                if line.old is not None
            ]
            after["installments"] = [
                _entry(line.installment.id, line.new)  # type: ignore[union-attr]
                for line in changed_lines
                if line.new is not None
            ]
        change = await self.change_repo.create(
            reservation_id=reservation_id,
            user_id=user.id,
            changed_at=now,
            reason=data.reason,
            before=before,
            after=after,
        )
        logger.info(
            "Engaged reservation edited",
            reservation_id=reservation_id,
            change_id=change.id,
            fields=sorted(after),
        )

        # Deed (generate_and_store re-checks the threshold and never raises):
        # a new version when the printed price changes (R4 unchanged), or the
        # first deed when the edit makes the reservation reach the threshold
        # (e.g. a lower agreed total) and none was archived yet.
        acte_status = None
        if acte_cents != old_acte_cents or (
            not was_available
            and (await self.acte_service.acte_readiness(reservation_id)).available
            and await self.acte_service.latest_acte(reservation_id) is None
        ):
            acte_status = (
                await self.acte_service.generate_and_store(reservation_id, user.id)
            ).status

        await self.session.commit()
        # Reload the written rows so the summary shows the stored values
        # (``updated_at`` round-trips exactly for the next edit) and the
        # schedule's cached installment collection drops / gains the gap.
        await self.session.refresh(reservation)
        for line in changed_lines:
            if line.new is not None:
                await self.session.refresh(line.installment)
        await self.session.refresh(schedule, attribute_names=["installments"])

        summary = await self.summary_service.financial_summary(reservation_id)
        return EngagementEditResponse(**summary.model_dump(), acte_status=acte_status)

    def _plan_gap(
        self,
        gap_inst: PaymentInstallmentModel | None,
        gap_cents: int,
        received: dict[int, int],
        position: dict[int, int],
        *,
        timing: str,
        gap_date: date | None,
        timing_changed: bool,
        non_gap_days: dict[int, tuple[str, date]],
        engaged_on: date | None,
    ) -> _Line:
        """Planned ``gap`` installment: amount from the gap, due date from R3.

        A fully received gap installment keeps its amount and date, so its
        timing / date cannot change either (the reservation and the
        installment would disagree); a gap installment cannot go below what
        it received (a gap of 0 deletes it only when nothing was received on
        it).
        """
        old = (
            (to_cents(gap_inst.amount), _utc(gap_inst.due_date).date())
            if gap_inst
            else None
        )
        if gap_inst is not None:
            got = received.get(gap_inst.id, 0)
            if gap_cents < got:
                raise _below_received(position[gap_inst.id], got)
            if got > 0 and got >= to_cents(gap_inst.amount):
                if gap_cents != to_cents(gap_inst.amount):
                    raise BusinessRuleError(
                        message=(
                            f"L'échéance n° {position[gap_inst.id]} est déjà "
                            "reçue : son montant ne peut plus changer."
                        ),
                        rule="installment_already_received",
                    )
                if timing_changed:
                    raise BusinessRuleError(
                        message=(
                            "L'écart est déjà entièrement reçu : sa date ne "
                            "peut plus changer."
                        ),
                        rule="gap_already_received",
                    )
                return _Line(gap_inst, old, old)
        if gap_cents <= 0:
            return _Line(gap_inst, old, None)

        today = datetime.now(UTC).date()
        if timing == "debut":
            day = engaged_on or today
        elif timing == "date" and gap_date is not None:
            day = gap_date
        else:
            balances = [d for t, d in non_gap_days.values() if t == "balance"]
            others = [d for _, d in non_gap_days.values()]
            day = max(balances or others or [engaged_on or today])
        return _Line(gap_inst, old, (gap_cents, day))

    async def _apply_line(
        self,
        line: _Line,
        schedule_id: int,
        received: dict[int, int],
        last_paid_on: dict[int, date],
    ) -> None:
        """Write one changed installment (update, delete or create the gap)."""
        inst = line.installment
        if line.new is None:
            # Gap of 0, nothing received on it (checked before).
            await self.session.delete(inst)
            return
        cents, day = line.new
        if inst is None:
            line.installment = await self.schedule_repo.create_installment(
                schedule_id=schedule_id,
                payment_type="gap",
                installment_number=1,
                amount=cents / 100,
                due_date=_day_start(day),
            )
            return
        inst.amount = cents / 100
        if line.old is None or line.old[1] != day:
            inst.due_date = _day_start(day)
        got = received.get(inst.id, 0)
        inst.status = installment_status(inst.amount, got / 100)
        if inst.status == "paid" and inst.paid_date is None:
            inst.paid_date = _day_start(last_paid_on[inst.id])

    async def list_changes(
        self, reservation_id: int
    ) -> list[ReservationChangeResponse]:
        """Edit history of a reservation, newest first.

        Raises:
            NotFoundError: Reservation not found.
        """
        if await self.reservation_repo.get_by_id(reservation_id) is None:
            raise NotFoundError("Reservation", reservation_id)
        rows = await self.change_repo.list_with_author(reservation_id)
        return [
            ReservationChangeResponse(
                id=change.id,
                user_id=change.user_id,
                user_name=name,
                changed_at=change.changed_at,
                reason=change.reason,
                before=change.before,
                after=change.after,
            )
            for change, name in rows
        ]
