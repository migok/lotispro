"""Repository for lot document management."""

from sqlalchemy import select

from app.infrastructure.database.models import LotDocumentModel
from app.infrastructure.database.repositories.base import BaseRepository


class LotDocumentRepository(BaseRepository[LotDocumentModel]):
    """Repository for LotDocumentModel CRUD operations."""

    model = LotDocumentModel

    async def get_by_lot(self, lot_id: int) -> list[LotDocumentModel]:
        """Return all documents attached to a lot, ordered by creation date."""
        result = await self.session.execute(
            select(LotDocumentModel)
            .where(LotDocumentModel.lot_id == lot_id)
            .order_by(LotDocumentModel.created_at.desc())
        )
        return list(result.scalars().all())
