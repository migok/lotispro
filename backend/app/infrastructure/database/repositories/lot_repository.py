"""Lot repository implementation."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, func, select, update

from app.domain.schemas.lot import ACTIVE_LOT_STATUSES, LotFilter
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
                query = query.where(LotModel.zone.ilike(f"%{filters.zone}%"))
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
                query = query.where(LotModel.type_lot.ilike(f"%{filters.type_lot}%"))
            if filters.emplacement:
                query = query.where(LotModel.emplacement.ilike(f"%{filters.emplacement}%"))
            if filters.type_maison:
                query = query.where(LotModel.type_maison.ilike(f"%{filters.type_maison}%"))

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
            "creation": 0,
            "available": 0,
            "option": 0,
            "reservation_a_finaliser": 0,
            "reservation_engagee": 0,
            "reservation_soldee": 0,
            "chez_notaire": 0,
            "chez_proprietaire": 0,
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
            NotaireModel,
            ReservationModel,
            UserModel,
        )

        now = datetime.now(timezone.utc)

        # Join via current_reservation_id — lot status is the source of truth
        query = (
            select(
                LotModel,
                ReservationModel,
                ClientModel,
                UserModel,
                NotaireModel,
            )
            .outerjoin(
                ReservationModel,
                ReservationModel.id == LotModel.current_reservation_id,
            )
            .outerjoin(ClientModel, ClientModel.id == ReservationModel.client_id)
            .outerjoin(UserModel, UserModel.id == ReservationModel.reserved_by_user_id)
            .outerjoin(NotaireModel, NotaireModel.id == ReservationModel.notaire_id)
            .where(LotModel.project_id == project_id)
            .order_by(LotModel.numero)
        )

        result = await self.session.execute(query)
        lots_data = []
        seen_lot_ids: set[int] = set()

        for lot, reservation, client, reserved_by_user, notaire in result.all():
            if lot.id in seen_lot_ids:
                continue
            seen_lot_ids.add(lot.id)
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
                "price_per_sqm": lot.price_per_sqm,
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
                        "reserved_by_name": reserved_by_user.name if reserved_by_user else None,
                        # New workflow fields
                        "guarantee_amount": reservation.guarantee_amount,
                        "payment_type": reservation.payment_type,
                        "notaire_id": reservation.notaire_id,
                        "notary_name": (
                            f"{notaire.prenom} {notaire.nom}" if notaire else reservation.notary_name
                        ),
                        "notary_date": reservation.notary_date,
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

    async def bulk_update_metadata(
        self,
        project_id: int,
        lot_ids: list[int],
        updates: dict,
    ) -> int:
        """Bulk update metadata fields on a set of lots within a project.

        Args:
            project_id: Project ID (scope guard — only updates lots in this project)
            lot_ids: List of lot IDs to update
            updates: Dict of fields/values to set (None values already excluded by caller)

        Returns:
            Number of rows updated
        """
        if not updates:
            return 0

        result = await self.session.execute(
            update(LotModel)
            .where(
                and_(
                    LotModel.project_id == project_id,
                    LotModel.id.in_(lot_ids),
                )
            )
            .values(**updates)
        )
        await self.session.flush()
        return result.rowcount

    async def get_expired_options(self) -> list[dict]:
        """Get lots in 'option' status whose expiration date has passed.

        Returns alert data only — does NOT change any status.
        """
        from app.infrastructure.database.models import ClientModel, ReservationModel

        now = datetime.now(timezone.utc)

        query = (
            select(LotModel, ReservationModel, ClientModel)
            .join(ReservationModel, ReservationModel.id == LotModel.current_reservation_id)
            .join(ClientModel, ClientModel.id == ReservationModel.client_id)
            .where(
                and_(
                    LotModel.status == "option",
                    ReservationModel.expiration_date < now,
                )
            )
            .order_by(ReservationModel.expiration_date)
        )

        result = await self.session.execute(query)
        alerts = []
        for lot, reservation, client in result.all():
            exp_date = reservation.expiration_date
            if exp_date.tzinfo is None:
                exp_date = exp_date.replace(tzinfo=timezone.utc)
            alerts.append(
                {
                    "lot_id": lot.id,
                    "lot_numero": lot.numero,
                    "lot_price": lot.price,
                    "reservation_id": reservation.id,
                    "expiration_date": reservation.expiration_date,
                    "days_overdue": (now - exp_date).days,
                    "client_name": client.name,
                    "client_phone": client.phone,
                    "deposit": reservation.deposit,
                }
            )
        return alerts

    async def get_expired_finalisations(self) -> list[dict]:
        """Get lots in 'reservation_a_finaliser' status whose finalization date has passed.

        Returns alert data only — does NOT change any status.
        """
        from app.infrastructure.database.models import ClientModel, ReservationModel

        now = datetime.now(timezone.utc)

        query = (
            select(LotModel, ReservationModel, ClientModel)
            .join(ReservationModel, ReservationModel.id == LotModel.current_reservation_id)
            .join(ClientModel, ClientModel.id == ReservationModel.client_id)
            .where(
                and_(
                    LotModel.status == "reservation_a_finaliser",
                    ReservationModel.expiration_date < now,
                )
            )
            .order_by(ReservationModel.expiration_date)
        )

        result = await self.session.execute(query)
        alerts = []
        for lot, reservation, client in result.all():
            exp_date = reservation.expiration_date
            if exp_date.tzinfo is None:
                exp_date = exp_date.replace(tzinfo=timezone.utc)
            alerts.append(
                {
                    "lot_id": lot.id,
                    "lot_numero": lot.numero,
                    "lot_price": lot.price,
                    "reservation_id": reservation.id,
                    "expiration_date": reservation.expiration_date,
                    "days_overdue": (now - exp_date).days,
                    "client_name": client.name,
                    "client_phone": client.phone,
                    "guarantee_amount": reservation.guarantee_amount,
                    "payment_type": reservation.payment_type,
                }
            )
        return alerts

    async def get_at_risk_lots(self, days_threshold: int = 3) -> list[dict]:
        """Get lots in 'option' or 'reservation_a_finaliser' expiring within threshold days.

        Returns alert data only — does NOT change any status.
        """
        from app.infrastructure.database.models import ClientModel, ReservationModel, UserModel

        now = datetime.now(timezone.utc)
        threshold_date = now + timedelta(days=days_threshold)

        query = (
            select(LotModel, ReservationModel, ClientModel, UserModel)
            .join(ReservationModel, ReservationModel.id == LotModel.current_reservation_id)
            .join(ClientModel, ClientModel.id == ReservationModel.client_id)
            .outerjoin(UserModel, UserModel.id == ReservationModel.reserved_by_user_id)
            .where(
                and_(
                    LotModel.status.in_(("option", "reservation_a_finaliser")),
                    ReservationModel.expiration_date <= threshold_date,
                )
            )
            .order_by(ReservationModel.expiration_date)
        )

        result = await self.session.execute(query)
        at_risk = []

        for lot, reservation, client, reserver in result.all():
            exp_date = reservation.expiration_date
            if exp_date is None:
                days_remaining = 9999
            else:
                if exp_date.tzinfo is None:
                    exp_date = exp_date.replace(tzinfo=timezone.utc)
                days_remaining = (exp_date - now).days

            at_risk.append(
                {
                    "lot_id": lot.id,
                    "lot_numero": lot.numero,
                    "lot_price": lot.price,
                    "lot_status": lot.status,
                    "reservation_id": reservation.id,
                    "expiration_date": reservation.expiration_date,
                    "deposit": reservation.deposit,
                    "guarantee_amount": reservation.guarantee_amount,
                    "client_name": client.name,
                    "client_phone": client.phone,
                    "reserved_by_name": reserver.name if reserver else None,
                    "risk_type": "expired" if days_remaining < 0 else "expiring_soon",
                    "days_remaining": days_remaining,
                }
            )

        return at_risk

    async def get_all_options_tracking(
        self,
        project_id: int | None = None,
        user_id: int | None = None,
    ) -> list[dict]:
        """Get ALL lots in option or reservation_a_finaliser status.

        Returns every active option/RAF regardless of expiration date,
        sorted by urgency: expired first (most overdue), then ascending expiration.
        """
        from app.infrastructure.database.models import ClientModel, ProjectModel, ReservationModel, UserModel

        now = datetime.now(timezone.utc)

        query = (
            select(LotModel, ReservationModel, ClientModel, UserModel, ProjectModel)
            .join(ReservationModel, ReservationModel.id == LotModel.current_reservation_id)
            .join(ClientModel, ClientModel.id == ReservationModel.client_id)
            .outerjoin(UserModel, UserModel.id == ReservationModel.reserved_by_user_id)
            .join(ProjectModel, ProjectModel.id == LotModel.project_id)
            .where(LotModel.status.in_(("option", "reservation_a_finaliser")))
        )

        if project_id:
            query = query.where(LotModel.project_id == project_id)
        if user_id:
            query = query.where(ReservationModel.reserved_by_user_id == user_id)

        query = query.order_by(ReservationModel.expiration_date)

        result = await self.session.execute(query)
        rows = []
        for lot, reservation, client, reserver, project in result.all():
            exp_date = reservation.expiration_date
            if exp_date is None:
                # No expiration date set — treat as far future (not expired)
                days_remaining = 9999.0
            else:
                if exp_date.tzinfo is None:
                    exp_date = exp_date.replace(tzinfo=timezone.utc)
                days_remaining = (exp_date - now).total_seconds() / 86400

            rows.append(
                {
                    "lot_id": lot.id,
                    "lot_numero": lot.numero,
                    "lot_price": lot.price,
                    "lot_status": lot.status,
                    "project_id": lot.project_id,
                    "project_name": project.name,
                    "reservation_id": reservation.id,
                    "reservation_date": reservation.reservation_date,
                    "expiration_date": reservation.expiration_date,
                    "guarantee_amount": reservation.guarantee_amount,
                    "deposit": reservation.deposit,
                    "client_id": client.id,
                    "client_name": client.name,
                    "client_phone": client.phone,
                    "reserved_by_user_id": reserver.id if reserver else None,
                    "reserved_by_name": reserver.name if reserver else None,
                    "days_remaining": round(days_remaining, 1),
                    "is_expired": days_remaining < 0,
                }
            )

        # Sort: expired lots first (most overdue), then by proximity of expiration
        rows.sort(key=lambda r: r["days_remaining"])
        return rows

    async def release_lot(self, lot_id: int, status: str) -> None:
        """Update lot status and explicitly clear current_reservation_id to NULL.

        Used when a reservation is released, expired, or converted to sale.
        The base update() method filters None values, so this method handles
        the explicit NULL assignment directly.
        """
        await self.session.execute(
            update(LotModel)
            .where(LotModel.id == lot_id)
            .values(status=status, current_reservation_id=None)
        )
        await self.session.flush()
