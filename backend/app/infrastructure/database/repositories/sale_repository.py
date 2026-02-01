"""Sale repository implementation."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.infrastructure.database.models import (
    ClientModel,
    LotModel,
    ProjectModel,
    ReservationModel,
    SaleModel,
    UserModel,
)
from app.infrastructure.database.repositories.base import BaseRepository


class SaleRepository(BaseRepository[SaleModel]):
    """Repository for sale data access operations."""

    model = SaleModel

    async def get_filtered(
        self,
        project_id: int | None = None,
        lot_id: int | None = None,
        client_id: int | None = None,
        sold_by_user_id: int | None = None,
        offset: int = 0,
        limit: int = 100,
    ) -> list[SaleModel]:
        """Get sales with filtering.

        Args:
            project_id: Filter by project
            lot_id: Filter by lot
            client_id: Filter by client
            sold_by_user_id: Filter by seller
            offset: Pagination offset
            limit: Pagination limit

        Returns:
            List of sales
        """
        query = select(SaleModel)

        if project_id:
            query = query.where(SaleModel.project_id == project_id)
        if lot_id:
            query = query.where(SaleModel.lot_id == lot_id)
        if client_id:
            query = query.where(SaleModel.client_id == client_id)
        if sold_by_user_id:
            query = query.where(SaleModel.sold_by_user_id == sold_by_user_id)

        query = query.order_by(SaleModel.sale_date.desc()).offset(offset).limit(limit)

        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def get_with_details(self, sale_id: int) -> dict | None:
        """Get sale with extended details.

        Args:
            sale_id: Sale ID

        Returns:
            Sale details dict or None
        """
        query = (
            select(SaleModel, LotModel, ClientModel, ProjectModel, UserModel)
            .join(LotModel, LotModel.id == SaleModel.lot_id)
            .join(ClientModel, ClientModel.id == SaleModel.client_id)
            .join(ProjectModel, ProjectModel.id == SaleModel.project_id)
            .outerjoin(UserModel, UserModel.id == SaleModel.sold_by_user_id)
            .where(SaleModel.id == sale_id)
        )

        result = await self.session.execute(query)
        row = result.one_or_none()

        if not row:
            return None

        sale, lot, client, project, seller = row

        return {
            "id": sale.id,
            "project_id": sale.project_id,
            "lot_id": sale.lot_id,
            "client_id": sale.client_id,
            "reservation_id": sale.reservation_id,
            "sold_by_user_id": sale.sold_by_user_id,
            "sale_date": sale.sale_date,
            "price": sale.price,
            "notes": sale.notes,
            "created_at": sale.created_at,
            "lot_numero": lot.numero,
            "lot_surface": lot.surface,
            "lot_zone": lot.zone,
            "client_name": client.name,
            "client_phone": client.phone,
            "project_name": project.name,
            "sold_by_name": seller.name if seller else None,
        }

    async def get_by_period(
        self,
        project_id: int | None = None,
        period: str = "month",
        months_back: int = 12,
    ) -> list[dict]:
        """Get sales aggregated by period.

        Args:
            project_id: Optional project filter
            period: Aggregation period ('day', 'week', 'month')
            months_back: How many months back to include

        Returns:
            List of period aggregations
        """
        start_date = datetime.now(timezone.utc) - timedelta(days=months_back * 30)

        query = select(SaleModel).where(SaleModel.sale_date >= start_date)

        if project_id:
            query = query.where(SaleModel.project_id == project_id)

        result = await self.session.execute(query.order_by(SaleModel.sale_date))
        sales = result.scalars().all()

        # Aggregate by period
        aggregated: dict[str, dict] = {}

        for sale in sales:
            if period == "day":
                key = sale.sale_date.strftime("%Y-%m-%d")
            elif period == "week":
                key = sale.sale_date.strftime("%Y-W%W")
            else:  # month
                key = sale.sale_date.strftime("%Y-%m")

            if key not in aggregated:
                aggregated[key] = {"period": key, "count": 0, "total_amount": 0}

            aggregated[key]["count"] += 1
            aggregated[key]["total_amount"] += sale.price

        return list(aggregated.values())

    async def get_total_by_project(self, project_id: int) -> dict:
        """Get total sales stats for a project.

        Args:
            project_id: Project ID

        Returns:
            Dict with total count and amount
        """
        result = await self.session.execute(
            select(func.count(SaleModel.id), func.sum(SaleModel.price)).where(
                SaleModel.project_id == project_id
            )
        )

        count, total = result.one()

        return {"count": count or 0, "total_amount": float(total or 0)}

    async def get_commercial_performance(
        self,
        project_id: int | None = None,
    ) -> list[dict]:
        """Get sales performance by commercial.

        Args:
            project_id: Optional project filter

        Returns:
            List of commercial performance dicts
        """
        from app.infrastructure.database.models import AssignmentModel

        # Get commercials: either assigned to project or all commercials with role
        if project_id:
            # Get commercials assigned to this specific project
            # Note: AssignmentModel has two FKs to users (user_id and assigned_by)
            # so we must explicitly specify the join condition
            users_query = (
                select(UserModel)
                .join(
                    AssignmentModel,
                    AssignmentModel.user_id == UserModel.id,
                )
                .where(
                    AssignmentModel.project_id == project_id,
                    UserModel.role == "commercial",
                )
            )
        else:
            # Get all commercials
            users_query = select(UserModel).where(UserModel.role == "commercial")

        users_result = await self.session.execute(users_query)
        commercials = users_result.scalars().all()

        performance = []
        for user in commercials:
            # Get sales stats for this user
            sales_query = select(
                func.count(SaleModel.id).label("total_sales"),
                func.coalesce(func.sum(SaleModel.price), 0).label("ca_total"),
            ).where(SaleModel.sold_by_user_id == user.id)

            if project_id:
                sales_query = sales_query.where(SaleModel.project_id == project_id)

            sales_result = await self.session.execute(sales_query)
            sales_stats = sales_result.one()

            # Get reservation stats for this user
            res_query = select(
                func.count(ReservationModel.id).label("total"),
                func.count()
                .filter(ReservationModel.status == "converted")
                .label("converted"),
            ).where(ReservationModel.reserved_by_user_id == user.id)

            if project_id:
                res_query = res_query.where(ReservationModel.project_id == project_id)

            res_result = await self.session.execute(res_query)
            res_stats = res_result.one()

            total_reservations = res_stats.total or 0
            converted_reservations = res_stats.converted or 0
            taux = (
                (converted_reservations / total_reservations * 100)
                if total_reservations > 0
                else 0
            )

            total_sales = sales_stats.total_sales or 0
            ca_total = float(sales_stats.ca_total or 0)

            performance.append(
                {
                    "user_id": user.id,
                    "name": user.name,
                    "email": user.email,
                    "total_sales": total_sales,
                    "ca_total": ca_total,
                    "total_reservations": total_reservations,
                    "converted_reservations": converted_reservations,
                    "taux_transformation": round(taux, 2),
                    "ca_moyen": ca_total / total_sales if total_sales > 0 else 0,
                }
            )

        return performance
