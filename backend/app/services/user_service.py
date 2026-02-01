"""User service - User management operations."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AlreadyExistsError, BusinessRuleError, NotFoundError
from app.core.logging import get_logger
from app.core.security import hash_password
from app.domain.schemas.user import UserCreate, UserResponse
from app.infrastructure.database.repositories import UserRepository

logger = get_logger(__name__)


class UserService:
    """Service for user management operations."""

    def __init__(self, session: AsyncSession):
        """Initialize with database session."""
        self.session = session
        self.user_repo = UserRepository(session)

    async def get_users(self, role: str | None = None) -> list[UserResponse]:
        """Get all users, optionally filtered by role.

        Args:
            role: Optional role filter

        Returns:
            List of user responses
        """
        users = await self.user_repo.get_all_by_role(role)

        return [
            UserResponse(
                id=user.id,
                email=user.email,
                name=user.name,
                role=user.role,
                created_at=user.created_at,
                updated_at=user.updated_at,
            )
            for user in users
        ]

    async def get_user(self, user_id: int) -> UserResponse:
        """Get user by ID.

        Args:
            user_id: User ID

        Returns:
            User response

        Raises:
            NotFoundError: If user not found
        """
        user = await self.user_repo.get_by_id(user_id)

        if not user:
            raise NotFoundError("User", user_id)

        return UserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            role=user.role,
            created_at=user.created_at,
            updated_at=user.updated_at,
        )

    async def delete_user(
        self,
        user_id: int,
        current_user_id: int,
    ) -> None:
        """Delete a user.

        Args:
            user_id: User to delete
            current_user_id: User performing deletion

        Raises:
            NotFoundError: If user not found
            BusinessRuleError: If trying to delete self
        """
        # Check user exists
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User", user_id)

        # Cannot delete self
        if user_id == current_user_id:
            raise BusinessRuleError(
                message="Cannot delete your own account",
                rule="self_deletion_not_allowed",
            )

        # Delete user
        await self.user_repo.delete(user_id)

        logger.info(
            "User deleted",
            user_id=user_id,
            deleted_by=current_user_id,
        )

    async def create_user(
        self,
        user_data: UserCreate,
        created_by_id: int,
    ) -> UserResponse:
        """Create a new user (commercial).

        Args:
            user_data: User creation data
            created_by_id: ID of user creating this user

        Returns:
            Created user response

        Raises:
            AlreadyExistsError: If email already in use
        """
        # Check if email exists
        if await self.user_repo.email_exists(user_data.email):
            logger.warning(
                "User creation failed - email exists",
                email=user_data.email,
            )
            raise AlreadyExistsError(
                resource="User",
                field="email",
                value=user_data.email,
            )

        # Hash password
        password_hash = hash_password(user_data.password)

        # Create user
        user = await self.user_repo.create_user(
            email=user_data.email,
            password_hash=password_hash,
            name=user_data.name,
            role=user_data.role,
        )

        logger.info(
            "User created successfully",
            user_id=user.id,
            email=user.email,
            role=user.role,
            created_by=created_by_id,
        )

        return UserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            role=user.role,
            created_at=user.created_at,
            updated_at=user.updated_at,
        )
