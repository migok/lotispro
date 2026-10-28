"""Send reservation notifications on the chosen channels and keep the history."""

from datetime import datetime
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleError, NotFoundError
from app.core.logging import get_logger
from app.domain.schemas.notification import Channel, NotificationResponse
from app.infrastructure.database.models import NotificationModel, UserModel
from app.infrastructure.database.repositories import (
    LotRepository,
    NotificationRepository,
    ReservationRepository,
    UserRepository,
)
from app.services.acte_service import ActeService
from app.services.document_service import DocumentService
from app.services.email_service import EmailService
from app.services.notifications.channels import (
    CHANNELS,
    Attachment,
    DeliveryResult,
    EmailChannel,
    NotificationChannel,
    Recipient,
)
from app.services.notifications.content import NotificationContext, build_message

logger = get_logger(__name__)

# Lot status a manually sent notification belongs to.
KIND_LOT_STATUS: dict[str, str] = {
    "option_confirmee": "option",
    "reservation_a_finaliser": "reservation_a_finaliser",
    "reservation_engagee": "reservation_engagee",
}
KIND_MISMATCH_MESSAGE = "Ce type de notification ne correspond pas au statut du lot."
_UNEXPECTED_ERROR = "Erreur inattendue lors de l'envoi."
_FALLBACK_COMMERCIAL = "Service commercial LotisPro"


def _amount(stage: str | None, details: dict) -> float | None:
    """Amount shown for the stage (a manual kind, or the lot status for reminders)."""
    if stage in ("option_confirmee", "option"):
        return details["deposit"] or None
    if stage == "reservation_a_finaliser":
        return details["guarantee_amount"]
    if stage == "reservation_engagee":
        return details["sale_price"] or details["lot_price"]
    return None


class NotificationService:
    """Notify a reservation's client (or commercial) and record each delivery."""

    def __init__(self, session: AsyncSession, email_service: EmailService):
        self.session = session
        self.repo = NotificationRepository(session)
        self.reservation_repo = ReservationRepository(session)
        self.lot_repo = LotRepository(session)
        self.user_repo = UserRepository(session)
        self.acte_service = ActeService(session)
        self.document_service = DocumentService(session)
        self.channels: dict[Channel, NotificationChannel] = {
            name: cls(email_service) if cls is EmailChannel else cls()
            for name, cls in CHANNELS.items()
        }

    async def notify(
        self,
        reservation_id: int,
        channels: list[Channel],
        kind: str,
        user_id: int | None,
        *,
        recipient: Literal["client", "commercial"] = "client",
        deadline_at: datetime | None = None,
    ) -> list[NotificationModel]:
        """Send ``kind`` on each channel; one history row per channel.

        A channel failure never raises: it is recorded as ``failed`` /
        ``not_configured``. Commits the history rows.

        Raises:
            NotFoundError: Reservation not found.
            BusinessRuleError: ``kind`` does not match the lot status
                (rule ``notification_kind_mismatch``).
        """
        details = await self.reservation_repo.get_with_details(reservation_id)
        if details is None:
            raise NotFoundError("Reservation", reservation_id)
        lot = await self.lot_repo.get_by_id(details["lot_id"])
        expected = KIND_LOT_STATUS.get(kind)
        if expected is not None and (
            lot.status != expected or lot.current_reservation_id != reservation_id
        ):
            raise BusinessRuleError(
                KIND_MISMATCH_MESSAGE, rule="notification_kind_mismatch"
            )

        commercial = await self._commercial(details["reserved_by_user_id"], user_id)
        if kind in ("option_confirmee", "reservation_a_finaliser"):
            deadline = details["expiration_date"]
        elif kind == "rappel_expiration":
            deadline = deadline_at or details["expiration_date"]
        else:
            deadline = None
        stage = lot.status if kind == "rappel_expiration" else kind

        attachments: list[Attachment] = []
        if kind == "reservation_engagee" and "email" in channels:
            attachments = await self._acte_attachments(reservation_id)

        subject, html = build_message(
            NotificationContext(
                kind=kind,
                client_name=details["client_name"],
                lot_numero=details["lot_numero"],
                project_name=details["project_name"],
                amount=_amount(stage, details),
                deadline=deadline,
                commercial_name=commercial.name if commercial else _FALLBACK_COMMERCIAL,
                commercial_phone=commercial.phone if commercial else None,
                commercial_email=commercial.email if commercial else "",
                acte_attached=bool(attachments),
            )
        )
        if recipient == "client":
            to = Recipient(
                details["client_name"], details["client_email"], details["client_phone"]
            )
        elif commercial is not None:
            to = Recipient(
                commercial.name, commercial.email, commercial.phone, role="commercial"
            )
        else:
            to = Recipient(_FALLBACK_COMMERCIAL, None, None, role="commercial")

        rows = []
        for name in channels:
            result = await self._send(name, to, subject, html, attachments)
            rows.append(
                await self.repo.create(
                    client_id=details["client_id"],
                    lot_id=details["lot_id"],
                    reservation_id=reservation_id,
                    recipient=recipient,
                    channel=name,
                    kind=kind,
                    status=result.status,
                    error=result.error,
                    deadline_at=deadline_at or deadline,
                    sent_by_user_id=user_id,
                )
            )
        await self.session.commit()
        logger.info(
            "Notifications recorded",
            reservation_id=reservation_id,
            kind=kind,
            statuses={row.channel: row.status for row in rows},
        )
        return rows

    async def _commercial(
        self, reserved_by_user_id: int | None, user_id: int | None
    ) -> UserModel | None:
        """The reservation's commercial, else the sender."""
        for candidate in (reserved_by_user_id, user_id):
            if candidate is not None:
                user = await self.user_repo.get_by_id(candidate)
                if user is not None:
                    return user
        return None

    async def _acte_attachments(self, reservation_id: int) -> list[Attachment]:
        """The latest archived deed as a PDF attachment, if it can be read."""
        acte = await self.acte_service.latest_acte(reservation_id)
        if acte is None:
            return []
        try:
            content, _, filename = await self.document_service.get_document_file(
                acte.lot_id, acte.id
            )
        except Exception:
            logger.exception(
                "Archived acte unreadable — email sent without it",
                reservation_id=reservation_id,
                document_id=acte.id,
            )
            return []
        return [Attachment(filename=filename, content=content)]

    async def _send(
        self,
        name: Channel,
        to: Recipient,
        subject: str,
        html: str,
        attachments: list[Attachment],
    ) -> DeliveryResult:
        try:
            return await self.channels[name].send(to, subject, html, attachments)
        except Exception:
            logger.exception("Notification channel failed", channel=name)
            return DeliveryResult(status="failed", error=_UNEXPECTED_ERROR)

    async def responses(
        self, rows: list[NotificationModel]
    ) -> list[NotificationResponse]:
        """History rows with the sender's name (one query for all senders)."""
        sender_ids = {r.sent_by_user_id for r in rows if r.sent_by_user_id is not None}
        names: dict[int, str] = {}
        if sender_ids:
            result = await self.session.execute(
                select(UserModel.id, UserModel.name).where(UserModel.id.in_(sender_ids))
            )
            names = dict(result.all())
        return [
            NotificationResponse.model_validate(row).model_copy(
                update={"sent_by_name": names.get(row.sent_by_user_id)}
            )
            for row in rows
        ]

    # Last in the class body: once defined, ``list`` names this method there.
    async def list(
        self, client_id: int | None, lot_id: int | None
    ) -> list[NotificationModel]:
        """History of a client and/or a lot, most recent first."""
        return await self.repo.list_filtered(client_id, lot_id)
