"""Authentication endpoints."""

from fastapi import APIRouter

from app.api.dependencies import AuthServiceDep, CurrentUser
from app.domain.schemas.user import TokenResponse, UserLogin, UserResponse

router = APIRouter()


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login",
    description="Authenticate user and receive JWT token",
)
async def login(
    credentials: UserLogin,
    auth_service: AuthServiceDep,
) -> TokenResponse:
    """Authenticate user and return access token."""
    return await auth_service.login(credentials)


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current user",
    description="Get currently authenticated user's information",
)
async def get_current_user_info(
    current_user: CurrentUser,
) -> UserResponse:
    """Get current authenticated user."""
    return current_user
