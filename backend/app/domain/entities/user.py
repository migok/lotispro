"""User domain entity."""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class UserRole(StrEnum):
    """User role enumeration."""

    MANAGER = "manager"
    COMMERCIAL = "commercial"
    CLIENT = "client"


@dataclass
class User:
    """User domain entity.

    Represents a user in the system with authentication and role information.
    """

    id: int
    email: str
    name: str
    role: UserRole
    password_hash: str
    created_at: datetime
    updated_at: datetime

    def is_manager(self) -> bool:
        """Check if user has manager role."""
        return self.role == UserRole.MANAGER

    def is_commercial(self) -> bool:
        """Check if user has commercial role."""
        return self.role == UserRole.COMMERCIAL

    def can_manage_users(self) -> bool:
        """Check if user can manage other users."""
        return self.is_manager()

    def can_manage_projects(self) -> bool:
        """Check if user can create/edit projects."""
        return self.is_manager()
