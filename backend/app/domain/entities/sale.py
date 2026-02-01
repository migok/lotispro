"""Sale domain entity."""

from dataclasses import dataclass
from datetime import datetime


@dataclass
class Sale:
    """Sale domain entity.

    Represents a completed lot sale to a client.
    """

    id: int
    project_id: int
    lot_id: int
    client_id: int
    reservation_id: int | None  # If converted from reservation
    sold_by_user_id: int | None
    sale_date: datetime
    price: float
    notes: str | None
    created_at: datetime

    @property
    def was_converted_from_reservation(self) -> bool:
        """Check if sale originated from a reservation."""
        return self.reservation_id is not None
