"""Base repository with common CRUD operations."""

from typing import Any, Generic, TypeVar

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.infrastructure.database.models import Base

logger = get_logger(__name__)

ModelType = TypeVar("ModelType", bound=Base)


class BaseRepository(Generic[ModelType]):
    """Base repository providing common CRUD operations.

    Subclasses should set the `model` class attribute to the SQLAlchemy model.
    """

    model: type[ModelType]

    def __init__(self, session: AsyncSession):
        """Initialize repository with database session.

        Args:
            session: SQLAlchemy async session
        """
        self.session = session

    async def get_by_id(self, id: int) -> ModelType | None:
        """Get a record by its primary key.

        Args:
            id: Primary key value

        Returns:
            Model instance or None if not found
        """
        result = await self.session.execute(
            select(self.model).where(self.model.id == id)
        )
        return result.scalar_one_or_none()

    async def get_all(
        self,
        offset: int = 0,
        limit: int = 100,
    ) -> list[ModelType]:
        """Get all records with optional pagination.

        Args:
            offset: Number of records to skip
            limit: Maximum number of records to return

        Returns:
            List of model instances
        """
        result = await self.session.execute(
            select(self.model).offset(offset).limit(limit)
        )
        return list(result.scalars().all())

    async def create(self, **kwargs: Any) -> ModelType:
        """Create a new record.

        Args:
            **kwargs: Field values for the new record

        Returns:
            Created model instance
        """
        instance = self.model(**kwargs)
        self.session.add(instance)
        await self.session.flush()
        await self.session.refresh(instance)

        logger.debug(
            "Created record",
            model=self.model.__tablename__,
            id=instance.id,
        )

        return instance

    async def update(self, id: int, **kwargs: Any) -> ModelType | None:
        """Update a record by ID.

        Args:
            id: Primary key value
            **kwargs: Field values to update

        Returns:
            Updated model instance or None if not found
        """
        # Filter out None values to avoid overwriting with nulls
        update_data = {k: v for k, v in kwargs.items() if v is not None}

        if not update_data:
            return await self.get_by_id(id)

        await self.session.execute(
            update(self.model).where(self.model.id == id).values(**update_data)
        )
        await self.session.flush()

        logger.debug(
            "Updated record",
            model=self.model.__tablename__,
            id=id,
            fields=list(update_data.keys()),
        )

        return await self.get_by_id(id)

    async def delete(self, id: int) -> bool:
        """Delete a record by ID.

        Args:
            id: Primary key value

        Returns:
            True if deleted, False if not found
        """
        result = await self.session.execute(
            delete(self.model).where(self.model.id == id)
        )
        await self.session.flush()

        deleted = result.rowcount > 0

        if deleted:
            logger.debug(
                "Deleted record",
                model=self.model.__tablename__,
                id=id,
            )

        return deleted

    async def count(self) -> int:
        """Count total records.

        Returns:
            Total number of records
        """
        from sqlalchemy import func

        result = await self.session.execute(
            select(func.count()).select_from(self.model)
        )
        return result.scalar() or 0

    async def exists(self, id: int) -> bool:
        """Check if a record exists.

        Args:
            id: Primary key value

        Returns:
            True if exists, False otherwise
        """
        result = await self.session.execute(
            select(self.model.id).where(self.model.id == id)
        )
        return result.scalar_one_or_none() is not None
