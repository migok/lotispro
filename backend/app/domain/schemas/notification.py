"""Notification schemas: channels, kinds, ``notify`` request and history rows."""

from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator

from app.domain.schemas.common import BaseSchema

# Same values as ``client_profile.NOTIFICATION_CHANNELS`` (checked by a test).
Channel = Literal["email", "sms", "whatsapp"]
NotificationKind = Literal[
    "option_confirmee",
    "reservation_a_finaliser",
    "reservation_engagee",
    "rappel_expiration",
]
# Kinds a user sends by hand after a lot transition (reminders are automatic).
ManualNotificationKind = Literal[
    "option_confirmee", "reservation_a_finaliser", "reservation_engagee"
]
NotificationStatus = Literal["sent", "failed", "not_configured"]
NotificationRecipient = Literal["client", "commercial"]


class NotifyRequest(BaseSchema):
    """Body of ``POST /reservations/{id}/notify``."""

    channels: list[Channel] = Field(
        min_length=1, description="Canaux d'envoi (un même canal une seule fois)"
    )
    kind: ManualNotificationKind = Field(description="Type de notification")

    @field_validator("channels")
    @classmethod
    def _no_duplicates(cls, value: list[Channel]) -> list[Channel]:
        if len(set(value)) != len(value):
            raise ValueError("Chaque canal ne peut être choisi qu'une fois")
        return value


class NotificationResponse(BaseSchema):
    """One row of the notification history."""

    id: int
    client_id: int
    lot_id: int
    reservation_id: int
    recipient: NotificationRecipient
    channel: Channel
    kind: NotificationKind
    status: NotificationStatus
    error: str | None = None
    deadline_at: datetime | None = None
    sent_at: datetime
    sent_by_user_id: int | None = None
