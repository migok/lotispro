"""Client domain entity."""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class ClientType(StrEnum):
    """Client type enumeration."""

    PROPRIETAIRE = "proprietaire"
    REVENDEUR = "revendeur"
    INVESTISSEUR = "investisseur"
    AUTRE = "autre"


@dataclass
class Client:
    """Client domain entity.

    Represents a client who can make reservations and purchases.
    """

    id: int
    name: str
    phone: str | None
    email: str | None
    cin: str | None  # National ID
    client_type: ClientType
    notes: str | None
    created_by_user_id: int | None
    created_at: datetime
    updated_at: datetime
