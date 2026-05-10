"""Reservation service — lot workflow transitions and reservation management."""

from datetime import date, datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleError, NotFoundError
from app.core.logging import get_logger
from app.domain.schemas.lot import LotResponse
from app.domain.schemas.payment import InstallmentConfig
from app.domain.schemas.reservation import (
    BlockLotData,
    ChezNotaireData,
    DirectToEngageeData,
    DirectToRAFData,
    FinaliserEngageData,
    FinaliserRefundData,
    MarkPromotionReceivedData,
    OptionCreate,
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
from app.infrastructure.database.models import ReservationModel
from app.infrastructure.database.repositories import (
    ClientRepository,
    LotPricingConfigRepository,
    LotRepository,
    NotaireRepository,
    PaymentRepository,
    ProjectRepository,
    ReservationRepository,
    SaleRepository,
)

logger = get_logger(__name__)


def _reservation_to_response(r: ReservationModel) -> ReservationResponse:
    """Convert a ReservationModel to ReservationResponse."""
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
        return [_reservation_to_response(r) for r in reservations]

    async def get_reservation(self, reservation_id: int) -> ReservationResponse:
        """Get reservation by ID.

        Raises:
            NotFoundError: If reservation not found
        """
        reservation = await self.reservation_repo.get_by_id(reservation_id)
        if not reservation:
            raise NotFoundError("Reservation", reservation_id)
        return _reservation_to_response(reservation)

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

        await self.lot_repo.update(lot_id, status="option", current_reservation_id=reservation.id)

        logger.info("Option started", lot_id=lot_id, reservation_id=reservation.id, user_id=user_id)
        return _reservation_to_response(reservation)

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

        if lot.current_reservation_id:
            reservation = await self.reservation_repo.get_by_id(lot.current_reservation_id)
            if reservation:
                if user_role != "manager" and reservation.reserved_by_user_id != user_id:
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

        await self.lot_repo.release_lot(lot_id, status="available")

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

        await self.lot_repo.update(
            lot_id,
            status="reservation_a_finaliser",
            current_reservation_id=reservation.id,
        )

        logger.info(
            "Direct available → reservation_a_finaliser",
            lot_id=lot_id,
            reservation_id=reservation.id,
            guarantee_amount=data.guarantee_amount,
        )
        updated = await self.reservation_repo.get_by_id(reservation.id)
        return _reservation_to_response(updated)  # type: ignore[arg-type]

    # ------------------------------------------------------------------
    # Private helper: create payment schedule inline during engagement
    # ------------------------------------------------------------------

    async def _create_payment_schedule_from_plan(
        self,
        reservation_id: int,
        lot_price: float,
        plan: PaymentPlanData,
        promotion_amount: float = 0.0,
    ) -> None:
        """Create a payment schedule atomically as part of an engagement transition.

        Uses the same logic as PaymentService.create_schedule but is called inline
        so the schedule is created in the same transaction as the lot status change.
        Silently skipped if a schedule already exists.

        The deposit % applies to the catalogue price (lot_price + promotion_amount);
        the promotion is then subtracted from the deposit gross to get the net
        installments. Balance = catalogue × balance_pct% = lot_price − deposit_net.
        """
        from app.services.payment_service import _add_months, _generate_due_dates, _split_amount

        existing = await self.payment_repo.get_by_reservation(reservation_id)
        if existing:
            return

        deposit_pct = round(plan.deposit_pct, 4)
        balance_pct = round(100.0 - deposit_pct, 4)
        promo = max(0.0, promotion_amount or 0.0)
        catalogue_price = round(lot_price + promo, 2)
        deposit_gross = round(catalogue_price * deposit_pct / 100, 2)
        deposit_total = max(0.0, round(deposit_gross - promo, 2))
        balance_total = max(0.0, round(lot_price - deposit_total, 2))

        schedule = await self.payment_repo.create(
            reservation_id=reservation_id,
            lot_price=lot_price,
            deposit_pct=deposit_pct,
            balance_pct=balance_pct,
            deposit_total=deposit_total,
            balance_total=balance_total,
            balance_delay_months=plan.balance_delay_months,
        )

        deposit_start = plan.deposit_start_date or datetime.now(timezone.utc)

        dep_cfg = InstallmentConfig(
            count=plan.deposit_count,
            periodicity_months=plan.deposit_periodicity,
        )
        bal_cfg = InstallmentConfig(
            count=plan.balance_count,
            periodicity_months=plan.balance_periodicity,
        )

        deposit_dates = _generate_due_dates(deposit_start, dep_cfg)
        deposit_amounts = _split_amount(deposit_total, plan.deposit_count)

        for i, (due, amount) in enumerate(zip(deposit_dates, deposit_amounts, strict=True)):
            await self.payment_repo.create_installment(
                schedule_id=schedule.id,
                payment_type="deposit",
                installment_number=i + 1,
                amount=amount,
                due_date=due,
            )

        last_deposit_date = deposit_dates[-1]
        balance_start = _add_months(last_deposit_date, plan.balance_delay_months)

        balance_dates = _generate_due_dates(balance_start, bal_cfg)
        balance_amounts = _split_amount(balance_total, plan.balance_count)

        for i, (due, amount) in enumerate(zip(balance_dates, balance_amounts, strict=True)):
            await self.payment_repo.create_installment(
                schedule_id=schedule.id,
                payment_type="balance",
                installment_number=i + 1,
                amount=amount,
                due_date=due,
            )

        logger.info(
            "Payment schedule created inline during engagement",
            reservation_id=reservation_id,
            lot_price=lot_price,
            deposit_pct=deposit_pct,
            deposit_total=deposit_total,
            balance_total=balance_total,
            promotion_amount=promo,
            deposit_count=plan.deposit_count,
            balance_count=plan.balance_count,
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

        client = await self.client_repo.get_by_id(data.client_id)
        if not client:
            raise NotFoundError("Client", data.client_id)

        reservation = await self.reservation_repo.create(
            project_id=lot.project_id,
            lot_id=lot_id,
            client_id=data.client_id,
            reserved_by_user_id=user_id,
            expiration_date=datetime.now(timezone.utc) + timedelta(days=365),
            deposit=0,
            notes=data.notes,
        )

        # Auto-fill sale_price from pricing config if not provided
        if data.sale_price is None:
            pricing_cfg = await self.pricing_repo.get_for_combination(
                lot.project_id, lot.zone, lot.type_lot, lot.type_maison, lot.emplacement
            )
            if pricing_cfg and lot.surface:
                data.sale_price = round(pricing_cfg.prix_m2_acte * lot.surface, 2)

        # Compute promotion amount
        promotion_amount: float | None = None
        if data.sale_price is not None and lot.price is not None:
            diff = round(lot.price - data.sale_price, 2)
            promotion_amount = diff if diff > 0 else 0.0

        reservation_update: dict = {
            "guarantee_amount": data.guarantee_amount,
            "payment_type": data.payment_type,
        }
        if data.sale_price is not None:
            reservation_update["sale_price"] = data.sale_price
        if promotion_amount is not None:
            reservation_update["promotion_amount"] = promotion_amount
        if data.promotion_paid_timing is not None:
            reservation_update["promotion_paid_timing"] = data.promotion_paid_timing
        if data.promotion_received:
            reservation_update["promotion_received"] = True

        await self.reservation_repo.update(reservation.id, **reservation_update)

        await self.lot_repo.update(
            lot_id,
            status="reservation_engagee",
            current_reservation_id=reservation.id,
        )

        # Create payment schedule if plan provided
        if data.payment_plan is not None:
            schedule_price = data.sale_price if data.sale_price is not None else (lot.price or 0)
            await self._create_payment_schedule_from_plan(
                reservation_id=reservation.id,
                lot_price=schedule_price,
                plan=data.payment_plan,
                promotion_amount=promotion_amount or 0.0,
            )

        logger.info(
            "Direct available → reservation_engagee",
            lot_id=lot_id,
            reservation_id=reservation.id,
            guarantee_amount=data.guarantee_amount,
            sale_price=data.sale_price,
            promotion_amount=promotion_amount,
        )
        updated = await self.reservation_repo.get_by_id(reservation.id)
        return _reservation_to_response(updated)  # type: ignore[arg-type]

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

        await self.lot_repo.update(lot_id, status="reservation_a_finaliser")

        logger.info(
            "Lot moved to reservation_a_finaliser",
            lot_id=lot_id,
            guarantee_amount=data.guarantee_amount,
        )
        return _reservation_to_response(updated)

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

        if lot.current_reservation_id:
            reservation = await self.reservation_repo.get_by_id(lot.current_reservation_id)
            if reservation:
                if user_role != "manager" and reservation.reserved_by_user_id != user_id:
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

        await self.lot_repo.release_lot(lot_id, status="available")

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

        current_reservation = None
        if lot.current_reservation_id:
            current_reservation = await self.reservation_repo.get_by_id(lot.current_reservation_id)
            if current_reservation:
                if user_role != "manager" and current_reservation.reserved_by_user_id != user_id:
                    raise BusinessRuleError(
                        message="Insufficient permissions",
                        rule="insufficient_permissions",
                    )

        guarantee_action = data.guarantee_action if data else "deduct"

        # Auto-fill sale_price from pricing config if not provided
        if data and data.sale_price is None:
            pricing_cfg = await self.pricing_repo.get_for_combination(
                lot.project_id, lot.zone, lot.type_lot, lot.type_maison, lot.emplacement
            )
            if pricing_cfg and lot.surface:
                data.sale_price = round(pricing_cfg.prix_m2_acte * lot.surface, 2)

        # Compute promotion amount = prix catalogue - prix de vente
        promotion_amount: float | None = None
        if data and data.sale_price is not None and lot.price is not None:
            diff = round(lot.price - data.sale_price, 2)
            promotion_amount = diff if diff > 0 else 0.0

        # Persist price/promotion/refund info on the reservation
        if current_reservation:
            update_kwargs: dict = {}
            if data and data.sale_price is not None:
                update_kwargs["sale_price"] = data.sale_price
            if promotion_amount is not None:
                update_kwargs["promotion_amount"] = promotion_amount
            if data and data.promotion_paid_timing is not None:
                update_kwargs["promotion_paid_timing"] = data.promotion_paid_timing
            if data and data.promotion_received:
                update_kwargs["promotion_received"] = True
            # Refund fields (when guarantee_action == 'refund')
            if guarantee_action == "refund" and data:
                if data.refund_amount is not None:
                    update_kwargs["deposit_refund_amount"] = data.refund_amount
                if data.refund_date is not None:
                    update_kwargs["deposit_refund_date"] = data.refund_date
                if data.refund_payment_type is not None:
                    update_kwargs["deposit_refund_payment_type"] = data.refund_payment_type
            if update_kwargs:
                await self.reservation_repo.update(current_reservation.id, **update_kwargs)

        await self.lot_repo.update(lot_id, status="reservation_engagee")

        # Create payment schedule if plan provided
        # When guarantee is deducted it counts as first payment → subtract from plan base
        if data and data.payment_plan is not None and current_reservation:
            base_price = data.sale_price if data.sale_price is not None else (lot.price or 0)
            if guarantee_action == "deduct" and current_reservation.guarantee_amount:
                base_price = max(0.0, base_price - current_reservation.guarantee_amount)
            await self._create_payment_schedule_from_plan(
                reservation_id=current_reservation.id,
                lot_price=base_price,
                plan=data.payment_plan,
                promotion_amount=promotion_amount or 0.0,
            )

        logger.info(
            "Lot engaged (finaliser → engagee)",
            lot_id=lot_id,
            guarantee_action=guarantee_action,
            sale_price=data.sale_price if data else None,
            promotion_amount=promotion_amount,
        )
        updated_lot = await self.lot_repo.get_by_id(lot_id)
        return LotResponse.model_validate(updated_lot)

    # ------------------------------------------------------------------
    # Mark promotion received on an engaged reservation
    # ------------------------------------------------------------------

    async def mark_promotion_received(
        self,
        reservation_id: int,
        data: MarkPromotionReceivedData,
        user_id: int | None = None,
    ) -> ReservationResponse:
        """Mark the promotion amount as received for a reservation_engagee lot.

        Raises:
            NotFoundError: If reservation not found
            BusinessRuleError: If lot is not in reservation_engagee status or promotion already received
        """
        reservation = await self.reservation_repo.get_by_id(reservation_id)
        if not reservation:
            raise NotFoundError("Reservation", reservation_id)

        lot = await self.lot_repo.get_by_id(reservation.lot_id)
        if not lot or lot.status != "reservation_engagee":
            raise BusinessRuleError(
                message="Le lot doit être en statut réservation engagée",
                rule="invalid_lot_status",
            )

        if reservation.promotion_received:
            raise BusinessRuleError(
                message="La promotion a déjà été marquée comme reçue",
                rule="promotion_already_received",
            )

        date_str = data.received_date.strftime("%d/%m/%Y") if data.received_date else date.today().strftime("%d/%m/%Y")
        note_suffix = f"[{date_str}] Montant promotion reçu."
        current_notes = reservation.notes or ""
        new_notes = f"{current_notes}\n{note_suffix}".strip() if current_notes else note_suffix

        updated = await self.reservation_repo.update(
            reservation_id,
            promotion_received=True,
            notes=new_notes,
        )

        logger.info(
            "Promotion reçue enregistrée",
            reservation_id=reservation_id,
            promotion_amount=reservation.promotion_amount,
            user_id=user_id,
        )
        return _reservation_to_response(updated)

    # ------------------------------------------------------------------
    # Set notaire intent on a reservation_soldee lot
    # ------------------------------------------------------------------

    async def set_notaire_intent(
        self,
        lot_id: int,
        data: SetNotaireIntentData,
        user_id: int | None = None,
    ) -> ReservationResponse:
        """Toggle the wants_notaire tag on a reservation_soldee lot.

        Allows commercials/managers to record whether the client wants to
        proceed to the notary step or stay in reservation_soldee.

        Raises:
            NotFoundError: If lot not found or no active reservation
            BusinessRuleError: If lot is not in reservation_soldee status
        """
        lot = await self.lot_repo.get_by_id(lot_id)
        if not lot:
            raise NotFoundError("Lot", lot_id)

        if lot.status != "reservation_soldee":
            raise BusinessRuleError(
                message=f"Le lot doit être en statut réservation soldée (actuel : {lot.status})",
                rule="invalid_lot_status",
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
            update_kwargs["notes"] = f"{current}\n{note_line}".strip() if current else note_line

        updated = await self.reservation_repo.update(reservation.id, **update_kwargs)

        logger.info(
            "Notaire intent set",
            lot_id=lot_id,
            wants_notaire=data.wants_notaire,
            user_id=user_id,
        )
        return _reservation_to_response(updated)

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

        Creates SaleModel record.

        Raises:
            NotFoundError: If lot not found
            BusinessRuleError: If lot is not in reservation_engagee status
        """
        lot = await self.lot_repo.get_by_id(lot_id)
        if not lot:
            raise NotFoundError("Lot", lot_id)

        if lot.status != "reservation_engagee":
            raise BusinessRuleError(
                message=f"Lot must be in reservation_engagee status (current: {lot.status})",
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

        if user_role and user_role != "manager" and reservation.reserved_by_user_id != user_id:
            raise BusinessRuleError(
                message="Insufficient permissions to finalize this sale",
                rule="insufficient_permissions",
            )

        # --- Validation : reçus de paiement ---
        # Si un échéancier existe, tous les versements doivent être encaissés
        payment_schedule = await self.payment_repo.get_by_reservation(lot.current_reservation_id)
        if payment_schedule:
            unpaid = [i for i in payment_schedule.installments if i.status != "paid"]
            if unpaid:
                raise BusinessRuleError(
                    message=(
                        f"{len(unpaid)} versement(s) non encaissé(s) — tous les versements "
                        "doivent être soldés avant de marquer le lot comme soldé"
                    ),
                    rule="unpaid_installments",
                )

        # Si promotion non reçue et timing 'fin' → bloquer avant de solder
        if (
            reservation.promotion_amount
            and reservation.promotion_amount > 0
            and not reservation.promotion_received
            and reservation.promotion_paid_timing == "fin"
        ):
            raise BusinessRuleError(
                message=(
                    f"La différence de promotion ({reservation.promotion_amount:,.0f} MAD) "
                    "doit être reçue avant de marquer le lot comme soldé "
                    "(promotion prévue en fin de paiement)"
                ),
                rule="promotion_not_received",
            )

        sale = await self.sale_repo.create(
            project_id=lot.project_id,
            lot_id=lot_id,
            client_id=reservation.client_id,
            price=sale_data.price,
            sold_by_user_id=user_id,
            reservation_id=lot.current_reservation_id,
            notes=sale_data.notes,
        )

        await self.reservation_repo.update(lot.current_reservation_id, status="converted")
        await self.lot_repo.update(lot_id, status="reservation_soldee")

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
            price=sale_data.price,
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
    # Transition: reservation_soldee → chez_notaire
    # ------------------------------------------------------------------

    async def soldee_to_notaire(
        self,
        lot_id: int,
        data: ChezNotaireData,
        user_id: int | None = None,
    ) -> LotResponse:
        """Move from reservation_soldee to chez_notaire with notary info.

        Raises:
            NotFoundError: If lot not found
            BusinessRuleError: If lot is not in reservation_soldee status
        """
        lot = await self.lot_repo.get_by_id(lot_id)
        if not lot:
            raise NotFoundError("Lot", lot_id)

        if lot.status != "reservation_soldee":
            raise BusinessRuleError(
                message=f"Lot must be in reservation_soldee status (current: {lot.status})",
                rule="invalid_lot_status",
            )

        # Guard : le client doit avoir exprimé son souhait de passer chez le notaire
        if lot.current_reservation_id:
            current_res = await self.reservation_repo.get_by_id(lot.current_reservation_id)
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

        await self.lot_repo.update(lot_id, status="chez_notaire")

        logger.info("Lot moved to chez_notaire", lot_id=lot_id, notaire_id=data.notaire_id)
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

        await self.lot_repo.update(lot_id, status="chez_proprietaire")

        logger.info("Lot confirmed chez_proprietaire", lot_id=lot_id)
        updated_lot = await self.lot_repo.get_by_id(lot_id)
        return LotResponse.model_validate(updated_lot)

    # ------------------------------------------------------------------
    # Transitions: block / unblock
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

        await self.lot_repo.update(lot_id, status="blocked")

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

        await self.lot_repo.update(lot_id, status="available")

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
            current_expiration = current_expiration.replace(tzinfo=timezone.utc)

        new_expiration = current_expiration + timedelta(days=additional_days)

        # Append extension to notes for audit trail
        extension_note = (
            f"[{datetime.now(timezone.utc).strftime('%d/%m/%Y')}] "
            f"Prolongation +{additional_days}j → {new_expiration.strftime('%d/%m/%Y')}"
        )
        current_notes = reservation.notes or ""
        new_notes = f"{current_notes}\n{extension_note}".strip() if current_notes else extension_note

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
        return _reservation_to_response(updated)

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
            datetime.now(timezone.utc) + timedelta(days=data.reservation_days)
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
        return _reservation_to_response(updated)

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
