"""Common schemas used across the application."""

from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class BaseSchema(BaseModel):
    """Base schema with common configuration."""

    model_config = ConfigDict(
        from_attributes=True,
        str_strip_whitespace=True,
        validate_assignment=True,
    )


class PaginationParams(BaseModel):
    """Pagination query parameters."""

    page: int = Field(default=1, ge=1, description="Page number")
    page_size: int = Field(default=20, ge=1, le=100, description="Items per page")

    @property
    def offset(self) -> int:
        """Calculate offset for database query."""
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        """Return limit for database query."""
        return self.page_size


class PaginatedResponse(BaseSchema, Generic[T]):
    """Generic paginated response wrapper."""

    items: list[T]
    total: int = Field(description="Total number of items")
    page: int = Field(description="Current page number")
    page_size: int = Field(description="Number of items per page")
    total_pages: int = Field(description="Total number of pages")

    @classmethod
    def create(
        cls,
        items: list[T],
        total: int,
        pagination: PaginationParams,
    ) -> "PaginatedResponse[T]":
        """Create paginated response from items and pagination params."""
        total_pages = (total + pagination.page_size - 1) // pagination.page_size
        return cls(
            items=items,
            total=total,
            page=pagination.page,
            page_size=pagination.page_size,
            total_pages=max(1, total_pages),
        )


class ErrorDetail(BaseSchema):
    """Error detail for structured error responses."""

    field: str | None = None
    message: str
    code: str | None = None


class ErrorResponse(BaseSchema):
    """Standardized error response."""

    error: str = Field(description="Error type/code")
    message: str = Field(description="Human-readable error message")
    details: list[ErrorDetail] | None = Field(
        default=None,
        description="Additional error details",
    )
    request_id: str | None = Field(
        default=None,
        description="Request correlation ID for debugging",
    )


class HealthResponse(BaseSchema):
    """Health check response."""

    status: str = Field(default="healthy", description="Service status")
    version: str = Field(description="Application version")
    environment: str = Field(description="Current environment")
    checks: dict[str, Any] = Field(
        default_factory=dict,
        description="Individual component health checks",
    )


class MessageResponse(BaseSchema):
    """Simple message response."""

    message: str
    success: bool = True
