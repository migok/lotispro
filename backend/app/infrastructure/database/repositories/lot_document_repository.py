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

    async def get_latest_by_reservation(
        self, reservation_id: int, category: str
    ) -> LotDocumentModel | None:
        """Return the most recent document of ``category`` for a reservation."""
        result = await self.session.execute(
            select(LotDocumentModel)
            .where(
                LotDocumentModel.reservation_id == reservation_id,
                LotDocumentModel.category == category,
            )
            .order_by(LotDocumentModel.created_at.desc(), LotDocumentModel.id.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()
