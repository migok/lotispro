"""Reservation deed (acte de réservation) and payment receipt.

Builds both PDFs from a reservation (single source of the rules that gate
them) and archives the deed as a lot document on every engagement.
"""

from dataclasses import dataclass
from datetime import date, datetime
from typing import Literal

from fastapi.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleError, NotFoundError
from app.core.logging import get_logger
from app.domain.schemas.payment import PaymentInstallmentResponse
from app.infrastructure.database.models import LotDocumentModel
from app.infrastructure.database.repositories import (
    LotDocumentRepository,
    LotRepository,
    ReservationRepository,
)
from app.services.certificate_service import CertificateService
from app.services.document_service import DocumentService
from app.services.payment_service import PaymentService

logger = get_logger(__name__)

ACTE_CATEGORY = "acte_reservation"

# ``ActeNotReadyError.rule`` values.
DEPOSIT_UNPAID = "first_deposit_unpaid"
PROMOTION_PENDING = "promotion_not_received"

_DEPOSIT_UNPAID_ACTE = (
    "Le premier versement d'acompte doit être effectué "
    "avant de générer l'acte de réservation."
)
_DEPOSIT_UNPAID_RECEIPT = (
    "Le premier versement d'acompte doit être effectué "
    "avant de générer le reçu de paiement."
)
_PROMOTION_PENDING_ACTE = (
    "Le montant de la promotion n'a pas encore été reçu. "
    "Téléchargez le reçu de paiement en attendant la réception de la promotion."
)


class ActeNotReadyError(BusinessRuleError):
    """The deed (or receipt) cannot be produced yet; ``rule`` says why."""


@dataclass(frozen=True)
class ActeResult:
    """Outcome of :meth:`ActeService.generate_and_store` (never raises)."""

    status: Literal["stored", "not_ready", "failed"]
    document_id: int | None = None
    error: str | None = None


def _safe_lot(numero: str) -> str:
    return numero.replace("/", "-").replace(" ", "_")


def _as_date(value: date | datetime | None) -> date | None:
    return value.date() if isinstance(value, datetime) else value


def _promotion_pending(details: dict) -> bool:
    return (details.get("promotion_amount") or 0) > 0 and not details.get(
        "promotion_received"
    )


class ActeService:
    """Build the deed / receipt PDFs and archive the deed."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.reservation_repo = ReservationRepository(session)
        self.lot_repo = LotRepository(session)
        self.doc_repo = LotDocumentRepository(session)
        self.payment_service = PaymentService(session)
        self.document_service = DocumentService(session)
        self.certificate_service = CertificateService()

    async def load_details(self, reservation_id: int) -> dict:
        """Reservation details used by the PDFs.

        Raises:
            NotFoundError: Reservation not found.
        """
        details = await self.reservation_repo.get_with_details(reservation_id)
        if not details:
            raise NotFoundError("Reservation", reservation_id)
        return details

    async def build_certificate_pdf(
        self, reservation_id: int, *, require_paid_deposit: bool = True
    ) -> tuple[bytes, str]:
        """Return the deed PDF and its file name.

        ``require_paid_deposit=False`` (engagement / regeneration) skips the
        "first deposit paid" rule: at engagement the first payment is by
        definition received. The deed then shows the paid first installment
        if there is one, otherwise the ``guarantee_amount`` received at
        engagement (see :meth:`_received_deposit`).

        Raises:
            NotFoundError: Reservation not found.
            ActeNotReadyError: First deposit unpaid, or promotion not received.
        """
        details = await self.load_details(reservation_id)
        return await self._render_certificate(details, require_paid_deposit)

    async def build_receipt_pdf(self, reservation_id: int) -> tuple[bytes, str]:
        """Return the payment receipt PDF (first deposit) and its file name.

        Available while the promotion is pending.

        Raises:
            NotFoundError: Reservation not found.
            ActeNotReadyError: First deposit unpaid.
        """
        details = await self.load_details(reservation_id)
        deposit = details["deposit"]
        deposit_date = details.get("deposit_date")

        first, _ = await self._first_deposit(reservation_id)
        if first is not None:
            if first.status != "paid":
                raise ActeNotReadyError(_DEPOSIT_UNPAID_RECEIPT, rule=DEPOSIT_UNPAID)
            deposit = first.amount
            if first.paid_date:
                deposit_date = (
                    first.paid_date.date()
                    if hasattr(first.paid_date, "date")
                    else first.paid_date
                )

        pdf = await run_in_threadpool(
            self.certificate_service.generate_payment_receipt,
            reservation_id=details["id"],
            receipt_date=details["reservation_date"],
            deposit_amount=deposit,
            deposit_date=deposit_date,
            lot_numero=details["lot_numero"],
            lot_surface=details.get("lot_surface"),
            sale_price=details.get("sale_price"),
            promotion_amount=details.get("promotion_amount"),
            project_name=details["project_name"],
            client_name=details["client_name"],
            client_cin=details.get("client_cin"),
            client_address=details.get("client_address"),
        )
        filename = (
            f"recu_paiement_{reservation_id}_lot{_safe_lot(details['lot_numero'])}.pdf"
        )
        return pdf, filename

    async def generate_and_store(
        self, reservation_id: int, user_id: int | None
    ) -> ActeResult:
        """Generate the deed and archive it as a new lot document.

        Never raises. Everything runs in a SAVEPOINT: if the PDF or the upload
        fails, the savepoint is rolled back (no document row is left) while
        the caller's transaction (e.g. the engagement) stays intact.
        """
        try:
            async with self.session.begin_nested():
                details = await self.load_details(reservation_id)
                content, filename = await self._render_certificate(
                    details, require_paid_deposit=False
                )
                doc = await self.document_service.store_generated_document(
                    lot_id=details["lot_id"],
                    reservation_id=reservation_id,
                    filename=filename,
                    content=content,
                    content_type="application/pdf",
                    category=ACTE_CATEGORY,
                    user_id=user_id,
                )
        except ActeNotReadyError as exc:
            logger.info(
                "Acte not generated yet",
                reservation_id=reservation_id,
                rule=exc.rule,
            )
            return ActeResult(status="not_ready", error=exc.message)
        except Exception as exc:
            logger.exception("Acte generation failed", reservation_id=reservation_id)
            return ActeResult(status="failed", error=str(exc))

        logger.info("Acte archived", reservation_id=reservation_id, document_id=doc.id)
        return ActeResult(status="stored", document_id=doc.id)

    async def latest_acte(self, reservation_id: int) -> LotDocumentModel | None:
        """Most recent archived deed of a reservation, if any."""
        return await self.doc_repo.get_latest_by_reservation(
            reservation_id, ACTE_CATEGORY
        )

    async def _first_deposit(
        self, reservation_id: int
    ) -> tuple[PaymentInstallmentResponse | None, float | None]:
        """First deposit installment and the schedule's lot price.

        ``(None, None)`` when the reservation has no payment schedule.
        """
        try:
            schedule = await self.payment_service.get_schedule_for_reservation(
                reservation_id
            )
        except NotFoundError:
            return None, None
        deposits = sorted(
            (i for i in schedule.installments if i.payment_type == "deposit"),
            key=lambda i: i.installment_number,
        )
        return (deposits[0] if deposits else None), schedule.lot_price

    async def _received_deposit(
        self, details: dict, first: PaymentInstallmentResponse | None
    ) -> tuple[float, date | None]:
        """Amount and date actually received, for the archived deed.

        Amount: the first deposit installment if it is paid, otherwise the
        first payment received at engagement (``first_payment``: payments
        without installment, 0 when the guarantee was refunded; a pending
        installment is only planned).
        Date: the installment's ``paid_date``, else ``deposit_date``, else the
        engagement date (status history), else the reservation date.
        """
        if first is not None and first.status == "paid":
            amount = first.amount
            paid_date = _as_date(first.paid_date)
        else:
            amount = details["first_payment"]
            paid_date = None

        deposit_date = paid_date or details.get("deposit_date")
        if deposit_date is None:
            engaged_at = await self.lot_repo.get_engaged_at(
                details["lot_id"], details["id"]
            )
            deposit_date = _as_date(engaged_at or details["reservation_date"])
        return amount, deposit_date

    async def _render_certificate(
        self, details: dict, require_paid_deposit: bool
    ) -> tuple[bytes, str]:
        reservation_id = details["id"]
        # The deed's balance is computed against the schedule's lot price
        # (remaining balance after the initial payment) minus the first deposit.
        deposit = details["deposit"]
        deposit_date = details.get("deposit_date")
        # Prefer sale_price (prix de vente sur l'acte) over catalogue price
        lot_price = details.get("sale_price") or details.get("lot_price")

        first, schedule_lot_price = await self._first_deposit(reservation_id)
        if first is not None:
            if require_paid_deposit and first.status != "paid":
                raise ActeNotReadyError(_DEPOSIT_UNPAID_ACTE, rule=DEPOSIT_UNPAID)
            deposit = first.amount
            lot_price = details.get("sale_price") or schedule_lot_price
        if not require_paid_deposit:
            deposit, deposit_date = await self._received_deposit(details, first)

        # If the promotion has not been collected yet, only the receipt is
        # available.
        if _promotion_pending(details):
            raise ActeNotReadyError(_PROMOTION_PENDING_ACTE, rule=PROMOTION_PENDING)

        pdf = await run_in_threadpool(
            self.certificate_service.generate_reservation_certificate,
            reservation_id=reservation_id,
            reservation_date=details["reservation_date"],
            deposit=deposit,
            deposit_date=deposit_date,
            lot_numero=details["lot_numero"],
            lot_surface=details.get("lot_surface"),
            lot_price=lot_price,
            project_name=details["project_name"],
            client_name=details["client_name"],
            client_cin=details.get("client_cin"),
            client_address=details.get("client_address"),
        )
        filename = (
            f"acte_reservation_{reservation_id}_lot"
            f"{_safe_lot(details['lot_numero'])}.pdf"
        )
        return pdf, filename
