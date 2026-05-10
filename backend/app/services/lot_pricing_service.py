"""Service for lot pricing configuration (prix_m2_acte / prix_m2_catalogue)."""

from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthorizationError, NotFoundError
from app.core.logging import get_logger
from app.domain.schemas.lot_pricing import (
    LotPricingCombination,
    LotPricingConfigBulkUpsert,
    LotPricingConfigResponse,
    LotPricingConfigsListResponse,
)
from app.infrastructure.database.models import LotModel, LotPricingConfigModel
from app.infrastructure.database.repositories import LotPricingConfigRepository, LotRepository, ProjectRepository

logger = get_logger(__name__)

_RECALC_STATUSES = ("creation", "available")


def _to_response(
    config: LotPricingConfigModel,
    lots_affected: int = 0,
) -> LotPricingConfigResponse:
    return LotPricingConfigResponse(
        id=config.id,
        project_id=config.project_id,
        zone=config.zone,
        type_lot=config.type_lot,
        type_maison=config.type_maison,
        emplacement=config.emplacement,
        prix_m2_acte=config.prix_m2_acte,
        prix_m2_catalogue=config.prix_m2_catalogue,
        created_by=config.created_by,
        created_at=config.created_at,
        updated_at=config.updated_at,
        lots_affected=lots_affected,
    )


class LotPricingService:
    """Manages per-project pricing grids (catalogue vs acte) per lot combination."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.pricing_repo = LotPricingConfigRepository(session)
        self.project_repo = ProjectRepository(session)
        self.lot_repo = LotRepository(session)

    async def _check_project_access(
        self, project_id: int, requester_id: int, requester_role: str
    ) -> None:
        project = await self.project_repo.get_by_id(project_id)
        if not project:
            raise NotFoundError("Project", project_id)
        if requester_role == "manager":
            return
        # Commercials must be assigned to the project
        from app.infrastructure.database.models import AssignmentModel
        result = await self.session.execute(
            select(AssignmentModel).where(
                and_(
                    AssignmentModel.project_id == project_id,
                    AssignmentModel.user_id == requester_id,
                )
            )
        )
        if not result.scalar_one_or_none():
            raise AuthorizationError("Access denied to this project")

    async def get_project_configs(
        self,
        project_id: int,
        requester_id: int,
        requester_role: str,
    ) -> LotPricingConfigsListResponse:
        await self._check_project_access(project_id, requester_id, requester_role)

        configs = await self.pricing_repo.list_by_project(project_id)
        all_combos = await self.pricing_repo.get_distinct_combinations(project_id)

        configured_keys = {
            (c.zone, c.type_lot, c.type_maison, c.emplacement) for c in configs
        }

        config_responses = []
        for cfg in configs:
            count = await self.pricing_repo.count_lots_for_combination(
                project_id, cfg.zone, cfg.type_lot, cfg.type_maison, cfg.emplacement
            )
            config_responses.append(_to_response(cfg, count))

        unconfigured = [
            LotPricingCombination(
                zone=combo["zone"],
                type_lot=combo["type_lot"],
                type_maison=combo["type_maison"],
                emplacement=combo["emplacement"],
                lot_count=combo["lot_count"],
            )
            for combo in all_combos
            if (combo["zone"], combo["type_lot"], combo["type_maison"], combo["emplacement"])
            not in configured_keys
        ]

        return LotPricingConfigsListResponse(
            configs=config_responses,
            unconfigured_combinations=unconfigured,
        )

    async def bulk_upsert_configs(
        self,
        project_id: int,
        data: LotPricingConfigBulkUpsert,
        requester_id: int,
        requester_role: str,
    ) -> LotPricingConfigsListResponse:
        if requester_role != "manager":
            raise AuthorizationError("Only managers can update pricing configurations")

        await self._check_project_access(project_id, requester_id, requester_role)

        for item in data.configs:
            await self.pricing_repo.upsert(
                project_id=project_id,
                zone=item.zone,
                type_lot=item.type_lot,
                type_maison=item.type_maison,
                emplacement=item.emplacement,
                prix_m2_acte=item.prix_m2_acte,
                prix_m2_catalogue=item.prix_m2_catalogue,
                user_id=requester_id,
            )
            # Recalculate price on lots in creation/available for this combination
            await self._recalc_lots(
                project_id=project_id,
                zone=item.zone,
                type_lot=item.type_lot,
                type_maison=item.type_maison,
                emplacement=item.emplacement,
                prix_m2_acte=item.prix_m2_acte,
                prix_m2_catalogue=item.prix_m2_catalogue,
            )

        await self.session.flush()

        logger.info(
            "Bulk upsert pricing configs",
            project_id=project_id,
            count=len(data.configs),
        )

        return await self.get_project_configs(project_id, requester_id, requester_role)

    async def _recalc_lots(
        self,
        project_id: int,
        zone: str | None,
        type_lot: str | None,
        type_maison: str | None,
        emplacement: str | None,
        prix_m2_acte: float,
        prix_m2_catalogue: float,
    ) -> None:
        """Update prices on lots in creation/available status, then auto-activate creation lots."""
        lots_result = await self.session.execute(
            select(LotModel).where(
                and_(
                    LotModel.project_id == project_id,
                    LotModel.zone == zone,
                    LotModel.type_lot == type_lot,
                    LotModel.type_maison == type_maison,
                    LotModel.emplacement == emplacement,
                    LotModel.status.in_(_RECALC_STATUSES),
                )
            )
        )
        lots = lots_result.scalars().all()
        for lot in lots:
            new_price = round(prix_m2_catalogue * lot.surface, 2) if lot.surface else None
            new_values: dict = {
                "price": new_price,
                "price_per_sqm": prix_m2_catalogue,
                "price_per_sqm_acte": prix_m2_acte,
            }
            # Auto-activate: lot en création avec surface → disponible
            if lot.status == "creation" and lot.surface and new_price:
                new_values["status"] = "available"
                logger.info(
                    "Lot auto-activated via pricing config",
                    lot_id=lot.id,
                    project_id=project_id,
                )
            await self.session.execute(
                update(LotModel)
                .where(LotModel.id == lot.id)
                .values(**new_values)
            )

    async def apply_configs_to_existing_lots(
        self,
        project_id: int,
        requester_id: int,
        requester_role: str,
    ) -> dict[str, int]:
        """Apply all saved pricing configs to existing creation/available lots.

        Useful when configs were saved before the lots were created or their
        combination metadata was set. Returns counts of lots updated and activated.
        """
        await self._check_project_access(project_id, requester_id, requester_role)

        configs = await self.pricing_repo.list_by_project(project_id)
        total_updated = 0
        total_activated = 0

        for cfg in configs:
            lots_result = await self.session.execute(
                select(LotModel).where(
                    and_(
                        LotModel.project_id == project_id,
                        LotModel.zone == cfg.zone,
                        LotModel.type_lot == cfg.type_lot,
                        LotModel.type_maison == cfg.type_maison,
                        LotModel.emplacement == cfg.emplacement,
                        LotModel.status.in_(_RECALC_STATUSES),
                    )
                )
            )
            lots = lots_result.scalars().all()
            for lot in lots:
                new_price = round(cfg.prix_m2_catalogue * lot.surface, 2) if lot.surface else None
                new_values: dict = {
                    "price": new_price,
                    "price_per_sqm": cfg.prix_m2_catalogue,
                    "price_per_sqm_acte": cfg.prix_m2_acte,
                }
                if lot.status == "creation" and lot.surface and new_price:
                    new_values["status"] = "available"
                    total_activated += 1
                    logger.info(
                        "Lot auto-activated via apply-configs",
                        lot_id=lot.id,
                        project_id=project_id,
                    )
                await self.session.execute(
                    update(LotModel).where(LotModel.id == lot.id).values(**new_values)
                )
                total_updated += 1

        await self.session.flush()

        logger.info(
            "Applied pricing configs to existing lots",
            project_id=project_id,
            lots_updated=total_updated,
            lots_activated=total_activated,
        )
        return {"lots_updated": total_updated, "lots_activated": total_activated}

    async def get_acte_price_for_lot(self, lot: LotModel) -> float | None:
        """Return prix_m2_acte × surface for the lot's combination, or None if no config."""
        config = await self.pricing_repo.get_for_combination(
            lot.project_id, lot.zone, lot.type_lot, lot.type_maison, lot.emplacement
        )
        if config and lot.surface:
            return round(config.prix_m2_acte * lot.surface, 2)
        return None

    async def get_config_for_lot(self, lot_id: int) -> dict | None:
        """Return pricing rates and computed prices for a specific lot, or None if no config."""
        lot = await self.lot_repo.get_by_id(lot_id)
        if not lot:
            return None
        config = await self.pricing_repo.get_for_combination(
            lot.project_id, lot.zone, lot.type_lot, lot.type_maison, lot.emplacement
        )
        if not config:
            return None
        return {
            "prix_m2_acte": config.prix_m2_acte,
            "prix_m2_catalogue": config.prix_m2_catalogue,
            "sale_price_computed": round(config.prix_m2_acte * lot.surface, 2) if lot.surface else None,
            "catalogue_price_computed": round(config.prix_m2_catalogue * lot.surface, 2) if lot.surface else None,
        }
