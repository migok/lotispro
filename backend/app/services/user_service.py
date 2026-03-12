"""User service - User management operations."""

from datetime import timedelta, timezone
from datetime import datetime as dt

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AlreadyExistsError, BusinessRuleError, NotFoundError, ValidationError
from app.core.logging import get_logger
from app.core.security import generate_invitation_token, hash_password
from app.domain.schemas.user import SetPasswordRequest, UserCreate, UserInvite, UserResponse
from app.infrastructure.database.repositories import UserRepository
from app.services.email_service import EmailService

logger = get_logger(__name__)


def _to_response(user: object) -> UserResponse:
    """Map a UserModel to UserResponse."""
    return UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        first_name=user.first_name,
        last_name=user.last_name,
        address=user.address,
        company=user.company,
        role=user.role,
        is_pending=user.invitation_token is not None,
        invitation_token=user.invitation_token,  # visible tant que pending (pour debug / dev sans email)
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


class UserService:
    """Service for user management operations."""

    def __init__(self, session: AsyncSession):
        """Initialize with database session."""
        self.session = session
        self.user_repo = UserRepository(session)
        self.email_service = EmailService()

    async def get_users(self, role: str | None = None) -> list[UserResponse]:
        """Get all users, optionally filtered by role."""
        users = await self.user_repo.get_all_by_role(role)
        return [_to_response(u) for u in users]

    async def get_user(self, user_id: int) -> UserResponse:
        """Get user by ID."""
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User", user_id)
        return _to_response(user)

    async def delete_user(self, user_id: int, current_user_id: int) -> None:
        """Delete a user."""
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User", user_id)
        if user_id == current_user_id:
            raise BusinessRuleError(
                message="Cannot delete your own account",
                rule="self_deletion_not_allowed",
            )
        await self.user_repo.detach_user(user_id)
        await self.user_repo.delete(user_id)
        logger.info("User deleted", user_id=user_id, deleted_by=current_user_id)

    async def invite_user(self, data: UserInvite, invited_by_id: int) -> UserResponse:
        """Create a pending user account and send an invitation email.

        The user does NOT have a usable password yet — the invitation link
        lets them define it.
        """
        if await self.user_repo.email_exists(data.email):
            logger.warning("Invite failed — email exists", email=data.email)
            raise AlreadyExistsError(resource="User", field="email", value=data.email)

        token = generate_invitation_token()
        expires_at = dt.now(timezone.utc) + timedelta(hours=settings.INVITATION_EXPIRE_HOURS)
        full_name = f"{data.first_name} {data.last_name}"

        # Unusable placeholder — bcrypt hash of a random secret
        import secrets as _s
        placeholder_hash = hash_password(_s.token_hex(32))

        user = await self.user_repo.create_user(
            email=data.email,
            password_hash=placeholder_hash,
            name=full_name,
            role=data.role,
            first_name=data.first_name,
            last_name=data.last_name,
            address=data.address,
            company=data.company,
            invitation_token=token,
            invitation_expires_at=expires_at,
        )

        await self.email_service.send_invitation_email(
            first_name=data.first_name,
            last_name=data.last_name,
            email=data.email,
            role=data.role,
            invitation_token=token,
            frontend_url=settings.FRONTEND_URL,
        )

        logger.info(
            "User invited",
            user_id=user.id,
            email=user.email,
            role=user.role,
            invited_by=invited_by_id,
        )
        return _to_response(user)

    async def set_password_from_token(self, data: SetPasswordRequest) -> UserResponse:
        """Activate a pending account by setting the password via invitation token."""
        user = await self.user_repo.get_by_invitation_token(data.token)

        if not user:
            raise NotFoundError("Invitation token", data.token)

        if user.invitation_expires_at and user.invitation_expires_at < dt.now(timezone.utc):
            raise ValidationError(
                message="Invitation token has expired. Ask an administrator to resend the invitation.",
                field="token",
            )

        user.password_hash = hash_password(data.password)
        user.invitation_token = None
        user.invitation_expires_at = None
        await self.session.commit()
        await self.session.refresh(user)

        logger.info("Password set via invitation", user_id=user.id, email=user.email)
        return _to_response(user)

    async def create_user(self, user_data: UserCreate, created_by_id: int) -> UserResponse:
        """Create a user with a password (legacy — used by seed scripts).

        For normal staff creation, prefer invite_user().
        """
        if await self.user_repo.email_exists(user_data.email):
            logger.warning("User creation failed - email exists", email=user_data.email)
            raise AlreadyExistsError(resource="User", field="email", value=user_data.email)

        password_hash = hash_password(user_data.password)
        user = await self.user_repo.create_user(
            email=user_data.email,
            password_hash=password_hash,
            name=user_data.name,
            role=user_data.role,
            first_name=user_data.first_name,
            last_name=user_data.last_name,
            address=user_data.address,
            company=user_data.company,
        )

        logger.info(
            "User created directly",
            user_id=user.id,
            email=user.email,
            role=user.role,
            created_by=created_by_id,
        )
        return _to_response(user)
