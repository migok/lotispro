"""Repository protocol definitions.

These protocols define the contract that repository implementations must follow.
This allows for dependency inversion - services depend on abstractions, not implementations.
"""

from typing import Protocol

from app.domain.entities import (
    Client,
    Lot,
    Project,
    Reservation,
    Sale,
    User,
)
from app.domain.schemas.lot import LotFilter
from app.domain.schemas.reservation import ReservationFilter


class UserRepositoryProtocol(Protocol):
    """Protocol for user data access operations."""

    async def create(
        self,
        email: str,
        password_hash: str,
        name: str,
        role: str,
    ) -> User:
        """Create a new user."""
        ...

    async def get_by_id(self, user_id: int) -> User | None:
        """Get user by ID."""
        ...

    async def get_by_email(self, email: str) -> User | None:
        """Get user by email."""
        ...

    async def get_all(self, role: str | None = None) -> list[User]:
        """Get all users, optionally filtered by role."""
        ...

    async def update(self, user_id: int, **kwargs) -> User | None:
        """Update user fields."""
        ...

    async def delete(self, user_id: int) -> bool:
        """Delete a user."""
        ...


class ProjectRepositoryProtocol(Protocol):
    """Protocol for project data access operations."""

    async def create(
        self,
        name: str,
        created_by: int,
        description: str | None = None,
        visibility: str = "private",
        ca_objectif: float | None = None,
    ) -> Project:
        """Create a new project."""
        ...

    async def get_by_id(self, project_id: int) -> Project | None:
        """Get project by ID."""
        ...

    async def get_all(
        self,
        user_id: int | None = None,
        user_role: str | None = None,
    ) -> list[Project]:
        """Get all projects with optional filtering based on user access."""
        ...

    async def update(self, project_id: int, **kwargs) -> Project | None:
        """Update project fields."""
        ...

    async def delete(self, project_id: int) -> bool:
        """Delete a project."""
        ...

    async def assign_user(
        self,
        project_id: int,
        user_id: int,
        assigned_by: int,
    ) -> bool:
        """Assign a user to a project."""
        ...

    async def unassign_user(self, project_id: int, user_id: int) -> bool:
        """Remove user from project."""
        ...

    async def get_assigned_users(self, project_id: int) -> list[User]:
        """Get all users assigned to a project."""
        ...

    async def get_user_projects(self, user_id: int) -> list[Project]:
        """Get all projects assigned to a user."""
        ...

    async def is_user_assigned(self, project_id: int, user_id: int) -> bool:
        """Check if user is assigned to project."""
        ...


class LotRepositoryProtocol(Protocol):
    """Protocol for lot data access operations."""

    async def create(
        self,
        project_id: int,
        numero: str,
        zone: str | None = None,
        surface: float | None = None,
        price: float | None = None,
        status: str = "available",
    ) -> Lot:
        """Create a new lot."""
        ...

    async def get_by_id(self, lot_id: int) -> Lot | None:
        """Get lot by ID."""
        ...

    async def get_by_numero(self, project_id: int, numero: str) -> Lot | None:
        """Get lot by project and numero."""
        ...

    async def get_all(self, filters: LotFilter | None = None) -> list[Lot]:
        """Get all lots with optional filtering."""
        ...

    async def update(self, lot_id: int, **kwargs) -> Lot | None:
        """Update lot fields."""
        ...

    async def delete(self, lot_id: int) -> bool:
        """Delete a lot."""
        ...

    async def count_by_project(self, project_id: int) -> int:
        """Count lots in a project."""
        ...


class ClientRepositoryProtocol(Protocol):
    """Protocol for client data access operations."""

    async def create(
        self,
        name: str,
        created_by_user_id: int | None = None,
        phone: str | None = None,
        email: str | None = None,
        cin: str | None = None,
        client_type: str = "autre",
        notes: str | None = None,
    ) -> Client:
        """Create a new client."""
        ...

    async def get_by_id(self, client_id: int) -> Client | None:
        """Get client by ID."""
        ...

    async def get_all(
        self,
        search: str | None = None,
        client_type: str | None = None,
    ) -> list[Client]:
        """Get all clients with optional filtering."""
        ...

    async def update(self, client_id: int, **kwargs) -> Client | None:
        """Update client fields."""
        ...

    async def delete(self, client_id: int) -> bool:
        """Delete a client."""
        ...

    async def get_details(self, client_id: int) -> dict | None:
        """Get detailed client info including history and stats."""
        ...


class ReservationRepositoryProtocol(Protocol):
    """Protocol for reservation data access operations."""

    async def create(
        self,
        project_id: int,
        lot_id: int,
        client_id: int,
        reserved_by_user_id: int | None,
        expiration_date: str,
        deposit: float = 0,
        notes: str | None = None,
    ) -> Reservation:
        """Create a new reservation."""
        ...

    async def get_by_id(self, reservation_id: int) -> Reservation | None:
        """Get reservation by ID."""
        ...

    async def get_all(
        self,
        filters: ReservationFilter | None = None,
    ) -> list[Reservation]:
        """Get all reservations with optional filtering."""
        ...

    async def update(self, reservation_id: int, **kwargs) -> Reservation | None:
        """Update reservation fields."""
        ...

    async def get_expired(self) -> list[Reservation]:
        """Get all expired active reservations."""
        ...

    async def get_at_risk(self, days_threshold: int = 3) -> list[dict]:
        """Get reservations at risk (expiring soon or expired)."""
        ...


class SaleRepositoryProtocol(Protocol):
    """Protocol for sale data access operations."""

    async def create(
        self,
        project_id: int,
        lot_id: int,
        client_id: int,
        price: float,
        sold_by_user_id: int | None = None,
        reservation_id: int | None = None,
        notes: str | None = None,
    ) -> Sale:
        """Create a new sale."""
        ...

    async def get_by_id(self, sale_id: int) -> Sale | None:
        """Get sale by ID."""
        ...

    async def get_all(
        self,
        lot_id: int | None = None,
        client_id: int | None = None,
        project_id: int | None = None,
    ) -> list[Sale]:
        """Get all sales with optional filtering."""
        ...

    async def get_by_period(
        self,
        project_id: int | None = None,
        period: str = "month",
    ) -> list[dict]:
        """Get sales aggregated by period."""
        ...
