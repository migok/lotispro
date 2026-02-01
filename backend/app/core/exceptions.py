"""Custom application exceptions.

Provides domain-specific exceptions that are converted to HTTP responses.
"""

from typing import Any


class AppException(Exception):
    """Base exception for all application errors."""

    def __init__(
        self,
        message: str,
        code: str | None = None,
        details: dict[str, Any] | None = None,
    ):
        self.message = message
        self.code = code or "APP_ERROR"
        self.details = details or {}
        super().__init__(message)


class NotFoundError(AppException):
    """Resource not found exception."""

    def __init__(
        self,
        resource: str,
        identifier: str | int | None = None,
        details: dict[str, Any] | None = None,
    ):
        message = f"{resource} not found"
        if identifier is not None:
            message = f"{resource} with id '{identifier}' not found"
        super().__init__(
            message=message,
            code="NOT_FOUND",
            details={"resource": resource, "identifier": identifier, **(details or {})},
        )
        self.resource = resource
        self.identifier = identifier


class AlreadyExistsError(AppException):
    """Resource already exists exception."""

    def __init__(
        self,
        resource: str,
        field: str,
        value: str | None = None,
        details: dict[str, Any] | None = None,
    ):
        message = f"{resource} with {field}='{value}' already exists"
        super().__init__(
            message=message,
            code="ALREADY_EXISTS",
            details={"resource": resource, "field": field, "value": value, **(details or {})},
        )
        self.resource = resource
        self.field = field
        self.value = value


class ValidationError(AppException):
    """Business validation error."""

    def __init__(
        self,
        message: str,
        field: str | None = None,
        details: dict[str, Any] | None = None,
    ):
        super().__init__(
            message=message,
            code="VALIDATION_ERROR",
            details={"field": field, **(details or {})},
        )
        self.field = field


class AuthenticationError(AppException):
    """Authentication failure exception."""

    def __init__(
        self,
        message: str = "Authentication failed",
        details: dict[str, Any] | None = None,
    ):
        super().__init__(
            message=message,
            code="AUTHENTICATION_ERROR",
            details=details,
        )


class AuthorizationError(AppException):
    """Authorization failure exception."""

    def __init__(
        self,
        message: str = "Access denied",
        required_role: str | None = None,
        details: dict[str, Any] | None = None,
    ):
        super().__init__(
            message=message,
            code="AUTHORIZATION_ERROR",
            details={"required_role": required_role, **(details or {})},
        )
        self.required_role = required_role


class BusinessRuleError(AppException):
    """Business rule violation exception."""

    def __init__(
        self,
        message: str,
        rule: str | None = None,
        details: dict[str, Any] | None = None,
    ):
        super().__init__(
            message=message,
            code="BUSINESS_RULE_VIOLATION",
            details={"rule": rule, **(details or {})},
        )
        self.rule = rule


class DatabaseError(AppException):
    """Database operation failure exception."""

    def __init__(
        self,
        message: str = "Database operation failed",
        operation: str | None = None,
        details: dict[str, Any] | None = None,
    ):
        super().__init__(
            message=message,
            code="DATABASE_ERROR",
            details={"operation": operation, **(details or {})},
        )
        self.operation = operation


class ExternalServiceError(AppException):
    """External service failure exception."""

    def __init__(
        self,
        service: str,
        message: str = "External service error",
        details: dict[str, Any] | None = None,
    ):
        super().__init__(
            message=f"{service}: {message}",
            code="EXTERNAL_SERVICE_ERROR",
            details={"service": service, **(details or {})},
        )
        self.service = service


class RateLimitError(AppException):
    """Rate limit exceeded exception."""

    def __init__(
        self,
        message: str = "Rate limit exceeded",
        retry_after: int | None = None,
        details: dict[str, Any] | None = None,
    ):
        super().__init__(
            message=message,
            code="RATE_LIMIT_EXCEEDED",
            details={"retry_after": retry_after, **(details or {})},
        )
        self.retry_after = retry_after


class FileError(AppException):
    """File operation exception."""

    def __init__(
        self,
        message: str,
        filename: str | None = None,
        details: dict[str, Any] | None = None,
    ):
        super().__init__(
            message=message,
            code="FILE_ERROR",
            details={"filename": filename, **(details or {})},
        )
        self.filename = filename
