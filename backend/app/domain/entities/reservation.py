"""Reservation domain entity."""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class ReservationStatus(StrEnum):
    """Reservation status enumeration."""

    ACTIVE = "active"
    EXPIRED = "expired"
    RELEASED = "released"
    CONVERTED = "converted"


@dataclass
class Reservation:
    """Reservation domain entity.

    Represents a lot reservation by a client.
    """

    id: int
    project_id: int
    lot_id: int
    client_id: int
    reserved_by_user_id: int | None
    reservation_date: datetime
    expiration_date: datetime
    deposit: float
    notes: str | None
    status: ReservationStatus
    created_at: datetime
    updated_at: datetime

    def is_active(self) -> bool:
        """Check if reservation is currently active."""
        return self.status == ReservationStatus.ACTIVE

    def is_expired(self) -> bool:
        """Check if reservation has expired."""
        if self.status == ReservationStatus.EXPIRED:
            return True
        return datetime.now() > self.expiration_date and self.is_active()

    def can_be_converted(self) -> bool:
        """Check if reservation can be converted to sale."""
        return self.is_active() and not self.is_expired()

    def can_be_released(self) -> bool:
        """Check if reservation can be released."""
        return self.is_active()

    @property
    def days_until_expiration(self) -> int:
        """Calculate days until expiration (negative if expired)."""
        delta = self.expiration_date - datetime.now()
        return delta.days
