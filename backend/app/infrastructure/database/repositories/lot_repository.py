"""Lot repository implementation."""

from datetime import datetime, timezone

from sqlalchemy import and_, func, select

from app.domain.schemas.lot import LotFilter
from app.infrastructure.database.models import LotModel
from app.infrastructure.database.repositories.base import BaseRepository


class LotRepository(BaseRepository[LotModel]):
    """Repository for lot data access operations."""

    model = LotModel

    async def get_by_numero(self, project_id: int, numero: str) -> LotModel | None:
        """Get lot by project and numero.

        Args:
            project_id: Project ID
            numero: Lot numero

        Returns:
            Lot model or None
        """
        result = await self.session.execute(
            select(LotModel).where(
                and_(
                    LotModel.project_id == project_id,
                    LotModel.numero == numero,
                )
            )
        )
        return result.scalar_one_or_none()

    async def get_filtered(
        self,
        filters: LotFilter | None = None,
        offset: int = 0,
        limit: int = 100,
    ) -> list[LotModel]:
        """Get lots with filtering.

        Args:
            filters: Optional filter parameters
            offset: Pagination offset
            limit: Pagination limit

        Returns:
            List of lots
        """
        query = select(LotModel)

        if filters:
            if filters.project_id:
                query = query.where(LotModel.project_id == filters.project_id)
            if filters.numero:
                query = query.where(LotModel.numero.ilike(f"%{filters.numero}%"))
            if filters.zone:
                query = query.where(LotModel.zone == filters.zone)
            if filters.status:
                query = query.where(LotModel.status == filters.status)
            if filters.surface_min is not None:
                query = query.where(LotModel.surface >= filters.surface_min)
            if filters.surface_max is not None:
                query = query.where(LotModel.surface <= filters.surface_max)
            if filters.price_min is not None:
                query = query.where(LotModel.price >= filters.price_min)
            if filters.price_max is not None:
                query = query.where(LotModel.price <= filters.price_max)
            # Metadata filters
            if filters.type_lot:
                query = query.where(LotModel.type_lot == filters.type_lot)
            if filters.emplacement:
                query = query.where(LotModel.emplacement == filters.emplacement)
            if filters.type_maison:
                query = query.where(LotModel.type_maison == filters.type_maison)

        query = query.order_by(LotModel.numero).offset(offset).limit(limit)

        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def count_by_project(self, project_id: int) -> int:
        """Count lots in a project.

        Args:
            project_id: Project ID

        Returns:
            Lot count
        """
        result = await self.session.execute(
            select(func.count()).where(LotModel.project_id == project_id)
        )
        return result.scalar() or 0

    async def count_by_status(self, project_id: int) -> dict[str, int]:
        """Count lots by status for a project.

        Args:
            project_id: Project ID

        Returns:
            Dict with status counts
        """
        result = await self.session.execute(
            select(LotModel.status, func.count())
            .where(LotModel.project_id == project_id)
            .group_by(LotModel.status)
        )

        counts = {
            "available": 0,
            "reserved": 0,
            "sold": 0,
            "blocked": 0,
        }

        for status, count in result.all():
            counts[status] = count

        return counts

    async def numero_exists(
        self,
        project_id: int,
        numero: str,
        exclude_id: int | None = None,
    ) -> bool:
        """Check if lot numero already exists in project.

        Args:
            project_id: Project ID
            numero: Lot numero
            exclude_id: Optional lot ID to exclude

        Returns:
            True if exists
        """
        query = select(LotModel.id).where(
            and_(
                LotModel.project_id == project_id,
                LotModel.numero == numero,
            )
        )

        if exclude_id:
            query = query.where(LotModel.id != exclude_id)

        result = await self.session.execute(query)
        return result.scalar_one_or_none() is not None

    async def get_project_lots_with_details(self, project_id: int) -> list[dict]:
        """Get lots with reservation and client details.

        Args:
            project_id: Project ID

        Returns:
            List of lot dicts with extended info
        """
        from app.infrastructure.database.models import (
            ClientModel,
            ReservationModel,
        )

        now = datetime.now(timezone.utc)

        query = (
            select(
                LotModel,
                ReservationModel,
                ClientModel,
            )
            .outerjoin(
                ReservationModel,
                and_(
                    ReservationModel.lot_id == LotModel.id,
                    ReservationModel.status == "active",
                ),
            )
            .outerjoin(ClientModel, ClientModel.id == ReservationModel.client_id)
            .where(LotModel.project_id == project_id)
            .order_by(LotModel.numero)
        )

        result = await self.session.execute(query)
        lots_data = []

        for lot, reservation, client in result.all():
            # Calculate days_in_status based on the lot's updated_at timestamp
            if lot.updated_at:
                lot_updated = lot.updated_at
                # Handle timezone-naive datetimes
                if lot_updated.tzinfo is None:
                    lot_updated = lot_updated.replace(tzinfo=timezone.utc)
                days_in_status = (now - lot_updated).days
            else:
                days_in_status = 0

            lot_dict = {
                "id": lot.id,
                "project_id": lot.project_id,
                "numero": lot.numero,
                "zone": lot.zone,
                "surface": lot.surface,
                "price": lot.price,
                "status": lot.status,
                "current_reservation_id": lot.current_reservation_id,
                "geometry": lot.geometry,
                "type_lot": lot.type_lot,
                "emplacement": lot.emplacement,
                "type_maison": lot.type_maison,
                "created_at": lot.created_at,
                "updated_at": lot.updated_at,
                "days_in_status": days_in_status,
            }

            if reservation:
                lot_dict.update(
                    {
                        "reservation_id": reservation.id,
                        "reservation_date": reservation.reservation_date,
                        "expiration_date": reservation.expiration_date,
                        "deposit": reservation.deposit,
                        "reservation_status": reservation.status,
                        "reserved_by_user_id": reservation.reserved_by_user_id,
                    }
                )

            if client:
                lot_dict.update(
                    {
                        "client_id": client.id,
                        "client_name": client.name,
                        "client_phone": client.phone,
                    }
                )

            lots_data.append(lot_dict)

        return lots_data
