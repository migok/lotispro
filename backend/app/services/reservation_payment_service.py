"""Payments received per installment (encaissements) and financial summary.

A payment is recorded against one installment of an engaged reservation and
is never updated nor deleted. The installment's status is computed from its
payments (``pending | partial | paid``) and persisted after each payment.
Recording the payment that makes the reservation reach the deed threshold
archives the deed (once).
"""

from datetime import UTC, datetime, time

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthorizationError, BusinessRuleError, NotFoundError
from app.core.logging import get_logger
from app.domain.reservation_amounts import (
    format_mad,
    gap_amount,
    installment_status,
    remaining,
    to_cents,
)
from app.domain.schemas.reservation_payment import (
    FinancialSummaryResponse,
    InstallmentSummary,
    ReservationPaymentForm,
    ReservationPaymentResponse,
)
from app.infrastructure.database.models import (
    PaymentInstallmentModel,
    ReservationModel,
    ReservationPaymentModel,
    UserModel,
)
from app.infrastructure.database.repositories import (
    LotRepository,
    PaymentRepository,
    ReservationPaymentRepository,
    ReservationRepository,
)
from app.infrastructure.database.repositories.reservation_payment_repository import (
    installment_for_update,
)
from app.services.acte_service import ActeService, acte_price, agreed_total
from app.services.document_service import DocumentService, read_upload
from app.services.payment_service import (
    DEPOSIT_BEFORE_BALANCE,
    PREVIOUS_BALANCE_UNPAID,
    PREVIOUS_DEPOSIT_UNPAID,
    PaymentService,
)

logger = get_logger(__name__)

PROOF_CATEGORY = "justificatif_paiement"
_ORDER_RULE = "installment_order_violation"


def _payment_response(
    payment: ReservationPaymentModel, recorded_by_name: str | None
) -> ReservationPaymentResponse:
    return ReservationPaymentResponse(
        id=payment.id,
        amount=payment.amount,
        paid_on=payment.paid_on,
        method=payment.method,
        reference=payment.reference,
        installment_id=payment.installment_id,
        document_id=payment.document_id,
        recorded_by_user_id=payment.recorded_by_user_id,
        recorded_by_name=recorded_by_name,
        created_at=payment.created_at,
    )


def _is_paid(installment: PaymentInstallmentModel, received: dict[int, float]) -> bool:
    return (
        installment_status(installment.amount, received.get(installment.id, 0.0))
        == "paid"
    )


def _order_violation(
    target: PaymentInstallmentModel,
    siblings: list[PaymentInstallmentModel],
    received: dict[int, float],
) -> str | None:
    """Message when ``target`` cannot be paid yet (deposit before balance).

    The ``gap`` installment is not subject to the order (R3).
    """
    if target.payment_type == "gap":
        return None
    deposits = [i for i in siblings if i.payment_type == "deposit"]
    balances = [i for i in siblings if i.payment_type == "balance"]
    if target.payment_type == "deposit":
        earlier = [
            i for i in deposits if i.installment_number < target.installment_number
        ]
        if not all(_is_paid(i, received) for i in earlier):
            return PREVIOUS_DEPOSIT_UNPAID
        return None
    if not all(_is_paid(i, received) for i in deposits):
        return DEPOSIT_BEFORE_BALANCE
    earlier = [i for i in balances if i.installment_number < target.installment_number]
    if not all(_is_paid(i, received) for i in earlier):
        return PREVIOUS_BALANCE_UNPAID
    return None


class ReservationPaymentService:
    """Record payments, list them and summarise a reservation's amounts."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.reservation_repo = ReservationRepository(session)
        self.lot_repo = LotRepository(session)
        self.schedule_repo = PaymentRepository(session)
        self.received_repo = ReservationPaymentRepository(session)
        self.document_service = DocumentService(session)
        self.payment_service = PaymentService(session)
        self.acte_service = ActeService(session)

    async def _locked_reservation(self, reservation_id: int) -> ReservationModel:
        """The reservation, row locked: its payments are recorded one at a time.

        Lock order for every write on an engaged reservation: reservation,
        then its installments.
        """
        result = await self.session.execute(
            select(ReservationModel)
            .where(ReservationModel.id == reservation_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        reservation = result.scalar_one_or_none()
        if reservation is None:
            raise NotFoundError("Reservation", reservation_id)
        return reservation

    async def record_payment(
        self,
        reservation_id: int,
        data: ReservationPaymentForm,
        file: UploadFile | None,
        user: UserModel,
    ) -> ReservationPaymentResponse:
        """Record a payment on an installment of an engaged reservation.

        Everything is checked before anything is written. Afterwards: the
        installment status is recomputed and persisted, the deed is archived
        if this payment reaches the threshold and no deed exists yet (never
        fails the payment), and the confirmation email is sent (an email
        failure is only logged).

        Raises:
            NotFoundError: Reservation not found.
            AuthorizationError: Neither the reservation's commercial nor a manager.
            BusinessRuleError: Reservation not engaged, installment missing or
                of another reservation, amount above the installment's
                remaining amount, payment order, or invalid proof file.
        """
        reservation = await self._locked_reservation(reservation_id)
        if user.role != "manager" and reservation.reserved_by_user_id != user.id:
            raise AuthorizationError(
                message=(
                    "Seuls le commercial auteur de la réservation et les managers "
                    "peuvent enregistrer un encaissement."
                )
            )
        lot = await self.lot_repo.get_by_id(reservation.lot_id)
        if (
            lot is None
            or lot.status != "reservation_engagee"
            or lot.current_reservation_id != reservation.id
        ):
            raise BusinessRuleError(
                message=(
                    "Un encaissement ne peut être enregistré que sur une "
                    "réservation engagée."
                ),
                rule="reservation_not_engaged",
            )
        if data.installment_id is None:
            raise BusinessRuleError(
                message="Choisissez l'échéance de cet encaissement.",
                rule="installment_required",
            )

        row = (
            await self.session.execute(installment_for_update(data.installment_id))
        ).one_or_none()
        if row is None or row.reservation_id != reservation.id:
            raise BusinessRuleError(
                message="Cette échéance n'appartient pas à cette réservation.",
                rule="installment_not_in_reservation",
            )
        installment: PaymentInstallmentModel = row[0]

        amount = data.amount_value
        schedule = await self.schedule_repo.get_by_reservation(reservation.id)
        siblings = list(schedule.installments) if schedule else [installment]
        received = await self.received_repo.totals_by_installment(
            [i.id for i in siblings]
        )
        left = remaining(installment.amount, received.get(installment.id, 0.0))
        if to_cents(amount) > to_cents(left):
            raise BusinessRuleError(
                message=(
                    "Le montant dépasse le restant dû de cette échéance "
                    f"({format_mad(left)} MAD)."
                ),
                rule="amount_above_installment_remaining",
            )
        order_message = _order_violation(installment, siblings, received)
        if order_message is not None:
            raise BusinessRuleError(message=order_message, rule=_ORDER_RULE)

        proof = await read_upload(file) if file is not None else None
        was_available = (
            await self.acte_service.acte_readiness(reservation.id)
        ).available

        # ── Writes ───────────────────────────────────────────────────────
        document_id = None
        if proof is not None:
            content, content_type = proof
            document = await self.document_service.store_generated_document(
                lot_id=reservation.lot_id,
                reservation_id=reservation.id,
                filename=file.filename or "justificatif",
                content=content,
                content_type=content_type,
                category=PROOF_CATEGORY,
                user_id=user.id,
            )
            document_id = document.id

        payment = await self.received_repo.create(
            reservation_id=reservation.id,
            installment_id=installment.id,
            amount=amount,
            paid_on=data.paid_on,
            method=data.method,
            reference=data.reference,
            document_id=document_id,
            recorded_by_user_id=user.id,
        )
        installment_received = (
            to_cents(received.get(installment.id, 0.0)) + to_cents(amount)
        ) / 100
        status = installment_status(installment.amount, installment_received)
        await self.schedule_repo.update_installment(
            installment_id=installment.id,
            status=status,
            # The payment that completes the installment dates it.
            paid_date=(
                datetime.combine(data.paid_on, time(), tzinfo=UTC)
                if status == "paid"
                else None
            ),
        )
        logger.info(
            "Payment recorded",
            reservation_id=reservation.id,
            installment_id=installment.id,
            payment_id=payment.id,
            installment_status=status,
        )

        # The payment that reaches the threshold archives the deed, once.
        # generate_and_store re-checks the threshold (``not_ready`` below it)
        # and never raises: a PDF or storage failure leaves the payment intact.
        if (
            not was_available
            and await self.acte_service.latest_acte(reservation.id) is None
        ):
            await self.acte_service.generate_and_store(reservation.id, user.id)

        response = _payment_response(payment, user.name)
        await self.session.commit()

        try:
            await self.payment_service.send_payment_confirmation(
                installment_id=installment.id,
                amount=amount,
                paid_date=data.paid_on,
                payment_type=installment.payment_type,
            )
        except Exception:
            logger.exception(
                "Payment confirmation email failed", payment_id=response.id
            )
        return response

    async def list_payments(
        self, reservation_id: int
    ) -> list[ReservationPaymentResponse]:
        """Payments of a reservation, ``paid_on`` then ``id`` order.

        Raises:
            NotFoundError: Reservation not found.
        """
        if await self.reservation_repo.get_by_id(reservation_id) is None:
            raise NotFoundError("Reservation", reservation_id)
        rows = await self.received_repo.list_with_recorder(reservation_id)
        return [_payment_response(payment, name) for payment, name in rows]

    async def financial_summary(self, reservation_id: int) -> FinancialSummaryResponse:
        """Amounts of a reservation (spec E4-T5 definitions).

        Raises:
            NotFoundError: Reservation not found.
        """
        details = await self.acte_service.load_details(reservation_id)
        agreed = agreed_total(details)
        price = acte_price(details)
        readiness = await self.acte_service.acte_readiness(reservation_id)

        schedule = await self.schedule_repo.get_by_reservation(reservation_id)
        installments = (
            sorted(schedule.installments, key=lambda i: (i.due_date, i.id))
            if schedule
            else []
        )
        received = await self.received_repo.totals_by_installment(
            [i.id for i in installments]
        )
        lines = []
        for inst in installments:
            got = received.get(inst.id, 0.0)
            lines.append(
                InstallmentSummary(
                    id=inst.id,
                    payment_type=inst.payment_type,
                    installment_number=inst.installment_number,
                    amount=inst.amount,
                    due_date=inst.due_date,
                    received=got,
                    remaining=remaining(inst.amount, got),
                    status=installment_status(inst.amount, got),
                )
            )

        return FinancialSummaryResponse(
            catalogue_price=details["lot_price"],
            agreed_total_price=agreed,
            acte_price=price,
            gap_amount=gap_amount(agreed, price),
            gap_due_timing=details["gap_due_timing"],
            gap_due_date=details["gap_due_date"],
            first_payment=details["first_payment"],
            total_received=readiness.total_received,
            remaining=remaining(agreed, readiness.total_received),
            acte_min_paid_pct=details["acte_min_paid_pct"],
            acte_threshold_amount=readiness.threshold_amount,
            acte_available=readiness.available,
            installments=lines,
            updated_at=details["updated_at"],
        )
