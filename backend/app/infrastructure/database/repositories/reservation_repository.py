"""Reservation repository implementation."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, select

from app.domain.schemas.reservation import ReservationFilter
from app.infrastructure.database.models import (
    ClientModel,
    LotModel,
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
        """Get all active reservations that have expired.

        Returns:
            List of expired reservations
        """
        now = datetime.now(timezone.utc)

        result = await self.session.execute(
            select(ReservationModel).where(
                and_(
                    ReservationModel.status == "active",
                    ReservationModel.expiration_date < now,
                )
            )
        )
        return list(result.scalars().all())

    async def get_at_risk(self, days_threshold: int = 3) -> list[dict]:
        """Get reservations at risk (expiring soon or already expired).

        Args:
            days_threshold: Days before expiration to consider "at risk"

        Returns:
            List of at-risk reservation dicts
        """
        now = datetime.now(timezone.utc)
        threshold_date = now + timedelta(days=days_threshold)

        query = (
            select(ReservationModel, LotModel, ClientModel, UserModel)
            .join(LotModel, LotModel.id == ReservationModel.lot_id)
            .join(ClientModel, ClientModel.id == ReservationModel.client_id)
            .outerjoin(UserModel, UserModel.id == ReservationModel.reserved_by_user_id)
            .where(
                and_(
                    ReservationModel.status == "active",
                    ReservationModel.expiration_date <= threshold_date,
                )
            )
            .order_by(ReservationModel.expiration_date)
        )

        result = await self.session.execute(query)
        at_risk = []

        for reservation, lot, client, reserver in result.all():
            exp_date = reservation.expiration_date
            if exp_date.tzinfo is None:
                exp_date = exp_date.replace(tzinfo=timezone.utc)
            days_remaining = (exp_date - now).days

            at_risk.append(
                {
                    "id": reservation.id,
                    "lot_id": reservation.lot_id,
                    "client_id": reservation.client_id,
                    "reserved_by_user_id": reservation.reserved_by_user_id,
                    "reservation_date": reservation.reservation_date,
                    "expiration_date": reservation.expiration_date,
                    "deposit": reservation.deposit,
                    "status": reservation.status,
                    "lot_numero": lot.numero,
                    "lot_price": lot.price,
                    "lot_surface": lot.surface,
                    "client_name": client.name,
                    "client_phone": client.phone,
                    "client_email": client.email,
                    "reserved_by_name": reserver.name if reserver else None,
                    "risk_type": "expired" if days_remaining < 0 else "expiring_soon",
                    "days_remaining": days_remaining,
                }
            )

        return at_risk

    async def get_with_details(self, reservation_id: int) -> dict | None:
        """Get reservation with extended details.

        Args:
            reservation_id: Reservation ID

        Returns:
            Reservation details dict or None
        """
        query = (
            select(ReservationModel, LotModel, ClientModel, UserModel)
            .join(LotModel, LotModel.id == ReservationModel.lot_id)
            .join(ClientModel, ClientModel.id == ReservationModel.client_id)
            .outerjoin(UserModel, UserModel.id == ReservationModel.reserved_by_user_id)
            .where(ReservationModel.id == reservation_id)
        )

        result = await self.session.execute(query)
        row = result.one_or_none()

        if not row:
            return None

        reservation, lot, client, reserver = row

        return {
            "id": reservation.id,
            "project_id": reservation.project_id,
            "lot_id": reservation.lot_id,
            "client_id": reservation.client_id,
            "reserved_by_user_id": reservation.reserved_by_user_id,
            "reservation_date": reservation.reservation_date,
            "expiration_date": reservation.expiration_date,
            "deposit": reservation.deposit,
            "notes": reservation.notes,
            "status": reservation.status,
            "created_at": reservation.created_at,
            "updated_at": reservation.updated_at,
            "lot_numero": lot.numero,
            "lot_price": lot.price,
            "lot_surface": lot.surface,
            "client_name": client.name,
            "client_phone": client.phone,
            "client_email": client.email,
            "reserved_by_name": reserver.name if reserver else None,
        }

    async def get_active_for_lot(self, lot_id: int) -> ReservationModel | None:
        """Get active reservation for a lot.

        Args:
            lot_id: Lot ID

        Returns:
            Active reservation or None
        """
        result = await self.session.execute(
            select(ReservationModel).where(
                and_(
                    ReservationModel.lot_id == lot_id,
                    ReservationModel.status == "active",
                )
            )
        )
        return result.scalar_one_or_none()
