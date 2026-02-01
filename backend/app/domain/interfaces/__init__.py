"""Repository interfaces - Abstract protocols for data access."""

from app.domain.interfaces.repositories import (
    ClientRepositoryProtocol,
    LotRepositoryProtocol,
    ProjectRepositoryProtocol,
    ReservationRepositoryProtocol,
    SaleRepositoryProtocol,
    UserRepositoryProtocol,
)

__all__ = [
    "UserRepositoryProtocol",
    "ProjectRepositoryProtocol",
    "LotRepositoryProtocol",
    "ClientRepositoryProtocol",
    "ReservationRepositoryProtocol",
    "SaleRepositoryProtocol",
]
