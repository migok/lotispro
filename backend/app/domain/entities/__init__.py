"""Domain entities - Pure Python dataclasses representing business objects."""

from app.domain.entities.client import Client
from app.domain.entities.lot import Lot, LotStatus
from app.domain.entities.project import Project, ProjectVisibility
from app.domain.entities.reservation import Reservation, ReservationStatus
from app.domain.entities.sale import Sale
from app.domain.entities.user import User, UserRole

__all__ = [
    "User",
    "UserRole",
    "Project",
    "ProjectVisibility",
    "Lot",
    "LotStatus",
    "Client",
    "Reservation",
    "ReservationStatus",
    "Sale",
]
