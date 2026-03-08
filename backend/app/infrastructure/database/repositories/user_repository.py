"""User repository implementation."""

from sqlalchemy import select

from app.infrastructure.database.models import UserModel
from app.infrastructure.database.repositories.base import BaseRepository


class UserRepository(BaseRepository[UserModel]):
    """Repository for user data access operations."""

    model = UserModel

    async def get_by_email(self, email: str) -> UserModel | None:
        """Get user by email address.

        Args:
            email: User email

        Returns:
            User model or None if not found
        """
        result = await self.session.execute(
            select(UserModel).where(UserModel.email == email)
        )
        return result.scalar_one_or_none()

    async def get_all_by_role(self, role: str | None = None) -> list[UserModel]:
        """Get all users, optionally filtered by role.

        Args:
            role: Optional role filter

        Returns:
            List of users
        """
        query = select(UserModel)

        if role:
            query = query.where(UserModel.role == role)

        query = query.order_by(UserModel.created_at.desc())

        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def email_exists(self, email: str, exclude_id: int | None = None) -> bool:
        """Check if email is already in use.

        Args:
            email: Email to check
            exclude_id: Optional user ID to exclude from check

        Returns:
            True if email exists, False otherwise
        """
        query = select(UserModel.id).where(UserModel.email == email)

        if exclude_id:
            query = query.where(UserModel.id != exclude_id)

        result = await self.session.execute(query)
        return result.scalar_one_or_none() is not None

    async def create_user(
        self,
        email: str,
        password_hash: str,
        name: str,
        role: str,
        first_name: str | None = None,
        last_name: str | None = None,
        address: str | None = None,
        company: str | None = None,
    ) -> UserModel:
        """Create a new user.

        Args:
            email: User email
            password_hash: Hashed password
            name: User display name
            role: User role
            first_name: Optional first name
            last_name: Optional last name
            address: Optional address
            company: Optional company

        Returns:
            Created user model
        """
        return await self.create(
            email=email,
            password_hash=password_hash,
            name=name,
            role=role,
            first_name=first_name,
            last_name=last_name,
            address=address,
            company=company,
        )
