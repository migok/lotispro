"""Repository for lot pricing configurations."""

from datetime import datetime, timezone

from sqlalchemy import and_, distinct, func, select

from app.infrastructure.database.models import LotModel, LotPricingConfigModel
from app.infrastructure.database.repositories.base import BaseRepository


class LotPricingConfigRepository(BaseRepository[LotPricingConfigModel]):
    """Data access for lot_pricing_configs table."""

    model = LotPricingConfigModel

    async def list_by_project(self, project_id: int) -> list[LotPricingConfigModel]:
        result = await self.session.execute(
            select(LotPricingConfigModel).where(
                LotPricingConfigModel.project_id == project_id
            )
        )
        return list(result.scalars().all())

    async def get_for_combination(
        self,
        project_id: int,
        zone: str | None,
        type_lot: str | None,
        type_maison: str | None,
        emplacement: str | None,
    ) -> LotPricingConfigModel | None:
        result = await self.session.execute(
            select(LotPricingConfigModel).where(
                and_(
                    LotPricingConfigModel.project_id == project_id,
                    LotPricingConfigModel.zone == zone,
                    LotPricingConfigModel.type_lot == type_lot,
                    LotPricingConfigModel.type_maison == type_maison,
                    LotPricingConfigModel.emplacement == emplacement,
                )
            )
        )
        return result.scalar_one_or_none()

    async def upsert(
        self,
        project_id: int,
        zone: str | None,
        type_lot: str | None,
        type_maison: str | None,
        emplacement: str | None,
        prix_m2_acte: float,
        prix_m2_catalogue: float,
        user_id: int,
    ) -> LotPricingConfigModel:
        existing = await self.get_for_combination(
            project_id, zone, type_lot, type_maison, emplacement
        )
        if existing:
            existing.prix_m2_acte = prix_m2_acte
            existing.prix_m2_catalogue = prix_m2_catalogue
            existing.updated_at = datetime.now(timezone.utc)
            self.session.add(existing)
            await self.session.flush()
            await self.session.refresh(existing)
            return existing
        return await self.create(
            project_id=project_id,
            zone=zone,
            type_lot=type_lot,
            type_maison=type_maison,
            emplacement=emplacement,
            prix_m2_acte=prix_m2_acte,
            prix_m2_catalogue=prix_m2_catalogue,
            created_by=user_id,
        )

    async def get_distinct_combinations(
        self, project_id: int
    ) -> list[dict]:
        """Return all distinct categorical combinations present in lots of the project."""
        result = await self.session.execute(
            select(
                LotModel.zone,
                LotModel.type_lot,
                LotModel.type_maison,
                LotModel.emplacement,
                func.count(LotModel.id).label("lot_count"),
            )
            .where(LotModel.project_id == project_id)
            .group_by(
                LotModel.zone,
                LotModel.type_lot,
                LotModel.type_maison,
                LotModel.emplacement,
            )
        )
        return [
            {
                "zone": row.zone,
                "type_lot": row.type_lot,
                "type_maison": row.type_maison,
                "emplacement": row.emplacement,
                "lot_count": row.lot_count,
            }
            for row in result.all()
        ]

    async def count_lots_for_combination(
        self,
        project_id: int,
        zone: str | None,
        type_lot: str | None,
        type_maison: str | None,
        emplacement: str | None,
        statuses: tuple[str, ...] = ("creation", "available"),
    ) -> int:
        result = await self.session.execute(
            select(func.count(LotModel.id)).where(
                and_(
                    LotModel.project_id == project_id,
                    LotModel.zone == zone,
                    LotModel.type_lot == type_lot,
                    LotModel.type_maison == type_maison,
                    LotModel.emplacement == emplacement,
                    LotModel.status.in_(statuses),
                )
            )
        )
        return result.scalar() or 0
