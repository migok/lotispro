"""Reservation repository implementation."""

from datetime import datetime, timezone

from sqlalchemy import and_, select

from app.domain.schemas.reservation import ReservationFilter
from app.infrastructure.database.models import (
    ClientModel,
    LotModel,
    ProjectModel,
    ReservationModel,
    UserModel,
)
from app.infrastructure.database.repositories.base import BaseRepository


class ReservationRepository(BaseRepository[ReservationModel]):
    """Repository for reservation data access operations."""

    model = ReservationModel

    async def get_filtered(
        self,
        filters: ReservationFilter | None = None,
        offset: int = 0,
        limit: int = 100,
    ) -> list[ReservationModel]:
        """Get reservations with filtering.

        Args:
            filters: Optional filter parameters
            offset: Pagination offset
            limit: Pagination limit

        Returns:
            List of reservations
        """
        query = select(ReservationModel)

        if filters:
            if filters.project_id:
                query = query.where(ReservationModel.project_id == filters.project_id)
            if filters.lot_id:
                query = query.where(ReservationModel.lot_id == filters.lot_id)
            if filters.client_id:
                query = query.where(ReservationModel.client_id == filters.client_id)
            if filters.status:
                query = query.where(ReservationModel.status == filters.status)
            if filters.reserved_by_user_id:
                query = query.where(
                    ReservationModel.reserved_by_user_id == filters.reserved_by_user_id
                )

        query = (
            query.order_by(ReservationModel.reservation_date.desc())
            .offset(offset)
            .limit(limit)
        )

        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def get_expired_active(self) -> list[ReservationModel]:
        """Get reservations with status 'active' that have expired (legacy query).

        Note: In the new workflow, use LotRepository.get_expired_options() /
        get_expired_finalisations() instead. These return alert data without mutations.
        """
        now = datetime.now(timezone.utc)

        result = await self.session.execute(
            select(ReservationModel).where(
                and_(
                    ReservationModel.status.in_(("active", "validated")),
                    ReservationModel.expiration_date < now,
                )
            )
        )
        return list(result.scalars().all())

    async def get_with_details(self, reservation_id: int) -> dict | None:
        """Get reservation with extended details.

        Args:
            reservation_id: Reservation ID

        Returns:
            Reservation details dict or None
        """
        query = (
            select(ReservationModel, LotModel, ClientModel, UserModel, ProjectModel)
            .join(LotModel, LotModel.id == ReservationModel.lot_id)
            .join(ClientModel, ClientModel.id == ReservationModel.client_id)
            .outerjoin(UserModel, UserModel.id == ReservationModel.reserved_by_user_id)
            .join(ProjectModel, ProjectModel.id == ReservationModel.project_id)
            .where(ReservationModel.id == reservation_id)
        )

        result = await self.session.execute(query)
        row = result.one_or_none()

        if not row:
            return None

        reservation, lot, client, reserver, project = row

        return {
            "id": reservation.id,
            "project_id": reservation.project_id,
            "lot_id": reservation.lot_id,
            "client_id": reservation.client_id,
            "reserved_by_user_id": reservation.reserved_by_user_id,
            "reservation_date": reservation.reservation_date,
            "expiration_date": reservation.expiration_date,
            "deposit": reservation.deposit,
            "deposit_date": reservation.deposit_date,
            "notes": reservation.notes,
            "status": reservation.status,
            # New workflow fields
            "payment_type": reservation.payment_type,
            "guarantee_amount": reservation.guarantee_amount,
            "notaire_id": reservation.notaire_id,
            "notary_name": reservation.notary_name,
            "notary_date": reservation.notary_date,
            # Réservation engagée — prix de vente et promotion
            "sale_price": reservation.sale_price,
            "promotion_amount": reservation.promotion_amount,
            "promotion_paid_timing": reservation.promotion_paid_timing,
            "promotion_received": reservation.promotion_received,
            "created_at": reservation.created_at,
            "updated_at": reservation.updated_at,
            "lot_numero": lot.numero,
            "lot_price": lot.price,
            "lot_surface": lot.surface,
            "lot_status": lot.status,
            "client_name": client.name,
            "client_phone": client.phone,
            "client_email": client.email,
            "client_cin": client.cin,
            "client_address": client.address,
            "reserved_by_name": reserver.name if reserver else None,
            "project_name": project.name,
        }

    async def get_active_for_lot(self, lot_id: int) -> ReservationModel | None:
        """Get the current active reservation for a lot (via current_reservation_id).

        Args:
            lot_id: Lot ID

        Returns:
            Active reservation or None
        """
        result = await self.session.execute(
            select(ReservationModel).where(
                and_(
                    ReservationModel.lot_id == lot_id,
                    ReservationModel.status.in_(("active", "validated")),
                )
            )
        )
        return result.scalar_one_or_none()
