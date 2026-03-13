"""Lot service - Lot management operations."""

import json
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    AlreadyExistsError,
    BusinessRuleError,
    NotFoundError,
)
from app.core.logging import get_logger
from app.domain.schemas.lot import LotBulkMetadataUpdate, LotCreate, LotFilter, LotResponse, LotUpdate
from app.infrastructure.database.repositories import LotRepository, ProjectRepository

logger = get_logger(__name__)


def _parse_geometry(geometry_str: str | None) -> dict[str, Any] | None:
    """Parse geometry JSON string to dict."""
    if not geometry_str:
        return None
    try:
        return json.loads(geometry_str)
    except (json.JSONDecodeError, TypeError):
        return None


def _serialize_geometry(geometry: dict[str, Any] | None) -> str | None:
    """Serialize geometry dict to JSON string."""
    if not geometry:
        return None
    return json.dumps(geometry)


class LotService:
    """Service for lot management operations."""

    def __init__(self, session: AsyncSession):
        """Initialize with database session."""
        self.session = session
        self.lot_repo = LotRepository(session)
        self.project_repo = ProjectRepository(session)

    async def get_lots(
        self,
        filters: LotFilter | None = None,
        offset: int = 0,
        limit: int = 100,
    ) -> list[LotResponse]:
        """Get lots with filtering.

        Args:
            filters: Optional filter parameters
            offset: Pagination offset
            limit: Pagination limit

        Returns:
            List of lot responses
        """
        lots = await self.lot_repo.get_filtered(filters, offset, limit)

        return [
            LotResponse(
                id=lot.id,
                project_id=lot.project_id,
                numero=lot.numero,
                zone=lot.zone,
                surface=lot.surface,
                price=lot.price,
                status=lot.status,
                current_reservation_id=lot.current_reservation_id,
                geometry=_parse_geometry(lot.geometry),
                created_at=lot.created_at,
                updated_at=lot.updated_at,
            )
            for lot in lots
        ]

    async def get_lot(self, lot_id: int) -> LotResponse:
        """Get lot by ID.

        Args:
            lot_id: Lot ID

        Returns:
            Lot response

        Raises:
            NotFoundError: If lot not found
        """
        lot = await self.lot_repo.get_by_id(lot_id)

        if not lot:
            raise NotFoundError("Lot", lot_id)

        return LotResponse(
            id=lot.id,
            project_id=lot.project_id,
            numero=lot.numero,
            zone=lot.zone,
            surface=lot.surface,
            price=lot.price,
            status=lot.status,
            current_reservation_id=lot.current_reservation_id,
            geometry=_parse_geometry(lot.geometry),
            created_at=lot.created_at,
            updated_at=lot.updated_at,
        )

    async def create_lot(self, data: LotCreate) -> LotResponse:
        """Create a new lot.

        Args:
            data: Lot creation data

        Returns:
            Created lot response

        Raises:
            NotFoundError: If project not found
            AlreadyExistsError: If numero already exists in project
        """
        # Check project exists
        project = await self.project_repo.get_by_id(data.project_id)
        if not project:
            raise NotFoundError("Project", data.project_id)

        # Check numero doesn't exist
        if await self.lot_repo.numero_exists(data.project_id, data.numero):
            raise AlreadyExistsError(
                resource="Lot",
                field="numero",
                value=data.numero,
                details={"project_id": data.project_id},
            )

        # Serialize geometry to JSON string if provided
        geometry_str = _serialize_geometry(data.geometry)

        # Create lot
        lot = await self.lot_repo.create(
            project_id=data.project_id,
            numero=data.numero,
            zone=data.zone,
            surface=data.surface,
            price=data.price,
            status=data.status,
            geometry=geometry_str,
        )

        # Update project lot count
        await self.project_repo.update_lot_counts(
            data.project_id,
            total_lots=project.total_lots + 1,
        )

        logger.info(
            "Lot created",
            lot_id=lot.id,
            project_id=data.project_id,
            numero=data.numero,
        )

        return LotResponse(
            id=lot.id,
            project_id=lot.project_id,
            numero=lot.numero,
            zone=lot.zone,
            surface=lot.surface,
            price=lot.price,
            status=lot.status,
            current_reservation_id=lot.current_reservation_id,
            geometry=_parse_geometry(lot.geometry),
            created_at=lot.created_at,
            updated_at=lot.updated_at,
        )

    async def update_lot(
        self,
        lot_id: int,
        data: LotUpdate,
    ) -> LotResponse:
        """Update a lot.

        Args:
            lot_id: Lot ID
            data: Update data

        Returns:
            Updated lot response

        Raises:
            NotFoundError: If lot not found
            AlreadyExistsError: If new numero conflicts
        """
        lot = await self.lot_repo.get_by_id(lot_id)
        if not lot:
            raise NotFoundError("Lot", lot_id)

        # Check numero uniqueness if changed
        if data.numero and data.numero != lot.numero:
            if await self.lot_repo.numero_exists(
                lot.project_id, data.numero, exclude_id=lot_id
            ):
                raise AlreadyExistsError(
                    resource="Lot",
                    field="numero",
                    value=data.numero,
                )

        updated = await self.lot_repo.update(
            lot_id,
            numero=data.numero,
            zone=data.zone,
            surface=data.surface,
            price=data.price,
            status=data.status,
        )

        logger.info("Lot updated", lot_id=lot_id)

        return LotResponse(
            id=updated.id,
            project_id=updated.project_id,
            numero=updated.numero,
            zone=updated.zone,
            surface=updated.surface,
            price=updated.price,
            status=updated.status,
            current_reservation_id=updated.current_reservation_id,
            geometry=_parse_geometry(updated.geometry),
            created_at=updated.created_at,
            updated_at=updated.updated_at,
        )

    async def bulk_update_lot_metadata(
        self,
        project_id: int,
        data: LotBulkMetadataUpdate,
    ) -> int:
        """Bulk update metadata on multiple lots (manager only).

        Args:
            project_id: Project ID — lots must belong to this project
            data: Bulk update payload with lot_ids and optional metadata fields

        Returns:
            Number of lots updated
        """
        # Check project exists
        project = await self.project_repo.get_by_id(project_id)
        if not project:
            raise NotFoundError("Project", project_id)

        # Build update dict — only include explicitly provided (non-None) fields
        updates = {}
        if data.type_lot is not None:
            updates["type_lot"] = data.type_lot
        if data.emplacement is not None:
            updates["emplacement"] = data.emplacement
        if data.type_maison is not None:
            updates["type_maison"] = data.type_maison
        if data.price is not None:
            updates["price"] = data.price
        if data.surface is not None:
            updates["surface"] = data.surface
        if data.zone is not None:
            updates["zone"] = data.zone

        if not updates:
            return 0

        count = await self.lot_repo.bulk_update_metadata(
            project_id=project_id,
            lot_ids=data.lot_ids,
            updates=updates,
        )

        logger.info(
            "Bulk lot metadata updated",
            project_id=project_id,
            lot_ids=data.lot_ids,
            fields=list(updates.keys()),
            count=count,
        )

        return count

    async def delete_lot(self, lot_id: int) -> None:
        """Delete a lot.

        Args:
            lot_id: Lot ID

        Raises:
            NotFoundError: If lot not found
            BusinessRuleError: If lot cannot be deleted
        """
        lot = await self.lot_repo.get_by_id(lot_id)
        if not lot:
            raise NotFoundError("Lot", lot_id)

        # Check if lot can be deleted
        if lot.status in ("reserved", "sold"):
            raise BusinessRuleError(
                message=f"Cannot delete lot with status '{lot.status}'",
                rule="lot_status_prevents_deletion",
            )

        # Get project for count update
        project = await self.project_repo.get_by_id(lot.project_id)

        await self.lot_repo.delete(lot_id)

        # Update project lot count
        if project:
            await self.project_repo.update_lot_counts(
                lot.project_id,
                total_lots=max(0, project.total_lots - 1),
            )

        logger.info("Lot deleted", lot_id=lot_id)
