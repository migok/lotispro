"""Authentication service - Login, registration, and token management."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AlreadyExistsError, AuthenticationError
from app.core.logging import get_logger
from app.core.security import create_access_token, hash_password, verify_password
from app.domain.schemas.user import TokenResponse, UserCreate, UserLogin, UserResponse
from app.infrastructure.database.repositories import UserRepository

logger = get_logger(__name__)


class AuthService:
    """Service for authentication operations."""

    def __init__(self, session: AsyncSession):
        """Initialize with database session.

        Args:
            session: SQLAlchemy async session
        """
        self.session = session
        self.user_repo = UserRepository(session)

    async def register(self, user_data: UserCreate) -> UserResponse:
        """Register a new user.

        Args:
            user_data: User registration data

        Returns:
            Created user response

        Raises:
            AlreadyExistsError: If email already in use
        """
        # Check if email exists
        if await self.user_repo.email_exists(user_data.email):
            logger.warning(
                "Registration failed - email exists",
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
            "User registered successfully",
            user_id=user.id,
            email=user.email,
            role=user.role,
        )

        return UserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            role=user.role,
            created_at=user.created_at,
            updated_at=user.updated_at,
        )

    async def login(self, credentials: UserLogin) -> TokenResponse:
        """Authenticate user and generate token.

        Args:
            credentials: Login credentials

        Returns:
            Token response with user info

        Raises:
            AuthenticationError: If credentials are invalid
        """
        # Find user by email
        user = await self.user_repo.get_by_email(credentials.email)

        if not user:
            logger.warning(
                "Login failed - user not found",
                email=credentials.email,
            )
            raise AuthenticationError("Invalid email or password")

        # Verify password
        if not verify_password(credentials.password, user.password_hash):
            logger.warning(
                "Login failed - invalid password",
                email=credentials.email,
            )
            raise AuthenticationError("Invalid email or password")

        # Generate token
        access_token = create_access_token(subject=user.id)

        logger.info(
            "User logged in successfully",
            user_id=user.id,
            email=user.email,
        )

        return TokenResponse(
            access_token=access_token,
            token_type="bearer",
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user=UserResponse(
                id=user.id,
                email=user.email,
                name=user.name,
                role=user.role,
                created_at=user.created_at,
                updated_at=user.updated_at,
            ),
        )

    async def get_current_user(self, user_id: int) -> UserResponse:
        """Get current authenticated user info.

        Args:
            user_id: User ID from token

        Returns:
            User response

        Raises:
            AuthenticationError: If user not found
        """
        user = await self.user_repo.get_by_id(user_id)

        if not user:
            logger.warning(
                "Get current user failed - user not found",
                user_id=user_id,
            )
            raise AuthenticationError("User not found")

        return UserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            role=user.role,
            created_at=user.created_at,
            updated_at=user.updated_at,
        )
