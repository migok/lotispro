"""Global exception handlers for FastAPI application."""

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.core.exceptions import (
    AlreadyExistsError,
    AppException,
    AuthenticationError,
    AuthorizationError,
    BusinessRuleError,
    DatabaseError,
    NotFoundError,
    RateLimitError,
    ValidationError as AppValidationError,
)
from app.core.logging import get_logger, get_request_id

logger = get_logger(__name__)


def create_error_response(
    status_code: int,
    error: str,
    message: str,
    details: list | None = None,
) -> JSONResponse:
    """Create standardized error response.

    Args:
        status_code: HTTP status code
        error: Error type/code
        message: Human-readable message
        details: Optional error details

    Returns:
        JSONResponse with error body
    """
    content = {
        "error": error,
        "message": message,
        "request_id": get_request_id(),
    }

    if details:
        content["details"] = details

    return JSONResponse(status_code=status_code, content=content)


async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    """Handle custom application exceptions."""
    logger.warning(
        "Application error",
        error_code=exc.code,
        message=exc.message,
        details=exc.details,
    )

    return create_error_response(
        status_code=status.HTTP_400_BAD_REQUEST,
        error=exc.code,
        message=exc.message,
        details=[exc.details] if exc.details else None,
    )


async def not_found_handler(request: Request, exc: NotFoundError) -> JSONResponse:
    """Handle not found errors."""
    logger.info(
        "Resource not found",
        resource=exc.resource,
        identifier=exc.identifier,
    )

    return create_error_response(
        status_code=status.HTTP_404_NOT_FOUND,
        error="NOT_FOUND",
        message=exc.message,
    )


async def already_exists_handler(
    request: Request, exc: AlreadyExistsError
) -> JSONResponse:
    """Handle already exists errors."""
    logger.info(
        "Resource already exists",
        resource=exc.resource,
        field=exc.field,
        value=exc.value,
    )

    return create_error_response(
        status_code=status.HTTP_409_CONFLICT,
        error="ALREADY_EXISTS",
        message=exc.message,
        details=[{"field": exc.field, "value": exc.value}],
    )


async def validation_error_handler(
    request: Request, exc: AppValidationError
) -> JSONResponse:
    """Handle business validation errors."""
    logger.info(
        "Validation error",
        message=exc.message,
        field=exc.field,
    )

    return create_error_response(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        error="VALIDATION_ERROR",
        message=exc.message,
        details=[{"field": exc.field, "message": exc.message}] if exc.field else None,
    )


async def authentication_error_handler(
    request: Request, exc: AuthenticationError
) -> JSONResponse:
    """Handle authentication errors."""
    logger.info("Authentication failed", message=exc.message)

    return create_error_response(
        status_code=status.HTTP_401_UNAUTHORIZED,
        error="AUTHENTICATION_ERROR",
        message=exc.message,
    )


async def authorization_error_handler(
    request: Request, exc: AuthorizationError
) -> JSONResponse:
    """Handle authorization errors."""
    logger.warning(
        "Authorization denied",
        message=exc.message,
        required_role=exc.required_role,
    )

    return create_error_response(
        status_code=status.HTTP_403_FORBIDDEN,
        error="AUTHORIZATION_ERROR",
        message=exc.message,
    )


async def business_rule_error_handler(
    request: Request, exc: BusinessRuleError
) -> JSONResponse:
    """Handle business rule violations."""
    logger.info(
        "Business rule violation",
        message=exc.message,
        rule=exc.rule,
    )

    return create_error_response(
        status_code=status.HTTP_400_BAD_REQUEST,
        error="BUSINESS_RULE_VIOLATION",
        message=exc.message,
        details=[{"rule": exc.rule}] if exc.rule else None,
    )


async def database_error_handler(
    request: Request, exc: DatabaseError
) -> JSONResponse:
    """Handle database errors."""
    logger.error(
        "Database error",
        message=exc.message,
        operation=exc.operation,
    )

    return create_error_response(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        error="DATABASE_ERROR",
        message="A database error occurred. Please try again later.",
    )


async def rate_limit_error_handler(
    request: Request, exc: RateLimitError
) -> JSONResponse:
    """Handle rate limit errors."""
    logger.warning("Rate limit exceeded")

    response = create_error_response(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        error="RATE_LIMIT_EXCEEDED",
        message=exc.message,
    )

    if exc.retry_after:
        response.headers["Retry-After"] = str(exc.retry_after)

    return response


async def request_validation_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Handle Pydantic request validation errors."""
    errors = exc.errors()

    logger.info(
        "Request validation failed",
        errors=errors,
    )

    details = []
    for error in errors:
        field = ".".join(str(loc) for loc in error["loc"])
        details.append(
            {
                "field": field,
                "message": error["msg"],
                "type": error["type"],
            }
        )

    return create_error_response(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        error="VALIDATION_ERROR",
        message="Request validation failed",
        details=details,
    )


async def pydantic_validation_handler(
    request: Request, exc: ValidationError
) -> JSONResponse:
    """Handle Pydantic validation errors."""
    errors = exc.errors()

    logger.info(
        "Pydantic validation failed",
        errors=errors,
    )

    details = []
    for error in errors:
        field = ".".join(str(loc) for loc in error["loc"])
        details.append(
            {
                "field": field,
                "message": error["msg"],
            }
        )

    return create_error_response(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        error="VALIDATION_ERROR",
        message="Data validation failed",
        details=details,
    )


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle unexpected exceptions."""
    logger.exception(
        "Unhandled exception",
        error=str(exc),
        error_type=type(exc).__name__,
    )

    return create_error_response(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        error="INTERNAL_ERROR",
        message="An unexpected error occurred. Please try again later.",
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Register all exception handlers with the application.

    Args:
        app: FastAPI application instance
    """
    # Custom application exceptions
    app.add_exception_handler(NotFoundError, not_found_handler)
    app.add_exception_handler(AlreadyExistsError, already_exists_handler)
    app.add_exception_handler(AppValidationError, validation_error_handler)
    app.add_exception_handler(AuthenticationError, authentication_error_handler)
    app.add_exception_handler(AuthorizationError, authorization_error_handler)
    app.add_exception_handler(BusinessRuleError, business_rule_error_handler)
    app.add_exception_handler(DatabaseError, database_error_handler)
    app.add_exception_handler(RateLimitError, rate_limit_error_handler)
    app.add_exception_handler(AppException, app_exception_handler)

    # FastAPI/Pydantic validation
    app.add_exception_handler(RequestValidationError, request_validation_handler)
    app.add_exception_handler(ValidationError, pydantic_validation_handler)

    # Generic fallback
    app.add_exception_handler(Exception, generic_exception_handler)

    logger.info("Exception handlers registered")
