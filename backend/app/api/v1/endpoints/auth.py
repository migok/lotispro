"""Authentication endpoints."""

from fastapi import APIRouter

from app.api.dependencies import AuthServiceDep, CurrentUser, UserServiceDep
from app.domain.schemas.user import ForgotPasswordRequest, TokenResponse, UserLogin, UserResponse

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


@router.post(
    "/forgot-password",
    summary="Request password reset",
    description="Send a password reset link to the given email address",
    status_code=200,
)
async def forgot_password(
    data: ForgotPasswordRequest,
    user_service: UserServiceDep,
) -> dict[str, str]:
    """Send a password reset email if the account exists."""
    await user_service.request_password_reset(data)
    return {"message": "Un lien de réinitialisation a été envoyé à cet email."}


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
