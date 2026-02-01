"""Lot domain entity."""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class LotStatus(StrEnum):
    """Lot status enumeration."""

    AVAILABLE = "available"
    RESERVED = "reserved"
    SOLD = "sold"
    BLOCKED = "blocked"


@dataclass
class Lot:
    """Lot domain entity.

    Represents a land lot within a project.
    """

    id: int
    project_id: int
    numero: str
    zone: str | None
    surface: float | None
    price: float | None
    status: LotStatus
    current_reservation_id: int | None
    created_at: datetime
    updated_at: datetime

    def is_available(self) -> bool:
        """Check if lot is available for reservation/sale."""
        return self.status == LotStatus.AVAILABLE

    def is_reserved(self) -> bool:
        """Check if lot is currently reserved."""
        return self.status == LotStatus.RESERVED

    def is_sold(self) -> bool:
        """Check if lot has been sold."""
        return self.status == LotStatus.SOLD

    def can_be_reserved(self) -> bool:
        """Check if lot can be reserved."""
        return self.status == LotStatus.AVAILABLE

    def can_be_sold(self) -> bool:
        """Check if lot can be sold directly."""
        return self.status in (LotStatus.AVAILABLE, LotStatus.RESERVED)

    def can_be_deleted(self) -> bool:
        """Check if lot can be deleted."""
        return self.status not in (LotStatus.RESERVED, LotStatus.SOLD)
