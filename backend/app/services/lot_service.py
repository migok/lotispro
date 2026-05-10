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
from app.domain.schemas.lot import (
    DIRECT_UPDATE_STATUSES,
    NON_DELETABLE_STATUSES,
    LotBulkMetadataUpdate,
    LotCreate,
    LotFilter,
    LotResponse,
    LotUpdate,
)
from app.infrastructure.database.repositories import LotPricingConfigRepository, LotRepository, ProjectRepository

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
        self.pricing_repo = LotPricingConfigRepository(session)

    async def _get_pricing_overrides(
        self,
        lot_id: int,
        project_id: int,
        zone: str | None,
        type_lot: str | None,
        type_maison: str | None,
        emplacement: str | None,
        surface: float | None,
        current_status: str,
    ) -> dict[str, Any]:
        """Return pricing config field overrides for a lot.

        Looks up the matching pricing config for the lot's categorical combination.
        For creation/available lots, overrides price_per_sqm, price_per_sqm_acte,
        and price from the config. Auto-activates creation lots that have a surface.
        Returns empty dict if no matching config exists.
        """
        config = await self.pricing_repo.get_for_combination(
            project_id, zone, type_lot, type_maison, emplacement
        )
        if not config:
            return {}

        overrides: dict[str, Any] = {
            "price_per_sqm": config.prix_m2_catalogue,
            "price_per_sqm_acte": config.prix_m2_acte,
        }
        if surface and surface > 0:
            overrides["price"] = round(config.prix_m2_catalogue * surface, 2)

        if current_status == "creation" and overrides.get("price") and surface:
            overrides["status"] = "available"
            logger.info(
                "Lot auto-activated via pricing config",
                lot_id=lot_id,
                project_id=project_id,
            )

        return overrides

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
                price_per_sqm=lot.price_per_sqm,
                price_per_sqm_acte=lot.price_per_sqm_acte,
                status=lot.status,
                current_reservation_id=lot.current_reservation_id,
                geometry=_parse_geometry(lot.geometry),
                type_lot=lot.type_lot,
                emplacement=lot.emplacement,
                type_maison=lot.type_maison,
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
            price_per_sqm=lot.price_per_sqm,
            price_per_sqm_acte=lot.price_per_sqm_acte,
            status=lot.status,
            current_reservation_id=lot.current_reservation_id,
            geometry=_parse_geometry(lot.geometry),
            type_lot=lot.type_lot,
            emplacement=lot.emplacement,
            type_maison=lot.type_maison,
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

        # Auto-compute price from price_per_sqm × surface when applicable
        price_per_sqm = data.price_per_sqm
        price = data.price
        if price_per_sqm and data.surface and data.surface > 0:
            price = round(price_per_sqm * data.surface, 2)

        # Create lot
        lot = await self.lot_repo.create(
            project_id=data.project_id,
            numero=data.numero,
            zone=data.zone,
            surface=data.surface,
            price=price,
            price_per_sqm=price_per_sqm,
            status=data.status,
            geometry=geometry_str,
            type_lot=data.type_lot,
            emplacement=data.emplacement,
            type_maison=data.type_maison,
        )

        # Apply pricing config from the project grid if a matching combination exists
        if data.status in ("creation", "available"):
            pricing_overrides = await self._get_pricing_overrides(
                lot.id,
                data.project_id,
                data.zone,
                data.type_lot,
                data.type_maison,
                data.emplacement,
                data.surface,
                data.status,
            )
            if pricing_overrides:
                lot = await self.lot_repo.update(lot.id, **pricing_overrides)

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
            price_per_sqm=lot.price_per_sqm,
            price_per_sqm_acte=lot.price_per_sqm_acte,
            status=lot.status,
            current_reservation_id=lot.current_reservation_id,
            geometry=_parse_geometry(lot.geometry),
            type_lot=lot.type_lot,
            emplacement=lot.emplacement,
            type_maison=lot.type_maison,
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

        # Direct status updates are limited to creation/available/blocked
        # Workflow transitions must use dedicated transition endpoints
        if data.status is not None and data.status not in DIRECT_UPDATE_STATUSES:
            raise BusinessRuleError(
                message=(
                    f"Status '{data.status}' cannot be set directly. "
                    "Use dedicated transition endpoints for workflow status changes."
                ),
                rule="use_transition_endpoint",
            )

        # Auto-compute price from price_per_sqm when provided
        price_per_sqm = data.price_per_sqm
        price = data.price
        if price_per_sqm is not None and price_per_sqm > 0:
            # Prefer the new surface if provided, otherwise fall back to stored surface
            surface_for_calc = data.surface if data.surface is not None else lot.surface
            if surface_for_calc and surface_for_calc > 0:
                price = round(price_per_sqm * surface_for_calc, 2)
        elif price_per_sqm is None and data.surface is not None and lot.price_per_sqm:
            # Surface changed without changing price_per_sqm — recompute price
            if data.surface > 0:
                price = round(lot.price_per_sqm * data.surface, 2)

        # Apply pricing config from the project grid (overrides user-provided prices)
        price_per_sqm_acte = data.price_per_sqm_acte
        status_override = data.status

        final_status = data.status if data.status is not None else lot.status
        if final_status in ("creation", "available"):
            final_zone = data.zone if data.zone is not None else lot.zone
            final_type_lot = data.type_lot if data.type_lot is not None else lot.type_lot
            final_type_maison = data.type_maison if data.type_maison is not None else lot.type_maison
            final_emplacement = data.emplacement if data.emplacement is not None else lot.emplacement
            final_surface = data.surface if data.surface is not None else lot.surface

            pricing_overrides = await self._get_pricing_overrides(
                lot_id,
                lot.project_id,
                final_zone,
                final_type_lot,
                final_type_maison,
                final_emplacement,
                final_surface,
                final_status,
            )
            if pricing_overrides:
                price_per_sqm = pricing_overrides.get("price_per_sqm", price_per_sqm)
                price = pricing_overrides.get("price", price)
                price_per_sqm_acte = pricing_overrides.get("price_per_sqm_acte", price_per_sqm_acte)
                status_override = pricing_overrides.get("status", status_override)

        updated = await self.lot_repo.update(
            lot_id,
            numero=data.numero,
            zone=data.zone,
            surface=data.surface,
            price=price,
            price_per_sqm=price_per_sqm,
            price_per_sqm_acte=price_per_sqm_acte,
            status=status_override,
            type_lot=data.type_lot,
            emplacement=data.emplacement,
            type_maison=data.type_maison,
        )

        logger.info("Lot updated", lot_id=lot_id)

        return LotResponse(
            id=updated.id,
            project_id=updated.project_id,
            numero=updated.numero,
            zone=updated.zone,
            surface=updated.surface,
            price=updated.price,
            price_per_sqm=updated.price_per_sqm,
            price_per_sqm_acte=updated.price_per_sqm_acte,
            status=updated.status,
            current_reservation_id=updated.current_reservation_id,
            geometry=_parse_geometry(updated.geometry),
            type_lot=updated.type_lot,
            emplacement=updated.emplacement,
            type_maison=updated.type_maison,
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
        if data.price_per_sqm is not None:
            updates["price_per_sqm"] = data.price_per_sqm
            # Recompute price if surface is also provided in the bulk update
            if data.surface is not None and data.surface > 0:
                updates["price"] = round(data.price_per_sqm * data.surface, 2)
        if data.price is not None and "price" not in updates:
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

        # Apply pricing config to each updated lot (combination may have changed)
        for lot_id in data.lot_ids:
            lot = await self.lot_repo.get_by_id(lot_id)
            if not lot or lot.status not in ("creation", "available"):
                continue
            pricing_overrides = await self._get_pricing_overrides(
                lot.id,
                lot.project_id,
                lot.zone,
                lot.type_lot,
                lot.type_maison,
                lot.emplacement,
                lot.surface,
                lot.status,
            )
            if pricing_overrides:
                await self.lot_repo.update(lot.id, **pricing_overrides)

        logger.info(
            "Bulk lot metadata updated",
            project_id=project_id,
            lot_ids=data.lot_ids,
            fields=list(updates.keys()),
            count=count,
        )

        return count

    async def activate_lot(self, lot_id: int) -> LotResponse:
        """Transition lot from creation to available.

        Validates that required fields (price, surface) are set before activating.

        Args:
            lot_id: Lot ID

        Returns:
            Updated lot response

        Raises:
            NotFoundError: If lot not found
            BusinessRuleError: If lot not in creation status or missing required fields
        """
        lot = await self.lot_repo.get_by_id(lot_id)
        if not lot:
            raise NotFoundError("Lot", lot_id)

        if lot.status != "creation":
            raise BusinessRuleError(
                message=f"Le lot est en statut '{lot.status}', pas 'creation'.",
                rule="lot_must_be_in_creation",
            )

        missing = []
        if not lot.price:
            missing.append("Prix")
        if not lot.surface:
            missing.append("Surface")

        if missing:
            raise BusinessRuleError(
                message=(
                    f"Champs obligatoires manquants : {', '.join(missing)}. "
                    "Complétez la fiche avant d'activer le lot."
                ),
                rule="lot_missing_required_fields",
            )

        updated = await self.lot_repo.update(lot_id, status="available")

        logger.info("Lot activated", lot_id=lot_id)

        return LotResponse(
            id=updated.id,
            project_id=updated.project_id,
            numero=updated.numero,
            zone=updated.zone,
            surface=updated.surface,
            price=updated.price,
            price_per_sqm=updated.price_per_sqm,
            price_per_sqm_acte=updated.price_per_sqm_acte,
            status=updated.status,
            current_reservation_id=updated.current_reservation_id,
            geometry=_parse_geometry(updated.geometry),
            type_lot=updated.type_lot,
            emplacement=updated.emplacement,
            type_maison=updated.type_maison,
            created_at=updated.created_at,
            updated_at=updated.updated_at,
        )

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
        if lot.status in NON_DELETABLE_STATUSES:
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
