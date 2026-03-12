"""API dependencies for authentication and service injection."""

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger, set_user_id
from app.core.security import security_scheme, validate_credentials
from app.domain.schemas.user import UserResponse
from app.infrastructure.database import get_session
from app.services import (
    AuditService,
    AuthService,
    CertificateService,
    ClientService,
    DashboardService,
    LotService,
    PaymentService,
    ProjectService,
    ReservationService,
    SaleService,
    UserService,
)

logger = get_logger(__name__)

# Type aliases for dependency injection
DBSession = Annotated[AsyncSession, Depends(get_session)]


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    session: AsyncSession = Depends(get_session),
) -> UserResponse:
    """Get current authenticated user from JWT token.

    Args:
        credentials: HTTP Bearer credentials
        session: Database session

    Returns:
        Current user response

    Raises:
        HTTPException: If authentication fails
    """
    token_data = validate_credentials(credentials)

    auth_service = AuthService(session)
    user = await auth_service.get_current_user(token_data.user_id)

    # Set user ID in logging context
    set_user_id(user.id)

    return user


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        security_scheme
    ),
    session: AsyncSession = Depends(get_session),
) -> UserResponse | None:
    """Get current user if authenticated, None otherwise.

    Args:
        credentials: Optional HTTP Bearer credentials
        session: Database session

    Returns:
        Current user response or None
    """
    if not credentials:
        return None

    try:
        return await get_current_user(credentials, session)
    except HTTPException:
        return None


def require_roles(*allowed_roles: str):
    """Dependency factory for role-based access control.

    Args:
        *allowed_roles: Allowed role names

    Returns:
        Dependency function that validates user role
    """

    async def role_checker(
        current_user: UserResponse = Depends(get_current_user),
    ) -> UserResponse:
        if current_user.role not in allowed_roles:
            logger.warning(
                "Access denied - insufficient role",
                user_id=current_user.id,
                user_role=current_user.role,
                required_roles=allowed_roles,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {', '.join(allowed_roles)}",
            )
        return current_user

    return role_checker


# Typed dependencies for current user
CurrentUser = Annotated[UserResponse, Depends(get_current_user)]
OptionalUser = Annotated[UserResponse | None, Depends(get_current_user_optional)]
ManagerUser = Annotated[UserResponse, Depends(require_roles("manager"))]
CommercialOrManager = Annotated[
    UserResponse, Depends(require_roles("manager", "commercial"))
]


# Service dependencies
def get_auth_service(session: DBSession) -> AuthService:
    """Get auth service instance."""
    return AuthService(session)


def get_user_service(session: DBSession) -> UserService:
    """Get user service instance."""
    return UserService(session)


def get_project_service(session: DBSession) -> ProjectService:
    """Get project service instance."""
    return ProjectService(session)


def get_lot_service(session: DBSession) -> LotService:
    """Get lot service instance."""
    return LotService(session)


def get_client_service(session: DBSession) -> ClientService:
    """Get client service instance."""
    return ClientService(session)


def get_reservation_service(session: DBSession) -> ReservationService:
    """Get reservation service instance."""
    return ReservationService(session)


def get_sale_service(session: DBSession) -> SaleService:
    """Get sale service instance."""
    return SaleService(session)


def get_dashboard_service(session: DBSession) -> DashboardService:
    """Get dashboard service instance."""
    return DashboardService(session)


def get_audit_service(session: DBSession) -> AuditService:
    """Get audit service instance."""
    return AuditService(session)


def get_payment_service(session: DBSession) -> PaymentService:
    """Get payment service instance."""
    return PaymentService(session)


def get_certificate_service() -> CertificateService:
    """Get certificate service instance (no DB session needed)."""
    return CertificateService()


# Typed service dependencies
AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]
UserServiceDep = Annotated[UserService, Depends(get_user_service)]
ProjectServiceDep = Annotated[ProjectService, Depends(get_project_service)]
LotServiceDep = Annotated[LotService, Depends(get_lot_service)]
ClientServiceDep = Annotated[ClientService, Depends(get_client_service)]
ReservationServiceDep = Annotated[ReservationService, Depends(get_reservation_service)]
SaleServiceDep = Annotated[SaleService, Depends(get_sale_service)]
DashboardServiceDep = Annotated[DashboardService, Depends(get_dashboard_service)]
AuditServiceDep = Annotated[AuditService, Depends(get_audit_service)]
PaymentServiceDep = Annotated[PaymentService, Depends(get_payment_service)]
CertificateServiceDep = Annotated[CertificateService, Depends(get_certificate_service)]
