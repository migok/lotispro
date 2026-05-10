"""Notaire repository implementation."""

from sqlalchemy import or_, select

from app.infrastructure.database.models import NotaireModel
from app.infrastructure.database.repositories.base import BaseRepository


class NotaireRepository(BaseRepository[NotaireModel]):
    """Repository for notaire data access operations."""

    model = NotaireModel

    async def get_filtered(
        self,
        search: str | None = None,
        offset: int = 0,
        limit: int = 100,
    ) -> list[NotaireModel]:
        """Get notaires with optional search filter.

        Args:
            search: Search term for nom, prenom, or telephone
            offset: Pagination offset
            limit: Pagination limit

        Returns:
            List of notaires
        """
        query = select(NotaireModel)

        if search:
            term = f"%{search}%"
            query = query.where(
                or_(
                    NotaireModel.nom.ilike(term),
                    NotaireModel.prenom.ilike(term),
                    NotaireModel.telephone.ilike(term),
                )
            )

        query = query.order_by(NotaireModel.nom, NotaireModel.prenom).offset(offset).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
