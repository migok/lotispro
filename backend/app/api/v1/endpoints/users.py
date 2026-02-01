"""User management endpoints."""

from fastapi import APIRouter, status

from app.api.dependencies import ManagerUser, UserServiceDep
from app.domain.schemas.common import MessageResponse
from app.domain.schemas.user import UserCreate, UserResponse

router = APIRouter()


@router.post(
    "",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create user",
    description="Create a new user (manager only). Used to add commercials.",
)
async def create_user(
    user_data: UserCreate,
    current_user: ManagerUser,
    user_service: UserServiceDep,
) -> UserResponse:
    """Create a new user. Manager only."""
    return await user_service.create_user(user_data, current_user.id)


@router.get(
    "",
    response_model=list[UserResponse],
    summary="List users",
    description="Get all users (manager only). Optionally filter by role.",
)
async def list_users(
    current_user: ManagerUser,
    user_service: UserServiceDep,
    role: str | None = None,
) -> list[UserResponse]:
    """List all users. Manager only."""
    return await user_service.get_users(role=role)


@router.get(
    "/{user_id}",
    response_model=UserResponse,
    summary="Get user",
    description="Get user by ID (manager only)",
)
async def get_user(
    user_id: int,
    current_user: ManagerUser,
    user_service: UserServiceDep,
) -> UserResponse:
    """Get user by ID. Manager only."""
    return await user_service.get_user(user_id)


@router.delete(
    "/{user_id}",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Delete user",
    description="Delete a user (manager only, cannot delete self)",
)
async def delete_user(
    user_id: int,
    current_user: ManagerUser,
    user_service: UserServiceDep,
) -> MessageResponse:
    """Delete a user. Manager only."""
    await user_service.delete_user(user_id, current_user.id)
    return MessageResponse(message="User deleted successfully")
