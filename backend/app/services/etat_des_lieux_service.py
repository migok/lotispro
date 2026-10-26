"""État des lieux service: EDL transitions of a lot and the actions they raise.

Transitions (see ``lot_workflow``): ``edl_schedule`` (soldée → programmé),
``edl_reschedule`` (programmé, unchanged), ``edl_done`` (programmé → réalisé),
``edl_finalize`` (réalisé → finalisé, refused while an action is open).
The état des lieux is linked to the lot's current reservation.
"""

from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleError, NotFoundError
from app.core.logging import get_logger
from app.domain.lot_workflow import STATUS_LABELS, assert_transition_allowed
from app.domain.schemas.etat_des_lieux import (
    EdlActionCreate,
    EdlActionResponse,
    EdlActionUpdate,
    EdlDoneData,
    EdlScheduleData,
    EtatDesLieuxResponse,
)
from app.domain.schemas.lot import LotResponse
from app.infrastructure.database.models import EtatDesLieuxModel, LotModel
from app.infrastructure.database.repositories import (
    EtatDesLieuxRepository,
    LotRepository,
    ProjectRepository,
)

logger = get_logger(__name__)

# Actions can only be added, edited or removed once the visit is done.
_ACTIONS_EDITABLE_STATUS = "edl_realise"


class EtatDesLieuxService:
    """Use cases of the état des lieux workflow."""

    def __init__(self, session: AsyncSession):
        """Initialize with database session."""
        self.session = session
        self.lot_repo = LotRepository(session)
        self.project_repo = ProjectRepository(session)
        self.edl_repo = EtatDesLieuxRepository(session)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _get_lot(self, lot_id: int) -> LotModel:
        lot = await self.lot_repo.get_by_id(lot_id)
        if not lot:
            raise NotFoundError("Lot", lot_id)
        return lot

    async def _assert(self, lot: LotModel, transition: str) -> str:
        enabled = await self.project_repo.get_enabled_optional(lot.project_id)
        return assert_transition_allowed(enabled, transition, lot.status)

    async def _find_edl(self, lot: LotModel) -> EtatDesLieuxModel | None:
        if not lot.current_reservation_id:
            return None
        return await self.edl_repo.get_for_reservation(
            lot.id, lot.current_reservation_id
        )

    async def _require_edl(self, lot: LotModel) -> EtatDesLieuxModel:
        edl = await self._find_edl(lot)
        if edl is None:
            raise NotFoundError("État des lieux", lot.id)
        return edl

    async def _editable_edl(self, lot_id: int) -> EtatDesLieuxModel:
        lot = await self._get_lot(lot_id)
        if lot.status != _ACTIONS_EDITABLE_STATUS:
            raise BusinessRuleError(
                message=(
                    "Les actions de l'état des lieux ne sont modifiables qu'au "
                    f"statut « {STATUS_LABELS[_ACTIONS_EDITABLE_STATUS]} »."
                ),
                rule="invalid_lot_status",
            )
        return await self._require_edl(lot)

    async def _lot_response(self, lot_id: int) -> LotResponse:
        return LotResponse.model_validate(await self.lot_repo.get_by_id(lot_id))

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    async def get_for_lot(self, lot_id: int) -> EtatDesLieuxResponse:
        """État des lieux of the lot's current reservation, with its actions.

        Raises:
            NotFoundError: Lot not found or no état des lieux
        """
        lot = await self._get_lot(lot_id)
        edl = await self._require_edl(lot)
        actions = await self.edl_repo.list_actions(edl.id)
        response = EtatDesLieuxResponse.model_validate(edl)
        response.actions = [EdlActionResponse.model_validate(a) for a in actions]
        return response

    # ------------------------------------------------------------------
    # Transitions
    # ------------------------------------------------------------------

    async def schedule(
        self, lot_id: int, data: EdlScheduleData, user_id: int | None = None
    ) -> LotResponse:
        """Programme the état des lieux: reservation_soldee → edl_programme.

        Raises:
            NotFoundError: Lot not found
            BusinessRuleError: Wrong status, EDL disabled for the project
                (``status_disabled``) or no current reservation
        """
        lot = await self._get_lot(lot_id)
        new_status = await self._assert(lot, "edl_schedule")
        if not lot.current_reservation_id:
            raise BusinessRuleError(
                message="Aucune réservation active trouvée pour ce lot",
                rule="no_active_reservation",
            )

        await self.edl_repo.create(
            lot_id=lot.id,
            reservation_id=lot.current_reservation_id,
            scheduled_at=data.scheduled_at,
            intervenant=data.intervenant,
            schedule_note=data.note,
        )
        await self.lot_repo.change_status(
            lot_id, new_status, transition="edl_schedule", user_id=user_id
        )
        logger.info("EDL scheduled", lot_id=lot_id, user_id=user_id)
        return await self._lot_response(lot_id)

    async def reschedule(
        self, lot_id: int, data: EdlScheduleData, user_id: int | None = None
    ) -> LotResponse:
        """Change the date / intervenant of a programmed état des lieux."""
        lot = await self._get_lot(lot_id)
        await self._assert(lot, "edl_reschedule")
        edl = await self._require_edl(lot)

        await self.edl_repo.set_fields(
            edl.id,
            scheduled_at=data.scheduled_at,
            intervenant=data.intervenant,
            schedule_note=data.note,
        )
        logger.info("EDL rescheduled", lot_id=lot_id, user_id=user_id)
        return await self._lot_response(lot_id)

    async def mark_done(
        self, lot_id: int, data: EdlDoneData, user_id: int | None = None
    ) -> LotResponse:
        """Record the visit and its actions: edl_programme → edl_realise."""
        lot = await self._get_lot(lot_id)
        new_status = await self._assert(lot, "edl_done")
        edl = await self._require_edl(lot)

        await self.edl_repo.set_fields(
            edl.id, done_at=data.done_at, done_note=data.note
        )
        for action in data.actions:
            await self.edl_repo.add_action(
                edl.id, action.description, action.responsable
            )
        await self.lot_repo.change_status(
            lot_id, new_status, transition="edl_done", user_id=user_id
        )
        logger.info(
            "EDL done", lot_id=lot_id, actions=len(data.actions), user_id=user_id
        )
        return await self._lot_response(lot_id)

    async def finalize(self, lot_id: int, user_id: int | None = None) -> LotResponse:
        """Close the état des lieux: edl_realise → edl_finalise.

        Raises:
            BusinessRuleError: An action is still open (``edl_open_actions``)
        """
        lot = await self._get_lot(lot_id)
        new_status = await self._assert(lot, "edl_finalize")
        edl = await self._require_edl(lot)

        open_count = await self.edl_repo.count_open_actions(edl.id)
        if open_count:
            raise BusinessRuleError(
                message=(
                    f"Impossible de finaliser : {open_count} action(s) encore "
                    "ouverte(s)."
                ),
                rule="edl_open_actions",
            )

        await self.edl_repo.set_fields(edl.id, finalized_at=datetime.now(UTC))
        await self.lot_repo.change_status(
            lot_id, new_status, transition="edl_finalize", user_id=user_id
        )
        logger.info("EDL finalized", lot_id=lot_id, user_id=user_id)
        return await self._lot_response(lot_id)

    # ------------------------------------------------------------------
    # Actions (edl_realise only)
    # ------------------------------------------------------------------

    async def add_action(self, lot_id: int, data: EdlActionCreate) -> EdlActionResponse:
        """Add an open action to the état des lieux."""
        edl = await self._editable_edl(lot_id)
        action = await self.edl_repo.add_action(
            edl.id, data.description, data.responsable
        )
        return EdlActionResponse.model_validate(action)

    async def update_action(
        self, lot_id: int, action_id: int, data: EdlActionUpdate
    ) -> EdlActionResponse:
        """Edit an action; ``faite`` stamps ``done_at``, ``ouverte`` clears it."""
        edl = await self._editable_edl(lot_id)
        action = await self.edl_repo.get_action(edl.id, action_id)
        if action is None:
            raise NotFoundError("Action", action_id)

        changes = data.model_dump(exclude_unset=True)
        if changes.get("description") is None:
            changes.pop("description", None)
        if "status" in changes:
            if changes["status"] is None:
                del changes["status"]
            elif changes["status"] != action.status:
                changes["done_at"] = (
                    datetime.now(UTC) if changes["status"] == "faite" else None
                )
        if not changes:
            return EdlActionResponse.model_validate(action)

        updated = await self.edl_repo.update_action(action_id, **changes)
        return EdlActionResponse.model_validate(updated)

    async def delete_action(self, lot_id: int, action_id: int) -> None:
        """Remove an action."""
        edl = await self._editable_edl(lot_id)
        if await self.edl_repo.get_action(edl.id, action_id) is None:
            raise NotFoundError("Action", action_id)
        await self.edl_repo.delete_action(action_id)
