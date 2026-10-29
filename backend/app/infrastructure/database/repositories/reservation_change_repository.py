"""Audit trail of the edits of an engaged reservation (``reservation_changes``)."""

from sqlalchemy import select

from app.infrastructure.database.models import ReservationChangeModel, UserModel
from app.infrastructure.database.repositories.base import BaseRepository


class ReservationChangeRepository(BaseRepository[ReservationChangeModel]):
    """Data access for ``reservation_changes`` (rows are only created and read)."""

    model = ReservationChangeModel

    async def list_with_author(
        self, reservation_id: int
    ) -> list[tuple[ReservationChangeModel, str | None]]:
        """Edits of a reservation, newest first, with the author's name."""
        result = await self.session.execute(
            select(ReservationChangeModel, UserModel.name)
            .outerjoin(UserModel, UserModel.id == ReservationChangeModel.user_id)
            .where(ReservationChangeModel.reservation_id == reservation_id)
            .order_by(
                ReservationChangeModel.changed_at.desc(),
                ReservationChangeModel.id.desc(),
            )
        )
        return [(change, name) for change, name in result.all()]
