"""Notification history repository."""

from sqlalchemy import select

from app.infrastructure.database.models import NotificationModel
from app.infrastructure.database.repositories.base import BaseRepository


class NotificationRepository(BaseRepository[NotificationModel]):
    """Data access for ``notifications``."""

    model = NotificationModel

    async def list_filtered(
        self, client_id: int | None, lot_id: int | None
    ) -> list[NotificationModel]:
        """Notifications of a client and/or a lot, most recent first."""
        query = select(NotificationModel)
        if client_id is not None:
            query = query.where(NotificationModel.client_id == client_id)
        if lot_id is not None:
            query = query.where(NotificationModel.lot_id == lot_id)
        query = query.order_by(
            NotificationModel.sent_at.desc(), NotificationModel.id.desc()
        )
        result = await self.session.execute(query)
        return list(result.scalars().all())
