"""Client repository implementation."""

from sqlalchemy import func, or_, select

from app.infrastructure.database.models import (
    ClientModel,
    ReservationModel,
    SaleModel,
    UserModel,
)
from app.infrastructure.database.repositories.base import BaseRepository


class ClientRepository(BaseRepository[ClientModel]):
    """Repository for client data access operations."""

    model = ClientModel

    async def get_filtered(
        self,
        search: str | None = None,
        client_type: str | None = None,
        offset: int = 0,
        limit: int = 100,
    ) -> list[ClientModel]:
        """Get clients with filtering.

        Args:
            search: Search term for name, phone, or CIN
            client_type: Filter by client type
            offset: Pagination offset
            limit: Pagination limit

        Returns:
            List of clients
        """
        query = select(ClientModel)

        if search:
            search_term = f"%{search}%"
            query = query.where(
                or_(
                    ClientModel.name.ilike(search_term),
                    ClientModel.phone.ilike(search_term),
                    ClientModel.cin.ilike(search_term),
                )
            )

        if client_type:
            query = query.where(ClientModel.client_type == client_type)

        query = query.order_by(ClientModel.name).offset(offset).limit(limit)

        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def get_details(self, client_id: int) -> dict | None:
        """Get detailed client info with history and stats.

        Args:
            client_id: Client ID

        Returns:
            Client details dict or None
        """
        # Get client
        client = await self.get_by_id(client_id)
        if not client:
            return None

        # Get creator info
        creator = None
        if client.created_by_user_id:
            result = await self.session.execute(
                select(UserModel).where(UserModel.id == client.created_by_user_id)
            )
            creator_model = result.scalar_one_or_none()
            if creator_model:
                creator = {
                    "id": creator_model.id,
                    "name": creator_model.name,
                    "email": creator_model.email,
                }

        # Get sales history
        from app.infrastructure.database.models import LotModel, ProjectModel

        sales_query = (
            select(SaleModel, LotModel, ProjectModel, UserModel)
            .join(LotModel, LotModel.id == SaleModel.lot_id)
            .join(ProjectModel, ProjectModel.id == SaleModel.project_id)
            .outerjoin(UserModel, UserModel.id == SaleModel.sold_by_user_id)
            .where(SaleModel.client_id == client_id)
            .order_by(SaleModel.sale_date.desc())
        )

        sales_result = await self.session.execute(sales_query)
        sales_history = []

        for sale, lot, project, seller in sales_result.all():
            sales_history.append(
                {
                    "id": sale.id,
                    "sale_date": sale.sale_date,
                    "price": sale.price,
                    "notes": sale.notes,
                    "lot_numero": lot.numero,
                    "lot_surface": lot.surface,
                    "lot_zone": lot.zone,
                    "project_id": project.id,
                    "project_name": project.name,
                    "sold_by_user_id": sale.sold_by_user_id,
                    "sold_by_name": seller.name if seller else None,
                }
            )

        # Get reservations history
        reservations_query = (
            select(ReservationModel, LotModel, ProjectModel, UserModel)
            .join(LotModel, LotModel.id == ReservationModel.lot_id)
            .join(ProjectModel, ProjectModel.id == ReservationModel.project_id)
            .outerjoin(UserModel, UserModel.id == ReservationModel.reserved_by_user_id)
            .where(ReservationModel.client_id == client_id)
            .order_by(ReservationModel.reservation_date.desc())
        )

        reservations_result = await self.session.execute(reservations_query)
        reservations_history = []

        for reservation, lot, project, reserver in reservations_result.all():
            reservations_history.append(
                {
                    "id": reservation.id,
                    "reservation_date": reservation.reservation_date,
                    "expiration_date": reservation.expiration_date,
                    "deposit": reservation.deposit,
                    "deposit_date": reservation.deposit_date,
                    "deposit_refund_amount": reservation.deposit_refund_amount,
                    "deposit_refund_date": reservation.deposit_refund_date,
                    "release_reason": reservation.release_reason,
                    "status": reservation.status,
                    "notes": reservation.notes,
                    "lot_numero": lot.numero,
                    "lot_surface": lot.surface,
                    "lot_zone": lot.zone,
                    "lot_price": lot.price,
                    "project_id": project.id,
                    "project_name": project.name,
                    "reserved_by_user_id": reservation.reserved_by_user_id,
                    "reserved_by_name": reserver.name if reserver else None,
                }
            )

        # Calculate stats
        stats_result = await self.session.execute(
            select(
                func.sum(SaleModel.price).label("total_purchases"),
                func.count(SaleModel.id).label("total_lots"),
            ).where(SaleModel.client_id == client_id)
        )
        sale_stats = stats_result.one()

        deposit_result = await self.session.execute(
            select(func.sum(ReservationModel.deposit)).where(
                ReservationModel.client_id == client_id
            )
        )
        total_deposit = deposit_result.scalar() or 0

        reservation_counts = await self.session.execute(
            select(
                func.count().filter(ReservationModel.status == "active").label("active"),
                func.count().label("total"),
                func.count().filter(ReservationModel.status == "converted").label(
                    "converted"
                ),
            ).where(ReservationModel.client_id == client_id)
        )
        res_counts = reservation_counts.one()

        stats = {
            "total_purchases": float(sale_stats.total_purchases or 0),
            "total_lots": sale_stats.total_lots or 0,
            "total_deposit": float(total_deposit),
            "active_reservations": res_counts.active or 0,
            "total_reservations": res_counts.total or 0,
            "converted_reservations": res_counts.converted or 0,
        }

        return {
            "id": client.id,
            "name": client.name,
            "phone": client.phone,
            "email": client.email,
            "cin": client.cin,
            "address": client.address,
            "client_type": client.client_type,
            "notes": client.notes,
            "created_by_user_id": client.created_by_user_id,
            "created_at": client.created_at,
            "updated_at": client.updated_at,
            "created_by": creator,
            "sales_history": sales_history,
            "reservations_history": reservations_history,
            "stats": stats,
        }
