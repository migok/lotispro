"""Reservation service — lot workflow transitions and reservation management."""

from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleError, NotFoundError
from app.core.logging import get_logger
from app.domain.lot_workflow import EDL_STATUSES, assert_transition_allowed
from app.domain.reservation_amounts import (
    format_mad,
    gap_amount,
    gap_installment_amount,
    remaining,
    split_schedule,
    to_cents,
    validate_amounts,
)
from app.domain.schemas.lot import LotResponse
from app.domain.schemas.payment import InstallmentConfig
from app.domain.schemas.reservation import (
    BlockLotData,
    ChezNotaireData,
    DirectToEngageeData,
    DirectToRAFData,
    EngageBaseData,
    EngagementAmountsData,
    FinaliserEngageData,
    FinaliserRefundData,
    OptionCreate,
    OptionEngageData,
    PaymentPlanData,
    ReservationAFinaliserData,
    ReservationCreate,
    ReservationFilter,
    ReservationRelease,
    ReservationResponse,
    SetNotaireIntentData,
    UnblockLotData,
)
from app.domain.schemas.sale import SaleFromReservation, SaleResponse
from app.infrastructure.database.models import LotModel, ReservationModel
from app.infrastructure.database.repositories import (
    ClientRepository,
    LotPricingConfigRepository,
    LotRepository,
    NotaireRepository,
    PaymentRepository,
    ProjectRepository,
    ReservationPaymentRepository,
    ReservationRepository,
    SaleRepository,
)

logger = get_logger(__name__)


def _reservation_to_response(
    r: ReservationModel, first_payment: float
) -> ReservationResponse:
    """Convert a ReservationModel to ReservationResponse.

    ``first_payment``: « premier acompte reçu », from
    ``ReservationPaymentRepository.first_payment_total``.
    """
    return ReservationResponse(
        id=r.id,
        project_id=r.project_id,
        lot_id=r.lot_id,
        client_id=r.client_id,
        reserved_by_user_id=r.reserved_by_user_id,
        reservation_date=r.reservation_date,
        expiration_date=r.expiration_date,
        deposit=r.deposit,
        deposit_date=r.deposit_date,
        deposit_refund_amount=r.deposit_refund_amount,
        deposit_refund_date=r.deposit_refund_date,
        deposit_refund_payment_type=r.deposit_refund_payment_type,
        release_reason=r.release_reason,
        notes=r.notes,
        status=r.status,
        payment_type=r.payment_type,
        guarantee_amount=r.guarantee_amount,
        notaire_id=r.notaire_id,
        notary_name=r.notary_name,
        notary_date=r.notary_date,
        sale_price=r.sale_price,
        agreed_total_price=r.agreed_total_price,
        gap_amount=(
            gap_amount(r.agreed_total_price, r.sale_price)
            if r.agreed_total_price is not None and r.sale_price is not None
            else None
        ),
        gap_due_timing=r.gap_due_timing,
        gap_due_date=r.gap_due_date,
        first_payment=first_payment,
        promotion_amount=r.promotion_amount,
        promotion_paid_timing=r.promotion_paid_timing,
        promotion_received=r.promotion_received,
        wants_notaire=r.wants_notaire,
        created_at=r.created_at,
        updated_at=r.updated_at,
    )


class ReservationService:
    """Service for reservation management and lot workflow transitions."""

    def __init__(self, session: AsyncSession):
        """Initialize with database session."""
        self.session = session
        self.reservation_repo = ReservationRepository(session)
        self.lot_repo = LotRepository(session)
        self.client_repo = ClientRepository(session)
        self.project_repo = ProjectRepository(session)
        self.sale_repo = SaleRepository(session)
        self.payment_repo = PaymentRepository(session)
        self.notaire_repo = NotaireRepository(session)
        self.pricing_repo = LotPricingConfigRepository(session)
        self.received_repo = ReservationPaymentRepository(session)

    async def _to_response(self, r: ReservationModel) -> ReservationResponse:
        """ReservationResponse with its « premier acompte reçu »."""
        return _reservation_to_response(
            r, await self.received_repo.first_payment_total(r.id)
        )

    async def _enabled_optional(self, lot: LotModel) -> list[str]:
        """Optional statuses enabled for the lot's project."""
        return await self.project_repo.get_enabled_optional(lot.project_id)

    # ------------------------------------------------------------------
    # Read operations
    # ------------------------------------------------------------------

    async def get_reservations(
        self,
        filters: ReservationFilter | None = None,
        offset: int = 0,
        limit: int = 100,
    ) -> list[ReservationResponse]:
        """Get reservations with filtering."""
        reservations = await self.reservation_repo.get_filtered(filters, offset, limit)
        first_payments = await self.received_repo.first_payment_totals(
            [r.id for r in reservations]
        )
        return [
            _reservation_to_response(r, first_payments.get(r.id, 0.0))
            for r in reservations
        ]

    async def get_reservation(self, reservation_id: int) -> ReservationResponse:
        """Get reservation by ID.

        Raises:
            NotFoundError: If reservation not found
        """
        reservation = await self.reservation_repo.get_by_id(reservation_id)
        if not reservation:
            raise NotFoundError("Reservation", reservation_id)
        return await self._to_response(reservation)

    async def get_reservation_details(self, reservation_id: int) -> dict | None:
        """Get reservation with all details needed for certificate generation."""
        return await self.reservation_repo.get_with_details(reservation_id)

    async def get_expired_alerts(self) -> dict:
        """Return lots past their expiration date — alert only, NO status mutations.

        Replaces the old check_expirations() which auto-transitioned lots.
        """
        expired_options = await self.lot_repo.get_expired_options()
        expired_finalisations = await self.lot_repo.get_expired_finalisations()
        return {
            "expired_options": expired_options,
            "expired_finalisations": expired_finalisations,
            "count": len(expired_options) + len(expired_finalisations),
        }

    # ------------------------------------------------------------------
    # Transition: available → option
    # ------------------------------------------------------------------

    async def start_option(
        self,
        data: OptionCreate,
        user_id: int | None = None,
    ) -> ReservationResponse:
        """Create an option on an available lot (available → option).

        Raises:
            NotFoundError: If lot or client not found
            BusinessRuleError: If lot is not available
        """
        # NOTE: lot_id comes in via the endpoint — see start_option_for_lot below
        raise NotImplementedError("Use start_option_for_lot(lot_id, data, user_id)")

    async def start_option_for_lot(
        self,
        lot_id: int,
        data: OptionCreate,
        user_id: int | None = None,
    ) -> ReservationResponse:
        """Create an option on an available lot (available → option).

        Raises:
            NotFoundError: If lot or client not found
            BusinessRuleError: If lot is not available
        """
        lot = await self.lot_repo.get_by_id(lot_id)
        if not lot:
            raise NotFoundError("Lot", lot_id)

        if lot.status != "available":
            raise BusinessRuleError(
                message=f"Lot is not available (current status: {lot.status})",
                rule="lot_not_available",
            )
        new_status = assert_transition_allowed(
            await self._enabled_optional(lot), "start_option", lot.status
        )

        client = await self.client_repo.get_by_id(data.client_id)
        if not client:
            raise NotFoundError("Client", data.client_id)

        reservation = await self.reservation_repo.create(
            project_id=lot.project_id,
            lot_id=lot_id,
            client_id=data.client_id,
            reserved_by_user_id=user_id,
            expiration_date=data.expiration_date,
            deposit=data.deposit,
            deposit_date=data.deposit_date,
            notes=data.notes,
        )

        await self.lot_repo.change_status(
            lot_id,
            new_status,
            transition="start_option",
            user_id=user_id,
            reservation_id=reservation.id,
        )

        logger.info(
            "Option started",
            lot_id=lot_id,
            reservation_id=reservation.id,
            user_id=user_id,
        )
        return await self._to_response(reservation)

    # ------------------------------------------------------------------
    # Transition: option → available (cancel)
    # ------------------------------------------------------------------

    async def cancel_option(
        self,
        lot_id: int,
        user_id: int,
        user_role: str,
        reason: str | None = None,
    ) -> LotResponse:
        """Cancel an option and return lot to available (option → available).

        Raises:
            NotFoundError: If lot not found or no active reservation
            BusinessRuleError: If lot is not in option status or insufficient permissions
        """
        lot = await self.lot_repo.get_by_id(lot_id)
        if not lot:
            raise NotFoundError("Lot", lot_id)

        if lot.status != "option":
            raise BusinessRuleError(
                message=f"Lot is not in option status (current: {lot.status})",
                rule="invalid_lot_status",
            )
        new_status = assert_transition_allowed(
            await self._enabled_optional(lot), "cancel_option", lot.status
        )

        if lot.current_reservation_id:
            reservation = await self.reservation_repo.get_by_id(
                lot.current_reservation_id
            )
            if reservation:
                if (
                    user_role != "manager"
                    and reservation.reserved_by_user_id != user_id
                ):
                    raise BusinessRuleError(
                        message="Insufficient permissions to cancel this option",
                        rule="insufficient_permissions",
                    )
                await self.reservation_repo.update(
                    reservation.id,
                    status="released",
                    release_reason=reason,
                )
                await self.payment_repo.delete_by_reservation(reservation.id)

        await self.lot_repo.change_status(
            lot_id,
            new_status,
            transition="cancel_option",
            user_id=user_id,
            clear_reservation=True,
        )

        logger.info("Option cancelled", lot_id=lot_id, user_id=user_id)
        updated_lot = await self.lot_repo.get_by_id(lot_id)
        return LotResponse.model_validate(updated_lot)

    # ------------------------------------------------------------------
    # Transition: available → reservation_a_finaliser (direct, sans option)
    # ------------------------------------------------------------------

    async def available_to_reservation_a_finaliser(
        self,
        lot_id: int,
        data: DirectToRAFData,
        user_id: int | None = None,
    ) -> ReservationResponse:
        """Create a reservation and move directly to reservation_a_finaliser.

        Used when a client brings a guarantee upfront without an option period.

        Raises:
            NotFoundError: If lot or client not found
            BusinessRuleError: If lot is not available
        """
        lot = await self.lot_repo.get_by_id(lot_id)
        if not lot:
            raise NotFoundError("Lot", lot_id)

        if lot.status != "available":
            raise BusinessRuleError(
                message=f"Lot is not available (current status: {lot.status})",
                rule="lot_not_available",
            )
        new_status = assert_transition_allowed(
            await self._enabled_optional(lot), "direct_reservation", lot.status
        )

        client = await self.client_repo.get_by_id(data.client_id)
        if not client:
            raise NotFoundError("Client", data.client_id)

        reservation = await self.reservation_repo.create(
            project_id=lot.project_id,
            lot_id=lot_id,
            client_id=data.client_id,
            reserved_by_user_id=user_id,
            expiration_date=data.finalization_date,
            deposit=0,
            notes=data.notes,
        )

        await self.reservation_repo.update(
            reservation.id,
            guarantee_amount=data.guarantee_amount,
            payment_type=data.payment_type,
        )

        await self.lot_repo.change_status(
            lot_id,
            new_status,
            transition="direct_reservation",
            user_id=user_id,
            reservation_id=reservation.id,
        )

        logger.info(
            "Direct available → reservation_a_finaliser",
            lot_id=lot_id,
            reservation_id=reservation.id,
            guarantee_amount=data.guarantee_amount,
        )
        updated = await self.reservation_repo.get_by_id(reservation.id)
        return await self._to_response(updated)  # type: ignore[arg-type]

    # ------------------------------------------------------------------
    # Private helpers: amounts, first payment and schedule at engagement
    # ------------------------------------------------------------------

    async def _engagement_amounts(
        self, lot: LotModel, data: EngagementAmountsData, first_payment: float
    ) -> tuple[float, float]:
        """Agreed total price and deed price of an engagement, validated.

        Agreed total defaults to the catalogue price; the deed price to the
        pricing grid, else the agreed total.

        Raises:
            BusinessRuleError: No agreed total price, deed price or first
                payment above the agreed total price.
        """
        agreed = (
            data.agreed_total_price
            if data.agreed_total_price is not None
            else lot.price
        )
        if agreed is None:
            raise BusinessRuleError(
                message="Indiquez le prix total convenu.",
                rule="agreed_price_required",
            )
        acte = data.sale_price
        if acte is None:
            pricing_cfg = await self.pricing_repo.get_for_combination(
                lot.project_id, lot.zone, lot.type_lot, lot.type_maison, lot.emplacement
            )
            if pricing_cfg and lot.surface:
                acte = round(pricing_cfg.prix_m2_acte * lot.surface, 2)
            else:
                acte = agreed
        validate_amounts(agreed, acte, first_payment)
        return agreed, acte

    async def _record_engagement_finance(
        self,
        reservation_id: int,
        data: EngagementAmountsData,
        *,
        agreed: float,
        acte: float,
        received: list[dict],
        user_id: int | None,
    ) -> None:
        """Persist the amounts, the payments received and the schedule.

        ``received``: payments received at engagement (``amount``,
        ``paid_on``, ``method``, optional ``reference``), recorded without
        installment; the first one is the first payment.
        """
        gap_date = data.gap_due_date if data.gap_due_timing == "date" else None
        await self.reservation_repo.update(
            reservation_id,
            agreed_total_price=agreed,
            sale_price=acte,
            gap_due_timing=data.gap_due_timing,
            gap_due_date=gap_date,
        )
        for payment in received:
            await self.received_repo.create(
                reservation_id=reservation_id,
                installment_id=None,
                recorded_by_user_id=user_id,
                **payment,
            )
        first_payment = await self.received_repo.first_payment_total(reservation_id)
        await self._create_engagement_schedule(
            reservation_id,
            agreed=agreed,
            first_payment=first_payment,
            gap=gap_amount(agreed, acte),
            plan=data.payment_plan,
            gap_timing=data.gap_due_timing,
            gap_date=gap_date,
        )

    async def _create_engagement_schedule(
        self,
        reservation_id: int,
        *,
        agreed: float,
        first_payment: float,
        gap: float,
        plan: PaymentPlanData | None,
        gap_timing: str,
        gap_date: date | None,
    ) -> None:
        """Create the schedule of an engagement, in the transition's transaction.

        It covers exactly ``agreed − first payment``: deposit / balance
        installments (R2; without plan, one balance installment due today, R1)
        and a ``gap`` installment for the écart (R3: due today, at the last
        balance installment, or on ``gap_date``). A schedule created before
        the engagement is replaced (nothing can have been received on it).
        """
        from app.services.payment_service import (
            _add_months,
            _generate_due_dates,
            _split_amount,
        )

        await self.payment_repo.delete_by_reservation(reservation_id)

        engaged_at = datetime.now(UTC)
        deposit_pct = plan.deposit_pct if plan is not None else None
        deposit_total, balance_total = split_schedule(
            agreed, first_payment, gap, deposit_pct, gap_timing
        )
        gap_total = gap_installment_amount(agreed, first_payment, gap)
        schedule = await self.payment_repo.create(
            reservation_id=reservation_id,
            lot_price=remaining(agreed, first_payment),
            deposit_pct=deposit_pct or 0.0,
            balance_pct=round(100.0 - (deposit_pct or 0.0), 4),
            deposit_total=deposit_total,
            balance_total=balance_total,
            balance_delay_months=plan.balance_delay_months if plan else 0,
        )

        if plan is not None:
            deposit_dates = _generate_due_dates(
                plan.deposit_start_date or engaged_at,
                InstallmentConfig(
                    count=plan.deposit_count,
                    periodicity_months=plan.deposit_periodicity,
                ),
            )
            balance_dates = _generate_due_dates(
                _add_months(deposit_dates[-1], plan.balance_delay_months),
                InstallmentConfig(
                    count=plan.balance_count,
                    periodicity_months=plan.balance_periodicity,
                ),
            )
        else:
            deposit_dates, balance_dates = [], [engaged_at]

        last_due = engaged_at
        for payment_type, total, dates in (
            ("deposit", deposit_total, deposit_dates),
            ("balance", balance_total, balance_dates),
        ):
            if to_cents(total) <= 0:
                continue
            amounts = _split_amount(total, len(dates))
            for number, (due, amount) in enumerate(
                zip(dates, amounts, strict=True), start=1
            ):
                await self.payment_repo.create_installment(
                    schedule_id=schedule.id,
                    payment_type=payment_type,
                    installment_number=number,
                    amount=amount,
                    due_date=due,
                )
            last_due = dates[-1]

        if to_cents(gap_total) > 0:
            if gap_timing == "debut":
                gap_due = engaged_at
            elif gap_timing == "date" and gap_date is not None:
                gap_due = datetime.combine(gap_date, time.min, tzinfo=UTC)
            else:
                gap_due = last_due
            await self.payment_repo.create_installment(
                schedule_id=schedule.id,
                payment_type="gap",
                installment_number=1,
                amount=gap_total,
                due_date=gap_due,
            )

        logger.info(
            "Payment schedule created at engagement",
            reservation_id=reservation_id,
            agreed=agreed,
            first_payment=first_payment,
            deposit_total=deposit_total,
            balance_total=balance_total,
            gap_total=gap_total,
            with_plan=plan is not None,
        )

    # ------------------------------------------------------------------
    # Transition: available → reservation_engagee (direct, avec ND + acompte)
    # ------------------------------------------------------------------

    async def available_to_reservation_engagee(
        self,
        lot_id: int,
        data: DirectToEngageeData,
        user_id: int | None = None,
    ) -> ReservationResponse:
        """Create a reservation and move directly to reservation_engagee.

        Used when the ND and first deposit are received simultaneously.

        Raises:
            NotFoundError: If lot or client not found
            BusinessRuleError: If lot is not available, or invalid amounts
        """
        lot = await self.lot_repo.get_by_id(lot_id)
        if not lot:
            raise NotFoundError("Lot", lot_id)

        if lot.status != "available":
            raise BusinessRuleError(
                message=f"Lot is not available (current status: {lot.status})",
                rule="lot_not_available",
            )
        new_status = assert_transition_allowed(
            await self._enabled_optional(lot), "direct_engage", lot.status
        )

        client = await self.client_repo.get_by_id(data.client_id)
        if not client:
            raise NotFoundError("Client", data.client_id)

        agreed, acte = await self._engagement_amounts(lot, data, data.guarantee_amount)

        reservation = await self.reservation_repo.create(
            project_id=lot.project_id,
            lot_id=lot_id,
            client_id=data.client_id,
            reserved_by_user_id=user_id,
            expiration_date=datetime.now(UTC) + timedelta(days=365),
            deposit=0,
            notes=data.notes,
        )

        await self._apply_engagement(
            lot,
            reservation.id,
            data,
            agreed=agreed,
            acte=acte,
            new_status=new_status,
            transition="direct_engage",
            user_id=user_id,
        )

        updated = await self.reservation_repo.get_by_id(reservation.id)
        return await self._to_response(updated)  # type: ignore[arg-type]

    async def _apply_engagement(
        self,
        lot: LotModel,
        reservation_id: int,
        data: EngageBaseData,
        *,
        agreed: float,
        acte: float,
        new_status: str,
        transition: str,
        user_id: int | None,
        extra_reservation_update: dict | None = None,
        kept_payments: list[dict] | None = None,
    ) -> None:
        """Record the engagement of ``reservation_id`` and move the lot.

        Shared by ``direct_engage`` and ``option_engage``: amounts, first
        payment (encaissement n° 1), lot status change (history) and the
        schedule. ``extra_reservation_update`` is merged into the reservation
        update; ``kept_payments`` are other payments already received and
        kept (e.g. the option deposit), recorded after the first payment.
        """
        reservation_update: dict = {
            "guarantee_amount": data.guarantee_amount,
            "payment_type": data.payment_type,
        }
        reservation_update.update(extra_reservation_update or {})
        await self.reservation_repo.update(reservation_id, **reservation_update)

        await self.lot_repo.change_status(
            lot.id,
            new_status,
            transition=transition,
            user_id=user_id,
            reservation_id=reservation_id,
        )

        first_payment = {
            "amount": data.guarantee_amount,
            "paid_on": datetime.now(UTC).date(),
            "method": data.payment_type,
        }
        await self._record_engagement_finance(
            reservation_id,
            data,
            agreed=agreed,
            acte=acte,
            received=[first_payment, *(kept_payments or [])],
            user_id=user_id,
        )

        logger.info(
            "Lot engaged",
            transition=transition,
            lot_id=lot.id,
            reservation_id=reservation_id,
            guarantee_amount=data.guarantee_amount,
            agreed_total_price=agreed,
            sale_price=acte,
        )

    # ------------------------------------------------------------------
    # Transition: option → reservation_engagee (réservation à finaliser désactivée)
    # ------------------------------------------------------------------

    async def option_to_reservation_engagee(
        self,
        lot_id: int,
        data: OptionEngageData,
        user_id: int,
        user_role: str,
    ) -> ReservationResponse:
        """Engage the existing option reservation directly.

        Only allowed when the project disabled ``reservation_a_finaliser``.

        Raises:
            NotFoundError: If lot or reservation not found
            BusinessRuleError: Wrong status, status path not allowed, no active
                reservation, or caller is neither manager nor owner
        """
        lot = await self.lot_repo.get_by_id(lot_id)
        if not lot:
            raise NotFoundError("Lot", lot_id)

        new_status = assert_transition_allowed(
            await self._enabled_optional(lot), "option_engage", lot.status
        )

        if not lot.current_reservation_id:
            raise BusinessRuleError(
                message="No active reservation found for this lot",
                rule="no_active_reservation",
            )

        reservation = await self.reservation_repo.get_by_id(lot.current_reservation_id)
        if not reservation:
            raise NotFoundError("Reservation", lot.current_reservation_id)

        if user_role != "manager" and reservation.reserved_by_user_id != user_id:
            raise BusinessRuleError(
                message="Insufficient permissions",
                rule="insufficient_permissions",
            )

        option_deposit = reservation.deposit or 0
        if option_deposit > 0 and data.deposit_action is None:
            raise BusinessRuleError(
                message="Indiquez si l'acompte de l'option est déduit ou remboursé.",
                rule="deposit_action_required",
            )
        deduct = option_deposit > 0 and data.deposit_action == "deduct"
        refund = option_deposit > 0 and data.deposit_action == "refund"

        extra_update: dict = {
            "expiration_date": datetime.now(UTC) + timedelta(days=365),
        }
        if data.notes:
            extra_update["notes"] = (
                f"{reservation.notes}\n{data.notes}"
                if reservation.notes
                else data.notes
            )
        if refund:
            if data.refund_amount is not None:
                extra_update["deposit_refund_amount"] = data.refund_amount
            if data.refund_date is not None:
                extra_update["deposit_refund_date"] = data.refund_date
            if data.refund_payment_type is not None:
                extra_update["deposit_refund_payment_type"] = data.refund_payment_type

        # The option deposit kept is money already received: recorded as a
        # payment of the engagement (its method was not captured with the
        # option, the engagement's one is used).
        kept_payments = []
        if deduct:
            kept_payments.append(
                {
                    "amount": option_deposit,
                    "paid_on": reservation.deposit_date
                    or reservation.reservation_date.date(),
                    "method": data.payment_type,
                    "reference": "Acompte de l'option",
                }
            )
        agreed, acte = await self._engagement_amounts(
            lot,
            data,
            data.guarantee_amount + sum(p["amount"] for p in kept_payments),
        )

        await self._apply_engagement(
            lot,
            reservation.id,
            data,
            agreed=agreed,
            acte=acte,
            new_status=new_status,
            transition="option_engage",
            user_id=user_id,
            extra_reservation_update=extra_update,
            kept_payments=kept_payments,
        )

        updated = await self.reservation_repo.get_by_id(reservation.id)
        return await self._to_response(updated)  # type: ignore[arg-type]

    # ------------------------------------------------------------------
    # Transition: option → reservation_a_finaliser
    # ------------------------------------------------------------------

    async def option_to_reservation_a_finaliser(
        self,
        lot_id: int,
        data: ReservationAFinaliserData,
        user_id: int,
        user_role: str,
    ) -> ReservationResponse:
        """Move lot from option to reservation_a_finaliser with guarantee amount.

        Raises:
            NotFoundError: If lot not found
            BusinessRuleError: If lot is not in option status
        """
        lot = await self.lot_repo.get_by_id(lot_id)
        if not lot:
            raise NotFoundError("Lot", lot_id)

        if lot.status != "option":
            raise BusinessRuleError(
                message=f"Lot must be in option status (current: {lot.status})",
                rule="invalid_lot_status",
            )
        new_status = assert_transition_allowed(
            await self._enabled_optional(lot), "to_reservation", lot.status
        )

        if not lot.current_reservation_id:
            raise BusinessRuleError(
                message="No active reservation found for this lot",
                rule="no_active_reservation",
            )

        reservation = await self.reservation_repo.get_by_id(lot.current_reservation_id)
        if not reservation:
            raise NotFoundError("Reservation", lot.current_reservation_id)

        if user_role != "manager" and reservation.reserved_by_user_id != user_id:
            raise BusinessRuleError(
                message="Insufficient permissions",
                rule="insufficient_permissions",
            )

        updated = await self.reservation_repo.update(
            reservation.id,
            guarantee_amount=data.guarantee_amount,
            expiration_date=data.finalization_date,
            payment_type=data.payment_type,
            notes=data.notes or reservation.notes,
        )

        await self.lot_repo.change_status(
            lot_id, new_status, transition="to_reservation", user_id=user_id
        )

        logger.info(
            "Lot moved to reservation_a_finaliser",
            lot_id=lot_id,
            guarantee_amount=data.guarantee_amount,
        )
        return await self._to_response(updated)

    # ------------------------------------------------------------------
    # Transition: reservation_a_finaliser → available (refund)
    # ------------------------------------------------------------------

    async def finaliser_refund(
        self,
        lot_id: int,
        data: FinaliserRefundData,
        user_id: int,
        user_role: str,
    ) -> LotResponse:
        """Cancel reservation_a_finaliser with refund → lot back to available.

        Raises:
            NotFoundError: If lot not found
            BusinessRuleError: If lot is not in reservation_a_finaliser status
        """
        lot = await self.lot_repo.get_by_id(lot_id)
        if not lot:
            raise NotFoundError("Lot", lot_id)

        if lot.status != "reservation_a_finaliser":
            raise BusinessRuleError(
                message=f"Lot must be in reservation_a_finaliser status (current: {lot.status})",
                rule="invalid_lot_status",
            )
        new_status = assert_transition_allowed(
            await self._enabled_optional(lot), "refund", lot.status
        )

        if lot.current_reservation_id:
            reservation = await self.reservation_repo.get_by_id(
                lot.current_reservation_id
            )
            if reservation:
                if (
                    user_role != "manager"
                    and reservation.reserved_by_user_id != user_id
                ):
                    raise BusinessRuleError(
                        message="Insufficient permissions",
                        rule="insufficient_permissions",
                    )
                await self.reservation_repo.update(
                    reservation.id,
                    status="released",
                    deposit_refund_amount=data.refund_amount,
                    deposit_refund_date=data.refund_date,
                    release_reason=data.release_reason,
                )
                await self.payment_repo.delete_by_reservation(reservation.id)

        await self.lot_repo.change_status(
            lot_id,
            new_status,
            transition="refund",
            user_id=user_id,
            clear_reservation=True,
        )

        logger.info("Finaliser refund — lot back to available", lot_id=lot_id)
        updated_lot = await self.lot_repo.get_by_id(lot_id)
        return LotResponse.model_validate(updated_lot)

    # ------------------------------------------------------------------
    # Transition: reservation_a_finaliser → reservation_engagee (deduct)
    # ------------------------------------------------------------------

    async def finaliser_engage(
        self,
        lot_id: int,
        user_id: int,
        user_role: str,
        data: FinaliserEngageData | None = None,
    ) -> LotResponse:
        """Move from reservation_a_finaliser to reservation_engagee.

        Both guarantee_action values advance the lot to reservation_engagee:
        - deduct: guarantee is kept as part of the payment
        - refund: guarantee is physically returned to the client (e.g. cheque
                  handed back), but the reservation still advances — the client
                  will provide new guarantee at the next stage

        Raises:
            NotFoundError: If lot not found
            BusinessRuleError: If lot is not in reservation_a_finaliser status
        """
        lot = await self.lot_repo.get_by_id(lot_id)
        if not lot:
            raise NotFoundError("Lot", lot_id)

        if lot.status != "reservation_a_finaliser":
            raise BusinessRuleError(
                message=f"Lot must be in reservation_a_finaliser status (current: {lot.status})",
                rule="invalid_lot_status",
            )
        new_status = assert_transition_allowed(
            await self._enabled_optional(lot), "engage", lot.status
        )

        current_reservation = None
        if lot.current_reservation_id:
            current_reservation = await self.reservation_repo.get_by_id(
                lot.current_reservation_id
            )
            if (
                current_reservation
                and user_role != "manager"
                and current_reservation.reserved_by_user_id != user_id
            ):
                raise BusinessRuleError(
                    message="Insufficient permissions",
                    rule="insufficient_permissions",
                )

        data = data or FinaliserEngageData()
        guarantee_action = data.guarantee_action

        # Deduct: the guarantee already received is the first payment (same
        # rule as the other engagements). Refund: it was handed back, nothing
        # has been received yet.
        received: list[dict] = []
        if (
            current_reservation
            and guarantee_action == "deduct"
            and current_reservation.guarantee_amount
        ):
            received.append(
                {
                    "amount": current_reservation.guarantee_amount,
                    "paid_on": datetime.now(UTC).date(),
                    "method": current_reservation.payment_type,
                }
            )
        agreed, acte = await self._engagement_amounts(
            lot, data, sum(p["amount"] for p in received)
        )

        # Refund fields (when guarantee_action == 'refund')
        if current_reservation and guarantee_action == "refund":
            await self.reservation_repo.update(
                current_reservation.id,
                deposit_refund_amount=data.refund_amount,
                deposit_refund_date=data.refund_date,
                deposit_refund_payment_type=data.refund_payment_type,
            )

        await self.lot_repo.change_status(
            lot_id, new_status, transition="engage", user_id=user_id
        )

        if current_reservation:
            await self._record_engagement_finance(
                current_reservation.id,
                data,
                agreed=agreed,
                acte=acte,
                received=received,
                user_id=user_id,
            )

        logger.info(
            "Lot engaged (finaliser → engagee)",
            lot_id=lot_id,
            guarantee_action=guarantee_action,
            agreed_total_price=agreed,
            sale_price=acte,
        )
        updated_lot = await self.lot_repo.get_by_id(lot_id)
        return LotResponse.model_validate(updated_lot)

    # ------------------------------------------------------------------
    # Set notaire intent on a sold lot (soldée or EDL status)
    # ------------------------------------------------------------------

    async def set_notaire_intent(
        self,
        lot_id: int,
        data: SetNotaireIntentData,
        user_id: int | None = None,
    ) -> ReservationResponse:
        """Toggle the wants_notaire tag on a sold lot.

        Allows commercials/managers to record whether the client wants to
        proceed to the notary step. Allowed in reservation_soldee and in the
        three état des lieux statuses.

        Raises:
            NotFoundError: If lot not found or no active reservation
            BusinessRuleError: If lot is not in one of those statuses
        """
        lot = await self.lot_repo.get_by_id(lot_id)
        if not lot:
            raise NotFoundError("Lot", lot_id)

        if lot.status not in ("reservation_soldee", *EDL_STATUSES):
            raise BusinessRuleError(
                message=(
                    "Le lot doit être en statut réservation soldée ou état des "
                    f"lieux (actuel : {lot.status})"
                ),
                rule="invalid_lot_status",
            )
        assert_transition_allowed(
            await self._enabled_optional(lot), "set_notaire_intent", lot.status
        )

        if not lot.current_reservation_id:
            raise BusinessRuleError(
                message="Aucune réservation active trouvée pour ce lot",
                rule="no_active_reservation",
            )

        reservation = await self.reservation_repo.get_by_id(lot.current_reservation_id)
        if not reservation:
            raise NotFoundError("Reservation", lot.current_reservation_id)

        update_kwargs: dict = {"wants_notaire": data.wants_notaire}
        if data.notes:
            date_str = date.today().strftime("%d/%m/%Y")
            tag = "Notaire souhaité" if data.wants_notaire else "Notaire non souhaité"
            note_line = f"[{date_str}] {tag}."
            current = reservation.notes or ""
            update_kwargs["notes"] = (
                f"{current}\n{note_line}".strip() if current else note_line
            )

        updated = await self.reservation_repo.update(reservation.id, **update_kwargs)

        logger.info(
            "Notaire intent set",
            lot_id=lot_id,
            wants_notaire=data.wants_notaire,
            user_id=user_id,
        )
        return await self._to_response(updated)

    # ------------------------------------------------------------------
    # Transition: reservation_engagee → reservation_soldee
    # ------------------------------------------------------------------

    async def engagee_to_soldee(
        self,
        lot_id: int,
        sale_data: SaleFromReservation,
        user_id: int | None = None,
        user_role: str | None = None,
    ) -> SaleResponse:
        """Mark full payment received: reservation_engagee → reservation_soldee.

        Creates the SaleModel record at the agreed total price (the free
        ``sale_data.price`` is ignored).

        Raises:
            NotFoundError: If lot not found
            BusinessRuleError: If lot is not in reservation_engagee status, or
                an amount is still due (``amount_still_due``)
        """
        lot = await self.lot_repo.get_by_id(lot_id)
        if not lot:
            raise NotFoundError("Lot", lot_id)

        if lot.status != "reservation_engagee":
            raise BusinessRuleError(
                message=f"Lot must be in reservation_engagee status (current: {lot.status})",
                rule="invalid_lot_status",
            )
        new_status = assert_transition_allowed(
            await self._enabled_optional(lot), "solde", lot.status
        )

        if not lot.current_reservation_id:
            raise BusinessRuleError(
                message="No active reservation found for this lot",
                rule="no_active_reservation",
            )

        reservation = await self.reservation_repo.get_by_id(lot.current_reservation_id)
        if not reservation:
            raise NotFoundError("Reservation", lot.current_reservation_id)

        if (
            user_role
            and user_role != "manager"
            and reservation.reserved_by_user_id != user_id
        ):
            raise BusinessRuleError(
                message="Insufficient permissions to finalize this sale",
                rule="insufficient_permissions",
            )

        # Everything agreed must have been received, gap included. Reservations
        # engaged before E4-T5 have no agreed total: the catalogue price.
        agreed = (
            reservation.agreed_total_price
            if reservation.agreed_total_price is not None
            else (lot.price or 0.0)
        )
        due = remaining(
            agreed, await self.received_repo.total_for_reservation(reservation.id)
        )
        if to_cents(due) > 0:
            raise BusinessRuleError(
                message=(
                    f"Reste à payer : {format_mad(due)} MAD — la réservation "
                    "ne peut pas être soldée."
                ),
                rule="amount_still_due",
            )

        sale = await self.sale_repo.create(
            project_id=lot.project_id,
            lot_id=lot_id,
            client_id=reservation.client_id,
            price=agreed,
            sold_by_user_id=user_id,
            reservation_id=lot.current_reservation_id,
            notes=sale_data.notes,
        )

        await self.reservation_repo.update(
            lot.current_reservation_id, status="converted"
        )
        await self.lot_repo.change_status(
            lot_id, new_status, transition="solde", user_id=user_id
        )

        project = await self.project_repo.get_by_id(lot.project_id)
        if project:
            await self.project_repo.update_lot_counts(
                lot.project_id,
                sold_lots=project.sold_lots + 1,
            )

        logger.info(
            "Lot marked as soldee — sale created",
            lot_id=lot_id,
            sale_id=sale.id,
            price=agreed,
        )

        return SaleResponse(
            id=sale.id,
            project_id=sale.project_id,
            lot_id=sale.lot_id,
            client_id=sale.client_id,
            reservation_id=sale.reservation_id,
            sold_by_user_id=sale.sold_by_user_id,
            sale_date=sale.sale_date,
            price=sale.price,
            notes=sale.notes,
            created_at=sale.created_at,
        )

    # ------------------------------------------------------------------
    # Transition: reservation_soldee | edl_finalise → chez_notaire
    # ------------------------------------------------------------------

    async def soldee_to_notaire(
        self,
        lot_id: int,
        data: ChezNotaireData,
        user_id: int | None = None,
    ) -> LotResponse:
        """Move to chez_notaire with notary info.

        From reservation_soldee when the project has no état des lieux, from
        edl_finalise when it has one (checked by ``assert_transition_allowed``).

        Raises:
            NotFoundError: If lot not found
            BusinessRuleError: If lot is not in reservation_soldee /
                edl_finalise status, EDL required (``edl_required``) or
                notaire intent not set
        """
        lot = await self.lot_repo.get_by_id(lot_id)
        if not lot:
            raise NotFoundError("Lot", lot_id)

        if lot.status not in ("reservation_soldee", "edl_finalise"):
            raise BusinessRuleError(
                message=(
                    "Lot must be in reservation_soldee or edl_finalise status "
                    f"(current: {lot.status})"
                ),
                rule="invalid_lot_status",
            )
        new_status = assert_transition_allowed(
            await self._enabled_optional(lot), "notaire", lot.status
        )

        # Guard : le client doit avoir exprimé son souhait de passer chez le notaire
        if lot.current_reservation_id:
            current_res = await self.reservation_repo.get_by_id(
                lot.current_reservation_id
            )
            if current_res and not current_res.wants_notaire:
                raise BusinessRuleError(
                    message=(
                        "Le client n'a pas encore confirmé son souhait de passer chez le notaire. "
                        "Activez d'abord le tag 'Chez le notaire' sur ce lot."
                    ),
                    rule="notaire_intent_not_set",
                )

        notaire = await self.notaire_repo.get_by_id(data.notaire_id)
        if not notaire:
            raise NotFoundError("Notaire", data.notaire_id)

        if lot.current_reservation_id:
            await self.reservation_repo.update(
                lot.current_reservation_id,
                notaire_id=data.notaire_id,
                notary_name=f"{notaire.prenom} {notaire.nom}",
                notary_date=data.notary_date,
                notes=data.notes,
            )

        await self.lot_repo.change_status(
            lot_id, new_status, transition="notaire", user_id=user_id
        )

        logger.info(
            "Lot moved to chez_notaire", lot_id=lot_id, notaire_id=data.notaire_id
        )
        updated_lot = await self.lot_repo.get_by_id(lot_id)
        return LotResponse.model_validate(updated_lot)

    async def update_notaire_info(
        self,
        lot_id: int,
        data: ChezNotaireData,
        user_id: int | None = None,
    ) -> LotResponse:
        """Update notary info for a lot already in chez_notaire status.

        Raises:
            NotFoundError: If lot not found
            BusinessRuleError: If lot is not in chez_notaire status
        """
        lot = await self.lot_repo.get_by_id(lot_id)
        if not lot:
            raise NotFoundError("Lot", lot_id)

        if lot.status != "chez_notaire":
            raise BusinessRuleError(
                message=f"Lot must be in chez_notaire status (current: {lot.status})",
                rule="invalid_lot_status",
            )
        assert_transition_allowed(
            await self._enabled_optional(lot), "notaire_update", lot.status
        )

        notaire = await self.notaire_repo.get_by_id(data.notaire_id)
        if not notaire:
            raise NotFoundError("Notaire", data.notaire_id)

        if lot.current_reservation_id:
            await self.reservation_repo.update(
                lot.current_reservation_id,
                notaire_id=data.notaire_id,
                notary_name=f"{notaire.prenom} {notaire.nom}",
                notary_date=data.notary_date,
            )

        logger.info("Notaire info updated", lot_id=lot_id, notaire_id=data.notaire_id)
        updated_lot = await self.lot_repo.get_by_id(lot_id)
        return LotResponse.model_validate(updated_lot)

    # ------------------------------------------------------------------
    # Transition: chez_notaire → chez_proprietaire
    # ------------------------------------------------------------------

    async def notaire_to_proprietaire(
        self,
        lot_id: int,
        user_id: int | None = None,
    ) -> LotResponse:
        """Confirm notarial act received: chez_notaire → chez_proprietaire.

        Raises:
            NotFoundError: If lot not found
            BusinessRuleError: If lot is not in chez_notaire status
        """
        lot = await self.lot_repo.get_by_id(lot_id)
        if not lot:
            raise NotFoundError("Lot", lot_id)

        if lot.status != "chez_notaire":
            raise BusinessRuleError(
                message=f"Lot must be in chez_notaire status (current: {lot.status})",
                rule="invalid_lot_status",
            )
        new_status = assert_transition_allowed(
            await self._enabled_optional(lot), "proprietaire", lot.status
        )

        await self.lot_repo.change_status(
            lot_id, new_status, transition="proprietaire", user_id=user_id
        )

        if lot.current_reservation_id:
            await self.reservation_repo.update(
                lot.current_reservation_id,
                closed_at=datetime.now(UTC),
            )

        logger.info("Lot confirmed chez_proprietaire", lot_id=lot_id)
        updated_lot = await self.lot_repo.get_by_id(lot_id)
        return LotResponse.model_validate(updated_lot)

    # ------------------------------------------------------------------
    # Block and unblock transitions
    # ------------------------------------------------------------------

    async def block_lot(
        self,
        lot_id: int,
        data: BlockLotData,
        user_id: int | None = None,
    ) -> LotResponse:
        """Block a lot (any status except chez_proprietaire → blocked).

        Raises:
            NotFoundError: If lot not found
            BusinessRuleError: If lot is already blocked or is chez_proprietaire
        """
        lot = await self.lot_repo.get_by_id(lot_id)
        if not lot:
            raise NotFoundError("Lot", lot_id)

        if lot.status in ("blocked", "chez_proprietaire"):
            raise BusinessRuleError(
                message=f"Cannot block lot with status '{lot.status}'",
                rule="invalid_lot_status",
            )
        new_status = assert_transition_allowed(
            await self._enabled_optional(lot), "block", lot.status
        )

        await self.lot_repo.change_status(
            lot_id,
            new_status,
            transition="block",
            user_id=user_id,
            blocked_reason=data.reason or "",
        )

        logger.info("Lot blocked", lot_id=lot_id, reason=data.reason)
        updated_lot = await self.lot_repo.get_by_id(lot_id)
        return LotResponse.model_validate(updated_lot)

    async def unblock_lot(
        self,
        lot_id: int,
        data: UnblockLotData | None = None,
        user_id: int | None = None,
    ) -> LotResponse:
        """Unblock a lot: blocked → available.

        Raises:
            NotFoundError: If lot not found
            BusinessRuleError: If lot is not blocked
        """
        lot = await self.lot_repo.get_by_id(lot_id)
        if not lot:
            raise NotFoundError("Lot", lot_id)

        if lot.status != "blocked":
            raise BusinessRuleError(
                message=f"Lot is not blocked (current: {lot.status})",
                rule="invalid_lot_status",
            )
        new_status = assert_transition_allowed(
            await self._enabled_optional(lot), "unblock", lot.status
        )

        await self.lot_repo.change_status(
            lot_id,
            new_status,
            transition="unblock",
            user_id=user_id,
            blocked_reason="",
        )

        logger.info("Lot unblocked", lot_id=lot_id)
        updated_lot = await self.lot_repo.get_by_id(lot_id)
        return LotResponse.model_validate(updated_lot)

    # ------------------------------------------------------------------
    # Extend option
    # ------------------------------------------------------------------

    async def extend_option(
        self,
        lot_id: int,
        additional_days: int,
    ) -> ReservationResponse:
        """Extend an option expiration date by adding days.

        Raises:
            NotFoundError: If lot not found
            BusinessRuleError: If lot is not in option or reservation_a_finaliser status
        """
        lot = await self.lot_repo.get_by_id(lot_id)
        if not lot:
            raise NotFoundError("Lot", lot_id)

        if lot.status not in ("option", "reservation_a_finaliser"):
            raise BusinessRuleError(
                message=f"Lot must be in option or reservation_a_finaliser status (current: {lot.status})",
                rule="invalid_lot_status",
            )

        if not lot.current_reservation_id:
            raise BusinessRuleError(
                message="No active reservation found for this lot",
                rule="no_active_reservation",
            )

        reservation = await self.reservation_repo.get_by_id(lot.current_reservation_id)
        if not reservation:
            raise NotFoundError("Reservation", lot.current_reservation_id)

        current_expiration = reservation.expiration_date
        if current_expiration.tzinfo is None:
            current_expiration = current_expiration.replace(tzinfo=UTC)

        new_expiration = current_expiration + timedelta(days=additional_days)

        # Append extension to notes for audit trail
        extension_note = (
            f"[{datetime.now(UTC).strftime('%d/%m/%Y')}] "
            f"Prolongation +{additional_days}j → {new_expiration.strftime('%d/%m/%Y')}"
        )
        current_notes = reservation.notes or ""
        new_notes = (
            f"{current_notes}\n{extension_note}".strip()
            if current_notes
            else extension_note
        )

        updated = await self.reservation_repo.update(
            reservation.id,
            expiration_date=new_expiration,
            notes=new_notes,
        )

        logger.info(
            "Option extended",
            lot_id=lot_id,
            additional_days=additional_days,
            new_expiration=str(new_expiration),
        )
        return await self._to_response(updated)

    # ------------------------------------------------------------------
    # Legacy compatibility — kept for existing endpoints / tests
    # ------------------------------------------------------------------

    async def create_reservation(
        self,
        data: ReservationCreate,
        user_id: int | None = None,
    ) -> ReservationResponse:
        """Legacy: create reservation (maps to start_option_for_lot).

        Converts ReservationCreate to OptionCreate semantics.
        """
        expiration_date = data.expiration_date or (
            datetime.now(UTC) + timedelta(days=data.reservation_days)
        )
        option_data = OptionCreate(
            client_id=data.client_id,
            expiration_date=expiration_date,
            deposit=data.deposit,
            deposit_date=data.deposit_date,
            notes=data.notes,
        )
        return await self.start_option_for_lot(data.lot_id, option_data, user_id)

    async def release_reservation(
        self,
        reservation_id: int,
        user_id: int,
        user_role: str,
        data: ReservationRelease | None = None,
    ) -> ReservationResponse:
        """Legacy: release reservation — resolves lot_id from reservation then calls cancel_option."""
        reservation = await self.reservation_repo.get_by_id(reservation_id)
        if not reservation:
            raise NotFoundError("Reservation", reservation_id)

        lot = await self.lot_repo.get_by_id(reservation.lot_id)
        if not lot:
            raise NotFoundError("Lot", reservation.lot_id)

        reason = data.release_reason if data else None
        await self.cancel_option(reservation.lot_id, user_id, user_role, reason)

        updated = await self.reservation_repo.get_by_id(reservation_id)
        return await self._to_response(updated)

    async def extend_reservation(
        self,
        reservation_id: int,
        additional_days: int,
    ) -> ReservationResponse:
        """Legacy: extend reservation — resolves lot_id then calls extend_option."""
        reservation = await self.reservation_repo.get_by_id(reservation_id)
        if not reservation:
            raise NotFoundError("Reservation", reservation_id)
        return await self.extend_option(reservation.lot_id, additional_days)

    async def convert_to_sale(
        self,
        reservation_id: int,
        sale_data: SaleFromReservation,
        user_id: int | None = None,
        user_role: str | None = None,
    ) -> SaleResponse:
        """Legacy: convert_to_sale — requires lot to be in reservation_engagee status."""
        reservation = await self.reservation_repo.get_by_id(reservation_id)
        if not reservation:
            raise NotFoundError("Reservation", reservation_id)
        return await self.engagee_to_soldee(
            reservation.lot_id, sale_data, user_id, user_role
        )

    async def check_expirations(self) -> int:
        """Legacy: replaced by get_expired_alerts (no mutations).

        Returns count for backward compatibility but makes NO status changes.
        """
        alerts = await self.get_expired_alerts()
        return alerts["count"]
