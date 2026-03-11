"""Payment service — schedule creation and installment management."""

import calendar
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleError, NotFoundError
from app.core.logging import get_logger
from app.domain.schemas.payment import (
    InstallmentConfig,
    PaymentInstallmentResponse,
    PaymentInstallmentUpdate,
    PaymentScheduleCreate,
    PaymentScheduleResponse,
)
from app.infrastructure.database.models import (
    PaymentInstallmentModel,
    PaymentScheduleModel,
)
from app.infrastructure.database.repositories import PaymentRepository, ReservationRepository
from app.services.email_service import EmailService

logger = get_logger(__name__)

_email_service = EmailService()


def _add_months(dt: datetime, months: int) -> datetime:
    """Add a number of months to a datetime, handling month-end edge cases."""
    total_months = dt.month - 1 + months
    year = dt.year + total_months // 12
    month = total_months % 12 + 1
    day = min(dt.day, calendar.monthrange(year, month)[1])
    return dt.replace(year=year, month=month, day=day)


def _generate_due_dates(
    start: datetime,
    config: InstallmentConfig,
) -> list[datetime]:
    """Generate a list of due dates starting at `start` with the given periodicity."""
    return [
        _add_months(start, i * config.periodicity_months)
        for i in range(config.count)
    ]


def _split_amount(total: float, count: int) -> list[float]:
    """Split a total into `count` installments, spreading rounding remainder on last."""
    if count <= 0:
        return []
    base = round(total / count, 2)
    amounts = [base] * count
    amounts[-1] = round(total - base * (count - 1), 2)
    return amounts


class PaymentService:
    """Service for payment schedule and installment operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Initialize with database session."""
        self.session = session
        self.payment_repo = PaymentRepository(session)
        self.reservation_repo = ReservationRepository(session)

    # ── Private helpers ──────────────────────────────────────────────────

    def _installment_to_response(
        self,
        inst: PaymentInstallmentModel,
    ) -> PaymentInstallmentResponse:
        return PaymentInstallmentResponse(
            id=inst.id,
            schedule_id=inst.schedule_id,
            payment_type=inst.payment_type,
            installment_number=inst.installment_number,
            amount=inst.amount,
            due_date=inst.due_date,
            status=inst.status,
            paid_date=inst.paid_date,
            notes=inst.notes,
            created_at=inst.created_at,
            updated_at=inst.updated_at,
        )

    def _schedule_to_response(
        self,
        schedule: PaymentScheduleModel,
    ) -> PaymentScheduleResponse:
        return PaymentScheduleResponse(
            id=schedule.id,
            reservation_id=schedule.reservation_id,
            lot_price=schedule.lot_price,
            deposit_pct=schedule.deposit_pct,
            balance_pct=schedule.balance_pct,
            deposit_total=schedule.deposit_total,
            balance_total=schedule.balance_total,
            balance_delay_months=schedule.balance_delay_months,
            installments=[
                self._installment_to_response(i) for i in schedule.installments
            ],
            created_at=schedule.created_at,
            updated_at=schedule.updated_at,
        )

    # ── Public methods ───────────────────────────────────────────────────

    async def create_schedule(
        self,
        data: PaymentScheduleCreate,
    ) -> PaymentScheduleResponse:
        """Create a payment schedule with generated installments for a reservation.

        Balance installments always start after the last deposit installment,
        with an optional additional delay of `balance_delay_months`.

        Args:
            data: Schedule creation data including tranche config

        Returns:
            Created schedule with all installments

        Raises:
            NotFoundError: If reservation not found
            BusinessRuleError: If schedule already exists
        """
        reservation = await self.reservation_repo.get_by_id(data.reservation_id)
        if not reservation:
            raise NotFoundError("Reservation", data.reservation_id)

        existing = await self.payment_repo.get_by_reservation(data.reservation_id)
        if existing:
            raise BusinessRuleError(
                message="A payment schedule already exists for this reservation",
                rule="schedule_already_exists",
            )

        balance_pct = round(100.0 - data.deposit_pct, 4)
        deposit_total = round(data.lot_price * data.deposit_pct / 100, 2)
        balance_total = round(data.lot_price - deposit_total, 2)

        schedule = await self.payment_repo.create(
            reservation_id=data.reservation_id,
            lot_price=data.lot_price,
            deposit_pct=data.deposit_pct,
            balance_pct=balance_pct,
            deposit_total=deposit_total,
            balance_total=balance_total,
            balance_delay_months=data.balance_delay_months,
        )

        now = datetime.now(timezone.utc)

        # ── Deposit installments ────────────────────────────────────────
        deposit_start = data.deposit_start_date or now
        deposit_dates = _generate_due_dates(deposit_start, data.deposit_installments)
        deposit_amounts = _split_amount(deposit_total, data.deposit_installments.count)

        for i, (due, amount) in enumerate(zip(deposit_dates, deposit_amounts, strict=True)):
            await self.payment_repo.create_installment(
                schedule_id=schedule.id,
                payment_type="deposit",
                installment_number=i + 1,
                amount=amount,
                due_date=due,
            )

        # ── Balance installments ────────────────────────────────────────
        # Balance must start AFTER the last deposit installment + optional delay.
        last_deposit_date = deposit_dates[-1]
        balance_start = _add_months(last_deposit_date, data.balance_delay_months)

        balance_dates = _generate_due_dates(balance_start, data.balance_installments)
        balance_amounts = _split_amount(balance_total, data.balance_installments.count)

        for i, (due, amount) in enumerate(zip(balance_dates, balance_amounts, strict=True)):
            await self.payment_repo.create_installment(
                schedule_id=schedule.id,
                payment_type="balance",
                installment_number=i + 1,
                amount=amount,
                due_date=due,
            )

        # Reload with installments eager-loaded
        full_schedule = await self.payment_repo.get_by_reservation(data.reservation_id)

        logger.info(
            "Payment schedule created",
            schedule_id=schedule.id,
            reservation_id=data.reservation_id,
            deposit_pct=data.deposit_pct,
            deposit_installments=data.deposit_installments.count,
            balance_installments=data.balance_installments.count,
            balance_delay_months=data.balance_delay_months,
            balance_start=balance_start.isoformat(),
        )

        return self._schedule_to_response(full_schedule)  # type: ignore[arg-type]

    async def get_schedule_for_reservation(
        self,
        reservation_id: int,
    ) -> PaymentScheduleResponse:
        """Get payment schedule for a reservation."""
        schedule = await self.payment_repo.get_by_reservation(reservation_id)
        if not schedule:
            raise NotFoundError("PaymentSchedule for reservation", reservation_id)
        return self._schedule_to_response(schedule)

    async def get_client_payment_overview(
        self,
        client_id: int,
    ) -> list[PaymentScheduleResponse]:
        """Get all payment schedules for a client."""
        schedules = await self.payment_repo.get_all_by_client(client_id)
        return [self._schedule_to_response(s) for s in schedules]

    async def update_installment(
        self,
        installment_id: int,
        data: PaymentInstallmentUpdate,
    ) -> PaymentInstallmentResponse:
        """Update an installment status (mark paid / pending)."""
        if data.status not in ("pending", "paid"):
            raise BusinessRuleError(
                message=f"Invalid installment status: {data.status}",
                rule="invalid_installment_status",
            )

        inst = await self.payment_repo.update_installment(
            installment_id=installment_id,
            status=data.status,
            paid_date=data.paid_date,
            notes=data.notes,
        )
        if not inst:
            raise NotFoundError("PaymentInstallment", installment_id)

        logger.info(
            "Installment updated",
            installment_id=installment_id,
            status=data.status,
        )

        # When first deposit installment is confirmed → validate the reservation
        if (
            data.status == "paid"
            and inst.payment_type == "deposit"
            and inst.installment_number == 1
        ):
            await self._validate_reservation_for_installment(inst.id)
            await self._send_deposit_confirmation(inst.id, inst.amount, inst.paid_date)

        return self._installment_to_response(inst)

    async def _validate_reservation_for_installment(self, installment_id: int) -> None:
        """Set the reservation status to 'validated' after first deposit is confirmed."""
        ctx = await self.payment_repo.get_installment_with_context(installment_id)
        if not ctx:
            return
        reservation = ctx.schedule.reservation
        if reservation.status in ("active", "validated"):
            await self.reservation_repo.update(reservation.id, status="validated")
            logger.info(
                "Reservation validated after first deposit",
                reservation_id=reservation.id,
            )

    async def _send_deposit_confirmation(
        self,
        installment_id: int,
        amount: float,
        paid_date: object,
    ) -> None:
        """Load full context and send deposit confirmation email."""
        from datetime import datetime

        ctx = await self.payment_repo.get_installment_with_context(installment_id)
        if not ctx:
            return

        reservation = ctx.schedule.reservation
        client = reservation.client
        lot = reservation.lot
        project = reservation.project

        if not client.email:
            logger.info(
                "Deposit confirmation skipped — client has no email",
                client_id=client.id,
                lot_numero=lot.numero,
            )
            return

        await _email_service.send_deposit_payment_confirmation(
            client_name=client.name,
            client_email=client.email,
            amount=amount,
            paid_date=paid_date if isinstance(paid_date, datetime) else None,
            lot_numero=lot.numero,
            project_name=project.name,
            installment_number=1,
            total_deposit=ctx.schedule.deposit_total,
        )
