"""État des lieux repository: EDL rows and their actions."""

from typing import Any

from sqlalchemy import delete, func, select, update

from app.infrastructure.database.models import EdlActionModel, EtatDesLieuxModel
from app.infrastructure.database.repositories.base import BaseRepository


class EtatDesLieuxRepository(BaseRepository[EtatDesLieuxModel]):
    """Data access for ``etats_des_lieux`` and ``edl_actions``."""

    model = EtatDesLieuxModel

    async def get_for_reservation(
        self, lot_id: int, reservation_id: int
    ) -> EtatDesLieuxModel | None:
        """Latest état des lieux of ``lot_id`` for ``reservation_id``."""
        result = await self.session.execute(
            select(EtatDesLieuxModel)
            .where(
                EtatDesLieuxModel.lot_id == lot_id,
                EtatDesLieuxModel.reservation_id == reservation_id,
            )
            .order_by(EtatDesLieuxModel.id.desc())
            .limit(1)
            .execution_options(populate_existing=True)
        )
        return result.scalar_one_or_none()

    async def set_fields(self, edl_id: int, **fields: Any) -> None:
        """Write ``fields`` on the état des lieux (``None`` included)."""
        await self.session.execute(
            update(EtatDesLieuxModel)
            .where(EtatDesLieuxModel.id == edl_id)
            .values(**fields)
        )
        await self.session.flush()

    async def summaries_by_reservation(
        self, reservation_ids: list[int]
    ) -> dict[int, dict[str, Any]]:
        """Card summary of the latest état des lieux of each reservation.

        Returns ``{reservation_id: {edl_scheduled_at, edl_intervenant,
        edl_open_actions_count}}`` for the reservations that have one.
        """
        if not reservation_ids:
            return {}
        open_counts = (
            select(
                EdlActionModel.etat_des_lieux_id,
                func.count(EdlActionModel.id).label("open_count"),
            )
            .where(EdlActionModel.status == "ouverte")
            .group_by(EdlActionModel.etat_des_lieux_id)
            .subquery()
        )
        result = await self.session.execute(
            select(EtatDesLieuxModel, func.coalesce(open_counts.c.open_count, 0))
            .outerjoin(
                open_counts, open_counts.c.etat_des_lieux_id == EtatDesLieuxModel.id
            )
            .where(EtatDesLieuxModel.reservation_id.in_(reservation_ids))
            .order_by(EtatDesLieuxModel.id)
        )
        # Ascending ids: the latest EDL of a reservation wins.
        return {
            edl.reservation_id: {
                "edl_scheduled_at": edl.scheduled_at,
                "edl_intervenant": edl.intervenant,
                "edl_open_actions_count": open_count,
            }
            for edl, open_count in result.all()
        }

    # ------------------------------------------------------------------
    # Actions
    # ------------------------------------------------------------------

    async def list_actions(self, edl_id: int) -> list[EdlActionModel]:
        """Actions of an état des lieux, oldest first."""
        result = await self.session.execute(
            select(EdlActionModel)
            .where(EdlActionModel.etat_des_lieux_id == edl_id)
            .order_by(EdlActionModel.id)
        )
        return list(result.scalars().all())

    async def add_action(
        self, edl_id: int, description: str, responsable: str | None
    ) -> EdlActionModel:
        """Create an ``ouverte`` action."""
        action = EdlActionModel(
            etat_des_lieux_id=edl_id,
            description=description,
            responsable=responsable,
            status="ouverte",
        )
        self.session.add(action)
        await self.session.flush()
        await self.session.refresh(action)
        return action

    async def get_action(self, edl_id: int, action_id: int) -> EdlActionModel | None:
        """Action ``action_id`` if it belongs to ``edl_id``."""
        result = await self.session.execute(
            select(EdlActionModel).where(
                EdlActionModel.id == action_id,
                EdlActionModel.etat_des_lieux_id == edl_id,
            )
        )
        return result.scalar_one_or_none()

    async def update_action(self, action_id: int, **fields: Any) -> EdlActionModel:
        """Write ``fields`` on the action (``None`` included) and return it."""
        await self.session.execute(
            update(EdlActionModel)
            .where(EdlActionModel.id == action_id)
            .values(**fields)
        )
        await self.session.flush()
        result = await self.session.execute(
            select(EdlActionModel)
            .where(EdlActionModel.id == action_id)
            .execution_options(populate_existing=True)
        )
        return result.scalar_one()

    async def delete_action(self, action_id: int) -> None:
        """Delete the action."""
        await self.session.execute(
            delete(EdlActionModel).where(EdlActionModel.id == action_id)
        )
        await self.session.flush()

    async def count_open_actions(self, edl_id: int) -> int:
        """Number of ``ouverte`` actions of an état des lieux."""
        result = await self.session.execute(
            select(func.count(EdlActionModel.id)).where(
                EdlActionModel.etat_des_lieux_id == edl_id,
                EdlActionModel.status == "ouverte",
            )
        )
        return result.scalar_one()
