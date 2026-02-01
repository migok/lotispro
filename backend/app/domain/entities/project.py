"""Project domain entity."""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class ProjectVisibility(StrEnum):
    """Project visibility enumeration."""

    PUBLIC = "public"
    PRIVATE = "private"


@dataclass
class Project:
    """Project domain entity.

    Represents a real estate project containing lots.
    """

    id: int
    name: str
    description: str | None
    visibility: ProjectVisibility
    total_lots: int
    sold_lots: int
    ca_objectif: float | None  # Revenue target
    created_by: int  # User ID
    created_at: datetime
    updated_at: datetime

    def is_public(self) -> bool:
        """Check if project is publicly visible."""
        return self.visibility == ProjectVisibility.PUBLIC

    @property
    def sales_rate(self) -> float:
        """Calculate sales rate as percentage."""
        if self.total_lots == 0:
            return 0.0
        return (self.sold_lots / self.total_lots) * 100

    @property
    def available_lots(self) -> int:
        """Calculate number of available lots."""
        return self.total_lots - self.sold_lots
