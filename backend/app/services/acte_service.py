"""Reservation deed (acte de réservation) and payment receipt.

Builds both PDFs from a reservation (single source of the rules that gate
them) and archives the deed as a lot document.

Issuance rule (spec E4-T5, replaces the E4-T1 « premier versement payé » and
« promotion reçue » rules): the deed is issued — automatically, regenerated,
downloaded or emailed — only once the payments received, first payment
included, are > 0 and >= ``projects.acte_min_paid_pct`` % of the agreed
total price.
"""

from dataclasses import dataclass
from datetime import date
from typing import Literal

from fastapi.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleError, NotFoundError
from app.core.logging import get_logger
from app.domain.reservation_amounts import format_mad, to_cents
from app.infrastructure.database.models import LotDocumentModel
from app.infrastructure.database.repositories import (
    LotDocumentRepository,
    ReservationPaymentRepository,
    ReservationRepository,
)
from app.services.certificate_service import CertificateService
from app.services.document_service import DocumentService

logger = get_logger(__name__)

ACTE_CATEGORY = "acte_reservation"

# ``ActeNotReadyError.rule`` values.
DEPOSIT_UNPAID = "first_deposit_unpaid"
THRESHOLD_NOT_REACHED = "acte_threshold_not_reached"

_DEPOSIT_UNPAID_RECEIPT = (
    "Le premier versement d'acompte doit être effectué "
    "avant de générer le reçu de paiement."
)

# Payments printed as advances on the deed (R4): the gap is not on the deed.
_ADVANCE_TYPES = {"deposit", "balance"}


class ActeNotReadyError(BusinessRuleError):
    """The deed (or receipt) cannot be produced yet; ``rule`` says why."""


@dataclass(frozen=True)
class ActeResult:
    """Outcome of :meth:`ActeService.generate_and_store` (never raises)."""

    status: Literal["stored", "not_ready", "failed"]
    document_id: int | None = None
    error: str | None = None
    rule: str | None = None


@dataclass(frozen=True)
class ActeReadiness:
    """Whether the deed can be issued, and the figures of the threshold rule."""

    available: bool
    message: str | None
    total_received: float
    threshold_amount: float


def _safe_lot(numero: str) -> str:
    return numero.replace("/", "-").replace(" ", "_")


def format_pct(pct: float) -> str:
    """French percentage figure: ``10``, ``12,5``."""
    return f"{pct:g}".replace(".", ",")


def agreed_total(details: dict) -> float:
    """Prix total convenu; the catalogue price for pre-E4-T5 reservations."""
    agreed = details.get("agreed_total_price")
    return agreed if agreed is not None else (details.get("lot_price") or 0.0)


def acte_price(details: dict) -> float:
    """Prix figurant sur l'acte (``sale_price``), else the agreed total."""
    sale_price = details.get("sale_price")
    return sale_price if sale_price is not None else agreed_total(details)


def threshold_cents(agreed: float, pct: float) -> int:
    """``pct`` % of the agreed total, in cents (same rounding as R2)."""
    return round(to_cents(agreed) * pct / 100)


class ActeService:
    """Build the deed / receipt PDFs and archive the deed."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.reservation_repo = ReservationRepository(session)
        self.doc_repo = LotDocumentRepository(session)
        self.received_repo = ReservationPaymentRepository(session)
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

    async def acte_readiness(self, reservation_id: int) -> ActeReadiness:
        """Threshold rule of the deed for a reservation.

        Raises:
            NotFoundError: Reservation not found.
        """
        return await self._readiness(await self.load_details(reservation_id))

    async def _readiness(self, details: dict) -> ActeReadiness:
        pct = details["acte_min_paid_pct"]
        received = await self.received_repo.total_for_reservation(details["id"])
        threshold = threshold_cents(agreed_total(details), pct)
        received_cents = to_cents(received)
        available = received_cents > 0 and received_cents >= threshold
        message = None
        if not available:
            message = (
                f"L'acte sera disponible quand {format_pct(pct)} % du prix total "
                f"convenu aura été encaissé ({format_mad(received)} MAD sur "
                f"{format_mad(threshold / 100)} MAD)."
            )
        return ActeReadiness(
            available=available,
            message=message,
            total_received=received,
            threshold_amount=threshold / 100,
        )

    async def build_certificate_pdf(self, reservation_id: int) -> tuple[bytes, str]:
        """Return the deed PDF and its file name.

        The same figures are printed whether the deed is archived, regenerated,
        downloaded or emailed (see :meth:`_advances`, rule R4).

        Raises:
            NotFoundError: Reservation not found.
            ActeNotReadyError: Paid threshold not reached
                (``acte_threshold_not_reached``).
        """
        details = await self.load_details(reservation_id)
        return await self._render_certificate(details)

    async def build_receipt_pdf(self, reservation_id: int) -> tuple[bytes, str]:
        """Return the payment receipt PDF (first payment) and its file name.

        Available as soon as a first payment was received, whatever the deed
        threshold. Amount: « premier acompte reçu » (payments without
        installment); date: the last of those payments.

        Raises:
            NotFoundError: Reservation not found.
            ActeNotReadyError: No first payment received (``first_deposit_unpaid``).
        """
        details = await self.load_details(reservation_id)
        first_payments = await self.received_repo.list_for_reservation(
            reservation_id, installment_types=set()
        )
        amount = sum(to_cents(p.amount) for p in first_payments) / 100
        if to_cents(amount) <= 0:
            raise ActeNotReadyError(_DEPOSIT_UNPAID_RECEIPT, rule=DEPOSIT_UNPAID)

        pdf = await run_in_threadpool(
            self.certificate_service.generate_payment_receipt,
            reservation_id=details["id"],
            receipt_date=details["reservation_date"],
            deposit_amount=amount,
            deposit_date=first_payments[-1].paid_on,
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
        the caller's transaction (e.g. the engagement) stays intact. Below the
        paid threshold nothing is generated (``status="not_ready"``).
        """
        try:
            async with self.session.begin_nested():
                details = await self.load_details(reservation_id)
                content, filename = await self._render_certificate(details)
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
            return ActeResult(status="not_ready", error=exc.message, rule=exc.rule)
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

    async def _advances(self, details: dict, price: float) -> tuple[float, date | None]:
        """Advances printed on the deed and their date (R4).

        Amount: first payment + payments on ``deposit`` / ``balance``
        installments (the gap is not on the deed), capped at the deed price.
        Date: ``paid_on`` of the last of those payments (``None`` if none).
        """
        payments = await self.received_repo.list_for_reservation(
            details["id"], installment_types=_ADVANCE_TYPES
        )
        total = sum(to_cents(p.amount) for p in payments)
        amount = min(total, to_cents(price)) / 100
        return amount, (payments[-1].paid_on if payments else None)

    async def _render_certificate(self, details: dict) -> tuple[bytes, str]:
        readiness = await self._readiness(details)
        if not readiness.available:
            raise ActeNotReadyError(readiness.message or "", rule=THRESHOLD_NOT_REACHED)

        price = acte_price(details)
        # The printed balance is the deed price minus these advances.
        deposit, deposit_date = await self._advances(details, price)

        pdf = await run_in_threadpool(
            self.certificate_service.generate_reservation_certificate,
            reservation_id=details["id"],
            reservation_date=details["reservation_date"],
            deposit=deposit,
            deposit_date=deposit_date,
            lot_numero=details["lot_numero"],
            lot_surface=details.get("lot_surface"),
            lot_price=price,
            project_name=details["project_name"],
            client_name=details["client_name"],
            client_cin=details.get("client_cin"),
            client_address=details.get("client_address"),
        )
        filename = (
            f"acte_reservation_{details['id']}_lot"
            f"{_safe_lot(details['lot_numero'])}.pdf"
        )
        return pdf, filename
