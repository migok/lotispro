"""Interchangeable notification channels (email now, SMS / WhatsApp later)."""

from dataclasses import dataclass
from typing import TYPE_CHECKING, Protocol

from app.domain.schemas.notification import Channel, NotificationStatus

if TYPE_CHECKING:
    from app.services.email_service import EmailService

__all__ = [
    "CHANNELS",
    "Attachment",
    "Channel",
    "DeliveryResult",
    "EmailChannel",
    "NotificationChannel",
    "Recipient",
    "SmsChannel",
    "WhatsAppChannel",
]

NO_EMAIL_ERROR = "Le client n'a pas d'adresse email."


@dataclass(frozen=True)
class Recipient:
    """Who receives the notification."""

    name: str
    email: str | None
    phone: str | None


@dataclass(frozen=True)
class Attachment:
    """A file sent with the message."""

    filename: str
    content: bytes


@dataclass(frozen=True)
class DeliveryResult:
    """Outcome of one send on one channel."""

    status: NotificationStatus
    error: str | None = None


class NotificationChannel(Protocol):
    """A way of delivering a message to a recipient."""

    async def send(
        self,
        recipient: Recipient,
        subject: str,
        body_html: str,
        attachments: list[Attachment],
    ) -> DeliveryResult: ...


class EmailChannel:
    """Email through Resend (:meth:`EmailService.send_email`)."""

    def __init__(self, email_service: "EmailService") -> None:
        self.email_service = email_service

    async def send(
        self,
        recipient: Recipient,
        subject: str,
        body_html: str,
        attachments: list[Attachment],
    ) -> DeliveryResult:
        if not recipient.email:
            return DeliveryResult(status="failed", error=NO_EMAIL_ERROR)
        return await self.email_service.send_email(
            recipient.email, subject, body_html, attachments or None
        )


class _UnavailableChannel:
    """Channel not wired to a provider yet: always ``not_configured``."""

    label = ""

    async def send(
        self,
        recipient: Recipient,
        subject: str,
        body_html: str,
        attachments: list[Attachment],
    ) -> DeliveryResult:
        return DeliveryResult(
            status="not_configured",
            error=f"L'envoi par {self.label} n'est pas encore disponible.",
        )


class SmsChannel(_UnavailableChannel):
    """SMS (provider to come, E7)."""

    label = "SMS"


class WhatsAppChannel(_UnavailableChannel):
    """WhatsApp (provider to come, E7)."""

    label = "WhatsApp"


CHANNELS: dict[Channel, type] = {
    "email": EmailChannel,
    "sms": SmsChannel,
    "whatsapp": WhatsAppChannel,
}
