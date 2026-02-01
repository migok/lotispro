"""Dashboard service - Analytics and reporting operations."""

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.domain.schemas.dashboard import (
    AlertsSummary,
    AverageDurations,
    CommercialPerformance,
    DashboardCounts,
    DashboardPercentages,
    DashboardStats,
    DashboardSurfaces,
    PerformanceData,
    ReservationsVsSales,
    SalesByPeriod,
)
from app.infrastructure.database.models import (
    LotModel,
    ReservationModel,
    SaleModel,
)
from app.infrastructure.database.repositories import (
    LotRepository,
    ReservationRepository,
    SaleRepository,
)

logger = get_logger(__name__)


class DashboardService:
    """Service for dashboard analytics and reporting."""

    def __init__(self, session: AsyncSession):
        """Initialize with database session."""
        self.session = session
        self.lot_repo = LotRepository(session)
        self.reservation_repo = ReservationRepository(session)
        self.sale_repo = SaleRepository(session)

    async def get_dashboard_stats(
        self,
        project_id: int | None = None,
        user_id: int | None = None,
    ) -> DashboardStats:
        """Get main dashboard statistics.

        Args:
            project_id: Optional project filter
            user_id: Optional user filter (for commercial view)

        Returns:
            Dashboard statistics

        For commercial users (user_id provided):
        - Total/Available/Blocked = global or project-level counts
        - Reserved = their active reservations count
        - Sold = their sales count
        - Surfaces reserved/sold = their lots' surfaces
        - CA = their sales
        """
        # First, get global/project lot counts (always needed)
        global_query = select(
            func.count()
            .filter(LotModel.status == "available")
            .label("available"),
            func.count()
            .filter(LotModel.status == "reserved")
            .label("reserved"),
            func.count().filter(LotModel.status == "sold").label("sold"),
            func.count()
            .filter(LotModel.status == "blocked")
            .label("blocked"),
            func.count().label("total"),
            # Surface aggregations
            func.coalesce(
                func.sum(LotModel.surface).filter(LotModel.status == "available"), 0
            ).label("surface_available"),
            func.coalesce(
                func.sum(LotModel.surface).filter(LotModel.status == "reserved"), 0
            ).label("surface_reserved"),
            func.coalesce(
                func.sum(LotModel.surface).filter(LotModel.status == "sold"), 0
            ).label("surface_sold"),
            func.coalesce(
                func.sum(LotModel.surface).filter(LotModel.status == "blocked"), 0
            ).label("surface_blocked"),
            func.coalesce(func.sum(LotModel.surface), 0).label("surface_total"),
        )

        if project_id:
            global_query = global_query.where(LotModel.project_id == project_id)

        global_result = await self.session.execute(global_query)
        global_row = global_result.one()

        if user_id:
            # For commercial users: show global available/blocked but personal reserved/sold
            # Count their active reservations
            user_reserved_query = select(func.count()).where(
                ReservationModel.reserved_by_user_id == user_id,
                ReservationModel.status == "active",
            )
            if project_id:
                user_reserved_query = user_reserved_query.where(
                    ReservationModel.project_id == project_id
                )
            user_reserved_result = await self.session.execute(user_reserved_query)
            user_reserved_count = user_reserved_result.scalar() or 0

            # Count their sales
            user_sold_query = select(func.count()).where(
                SaleModel.sold_by_user_id == user_id
            )
            if project_id:
                user_sold_query = user_sold_query.where(
                    SaleModel.project_id == project_id
                )
            user_sold_result = await self.session.execute(user_sold_query)
            user_sold_count = user_sold_result.scalar() or 0

            # Get surfaces of their reserved lots
            user_reserved_surface_query = select(
                func.coalesce(func.sum(LotModel.surface), 0)
            ).where(
                LotModel.id.in_(
                    select(ReservationModel.lot_id).where(
                        ReservationModel.reserved_by_user_id == user_id,
                        ReservationModel.status == "active",
                    )
                )
            )
            if project_id:
                user_reserved_surface_query = user_reserved_surface_query.where(
                    LotModel.project_id == project_id
                )
            user_reserved_surface_result = await self.session.execute(
                user_reserved_surface_query
            )
            user_reserved_surface = float(user_reserved_surface_result.scalar() or 0)

            # Get surfaces of their sold lots
            user_sold_surface_query = select(
                func.coalesce(func.sum(LotModel.surface), 0)
            ).where(
                LotModel.id.in_(
                    select(SaleModel.lot_id).where(SaleModel.sold_by_user_id == user_id)
                )
            )
            if project_id:
                user_sold_surface_query = user_sold_surface_query.where(
                    LotModel.project_id == project_id
                )
            user_sold_surface_result = await self.session.execute(user_sold_surface_query)
            user_sold_surface = float(user_sold_surface_result.scalar() or 0)

            counts = DashboardCounts(
                total=global_row.total,
                available=global_row.available,
                reserved=user_reserved_count,
                sold=user_sold_count,
                blocked=global_row.blocked,
            )

            surfaces = DashboardSurfaces(
                total=round(float(global_row.surface_total or 0), 2),
                available=round(float(global_row.surface_available or 0), 2),
                reserved=round(user_reserved_surface, 2),
                sold=round(user_sold_surface, 2),
                blocked=round(float(global_row.surface_blocked or 0), 2),
            )
        else:
            counts = DashboardCounts(
                total=global_row.total,
                available=global_row.available,
                reserved=global_row.reserved,
                sold=global_row.sold,
                blocked=global_row.blocked,
            )

            surfaces = DashboardSurfaces(
                total=round(float(global_row.surface_total or 0), 2),
                available=round(float(global_row.surface_available or 0), 2),
                reserved=round(float(global_row.surface_reserved or 0), 2),
                sold=round(float(global_row.surface_sold or 0), 2),
                blocked=round(float(global_row.surface_blocked or 0), 2),
            )

        # Calculate percentages based on global totals
        total = global_row.total or 1  # Avoid division by zero
        if user_id:
            # For commercials, percentages are based on their personal counts vs global total
            percentages = DashboardPercentages(
                available=round(global_row.available / total * 100, 2),
                reserved=round(counts.reserved / total * 100, 2),
                sold=round(counts.sold / total * 100, 2),
                blocked=round(global_row.blocked / total * 100, 2),
            )
        else:
            percentages = DashboardPercentages(
                available=round(counts.available / total * 100, 2),
                reserved=round(counts.reserved / total * 100, 2),
                sold=round(counts.sold / total * 100, 2),
                blocked=round(counts.blocked / total * 100, 2),
            )

        # CA realized (from sales)
        ca_query = select(func.sum(SaleModel.price))
        if project_id:
            ca_query = ca_query.where(SaleModel.project_id == project_id)
        if user_id:
            ca_query = ca_query.where(SaleModel.sold_by_user_id == user_id)
        ca_result = await self.session.execute(ca_query)
        ca_realise = float(ca_result.scalar() or 0)

        # CA potential (from available/reserved lots)
        if user_id:
            # For user, potential = their reserved lots only
            potential_query = select(func.sum(LotModel.price)).where(
                LotModel.status == "reserved",
                LotModel.id.in_(
                    select(ReservationModel.lot_id).where(
                        ReservationModel.reserved_by_user_id == user_id,
                        ReservationModel.status == "active",
                    )
                ),
            )
        else:
            potential_query = select(func.sum(LotModel.price)).where(
                LotModel.status.in_(["available", "reserved"])
            )
        if project_id:
            potential_query = potential_query.where(LotModel.project_id == project_id)
        potential_result = await self.session.execute(potential_query)
        ca_potentiel = float(potential_result.scalar() or 0)

        # Sales rate - based on global sold count for consistency
        taux_vente = round(global_row.sold / total * 100, 2) if total > 0 else 0

        # Conversion rate (reservations to sales)
        conversion_query = select(
            func.count().label("total"),
            func.count().filter(ReservationModel.status == "converted").label(
                "converted"
            ),
        )
        if project_id:
            conversion_query = conversion_query.where(
                ReservationModel.project_id == project_id
            )
        if user_id:
            conversion_query = conversion_query.where(
                ReservationModel.reserved_by_user_id == user_id
            )
        conversion_result = await self.session.execute(conversion_query)
        conversion_row = conversion_result.one()

        total_res = conversion_row.total or 1
        taux_transformation = round(conversion_row.converted / total_res * 100, 2)

        return DashboardStats(
            counts=counts,
            percentages=percentages,
            surfaces=surfaces,
            ca_realise=ca_realise,
            ca_potentiel=ca_potentiel,
            taux_vente=taux_vente,
            taux_transformation=taux_transformation,
        )

    async def get_alerts(
        self,
        days_threshold: int = 3,
        project_id: int | None = None,
        user_id: int | None = None,
    ) -> tuple[list[dict], AlertsSummary]:
        """Get reservations at risk.

        Args:
            days_threshold: Days before expiration to flag
            project_id: Optional project filter
            user_id: Optional user filter (for commercial view)

        Returns:
            Tuple of (at-risk reservations, summary)
        """
        at_risk = await self.reservation_repo.get_at_risk(days_threshold)

        # Filter by project if specified
        if project_id:
            # Get lot-to-project mapping
            lot_project_result = await self.session.execute(
                select(LotModel.id).where(LotModel.project_id == project_id)
            )
            project_lots = {row[0] for row in lot_project_result.all()}
            at_risk = [r for r in at_risk if r["lot_id"] in project_lots]

        # Filter by user if specified
        if user_id:
            at_risk = [
                r for r in at_risk if r.get("reserved_by_user_id") == user_id
            ]

        # Calculate summary
        expired_count = sum(1 for r in at_risk if r["risk_type"] == "expired")
        expiring_soon_count = sum(
            1 for r in at_risk if r["risk_type"] == "expiring_soon"
        )
        value_at_risk = sum(r.get("lot_price", 0) or 0 for r in at_risk)
        deposit_at_risk = sum(r.get("deposit", 0) or 0 for r in at_risk)

        summary = AlertsSummary(
            expired_count=expired_count,
            expiring_soon_count=expiring_soon_count,
            total_at_risk=len(at_risk),
            value_at_risk=value_at_risk,
            deposit_at_risk=deposit_at_risk,
        )

        return at_risk, summary

    async def get_performance_data(
        self,
        project_id: int | None = None,
        user_id: int | None = None,
        period: str = "month",
    ) -> PerformanceData:
        """Get performance analytics data.

        Args:
            project_id: Optional project filter
            user_id: Optional user filter (for commercial view)
            period: Aggregation period

        Returns:
            Performance data
        """
        # Sales by period - need to filter by user if specified
        sales_by_period_data = await self._get_sales_by_period(
            project_id=project_id,
            user_id=user_id,
            period=period,
        )

        sales_by_period = [
            SalesByPeriod(
                period=s["period"],
                count=s["count"],
                total_amount=s["total_amount"],
            )
            for s in sales_by_period_data
        ]

        # For reservations vs sales comparison, we need to aggregate both
        # This is a simplified version - in production you'd query this from DB
        reservations_vs_sales: list[ReservationsVsSales] = []

        # Calculate average durations from reservations that were converted
        average_durations = await self._calculate_average_durations(
            project_id=project_id,
            user_id=user_id,
        )

        return PerformanceData(
            sales_by_period=sales_by_period,
            reservations_vs_sales=reservations_vs_sales,
            average_durations=average_durations,
        )

    async def _get_sales_by_period(
        self,
        project_id: int | None = None,
        user_id: int | None = None,
        period: str = "month",
        months_back: int = 12,
    ) -> list[dict]:
        """Get sales aggregated by period with user filter support."""
        from datetime import timedelta

        start_date = datetime.now(timezone.utc) - timedelta(days=months_back * 30)

        query = select(SaleModel).where(SaleModel.sale_date >= start_date)

        if project_id:
            query = query.where(SaleModel.project_id == project_id)
        if user_id:
            query = query.where(SaleModel.sold_by_user_id == user_id)

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

    async def _calculate_average_durations(
        self,
        project_id: int | None = None,
        user_id: int | None = None,
    ) -> AverageDurations:
        """Calculate average durations from lot creation to reservation and sale."""
        # Get converted reservations with their sales
        query = (
            select(
                ReservationModel.reservation_date,
                SaleModel.sale_date,
                LotModel.created_at,
            )
            .join(SaleModel, SaleModel.reservation_id == ReservationModel.id)
            .join(LotModel, LotModel.id == ReservationModel.lot_id)
            .where(ReservationModel.status == "converted")
        )

        if project_id:
            query = query.where(ReservationModel.project_id == project_id)
        if user_id:
            query = query.where(ReservationModel.reserved_by_user_id == user_id)

        result = await self.session.execute(query)
        rows = result.all()

        if not rows:
            return AverageDurations(
                available_to_reserved=None,
                reserved_to_sold=None,
            )

        # Calculate averages
        available_to_reserved_days = []
        reserved_to_sold_days = []

        for reservation_date, sale_date, lot_created_at in rows:
            if lot_created_at and reservation_date:
                days_to_reserve = (reservation_date - lot_created_at.date()).days
                if days_to_reserve >= 0:
                    available_to_reserved_days.append(days_to_reserve)

            if reservation_date and sale_date:
                days_to_sell = (sale_date - reservation_date).days
                if days_to_sell >= 0:
                    reserved_to_sold_days.append(days_to_sell)

        avg_to_reserved = (
            round(sum(available_to_reserved_days) / len(available_to_reserved_days), 1)
            if available_to_reserved_days
            else None
        )
        avg_to_sold = (
            round(sum(reserved_to_sold_days) / len(reserved_to_sold_days), 1)
            if reserved_to_sold_days
            else None
        )

        return AverageDurations(
            available_to_reserved=avg_to_reserved,
            reserved_to_sold=avg_to_sold,
        )

    async def get_commercials_performance(
        self,
        project_id: int | None = None,
    ) -> list[CommercialPerformance]:
        """Get commercial performance metrics.

        Args:
            project_id: Optional project filter

        Returns:
            List of commercial performance data
        """
        performance_data = await self.sale_repo.get_commercial_performance(project_id)

        return [
            CommercialPerformance(
                user_id=p["user_id"],
                name=p["name"],
                email=p["email"],
                total_sales=p["total_sales"],
                ca_total=p["ca_total"],
                total_reservations=p["total_reservations"],
                converted_reservations=p["converted_reservations"],
                taux_transformation=p["taux_transformation"],
                ca_moyen=p["ca_moyen"],
            )
            for p in performance_data
        ]

    async def get_commercial_stats(
        self,
        project_id: int | None = None,
    ) -> list[dict]:
        """Get commercial statistics including deposits.

        Args:
            project_id: Optional project filter

        Returns:
            List of commercial stats with deposits
        """
        from app.infrastructure.database.models import UserModel, AssignmentModel

        # Get commercials
        if project_id:
            users_query = (
                select(UserModel)
                .join(AssignmentModel, AssignmentModel.user_id == UserModel.id)
                .where(
                    AssignmentModel.project_id == project_id,
                    UserModel.role == "commercial",
                )
            )
        else:
            users_query = select(UserModel).where(UserModel.role == "commercial")

        users_result = await self.session.execute(users_query)
        commercials = users_result.scalars().all()

        stats = []
        for user in commercials:
            # Get sales stats
            sales_query = select(
                func.count(SaleModel.id).label("total_sales"),
                func.coalesce(func.sum(SaleModel.price), 0).label("total_revenue"),
            ).where(SaleModel.sold_by_user_id == user.id)

            if project_id:
                sales_query = sales_query.where(SaleModel.project_id == project_id)

            sales_result = await self.session.execute(sales_query)
            sales_row = sales_result.one()

            # Get active reservations count
            active_res_query = select(func.count(ReservationModel.id)).where(
                ReservationModel.reserved_by_user_id == user.id,
                ReservationModel.status == "active",
            )
            if project_id:
                active_res_query = active_res_query.where(
                    ReservationModel.project_id == project_id
                )

            active_res_result = await self.session.execute(active_res_query)
            active_reservations = active_res_result.scalar() or 0

            # Get total deposits from active reservations
            deposits_query = select(
                func.coalesce(func.sum(ReservationModel.deposit), 0)
            ).where(
                ReservationModel.reserved_by_user_id == user.id,
                ReservationModel.status == "active",
            )
            if project_id:
                deposits_query = deposits_query.where(
                    ReservationModel.project_id == project_id
                )

            deposits_result = await self.session.execute(deposits_query)
            total_deposits = float(deposits_result.scalar() or 0)

            stats.append({
                "commercial_id": user.id,
                "name": user.name,
                "email": user.email,
                "total_sales": sales_row.total_sales or 0,
                "total_revenue": float(sales_row.total_revenue or 0),
                "active_reservations": active_reservations,
                "total_deposits": total_deposits,
            })

        return stats

    async def get_clients_pipeline(
        self,
        project_id: int | None = None,
        user_id: int | None = None,
    ) -> list[dict]:
        """Get clients pipeline data.

        Args:
            project_id: Optional project filter
            user_id: Optional user filter (for commercial view)

        Returns:
            List of client pipeline entries
        """
        from app.infrastructure.database.models import ClientModel

        from app.infrastructure.database.repositories import ClientRepository

        client_repo = ClientRepository(self.session)

        # If user_id is specified, only get clients created by this user
        # or with reservations/sales by this user
        if user_id:
            # Get client IDs associated with this user
            client_ids_query = select(ClientModel.id).where(
                ClientModel.created_by_user_id == user_id
            )
            client_ids_result = await self.session.execute(client_ids_query)
            client_ids = {row[0] for row in client_ids_result.all()}

            # Also include clients with reservations by this user
            res_client_ids_query = select(ReservationModel.client_id).where(
                ReservationModel.reserved_by_user_id == user_id
            )
            res_client_ids_result = await self.session.execute(res_client_ids_query)
            client_ids.update(row[0] for row in res_client_ids_result.all())

            # Also include clients with sales by this user
            sale_client_ids_query = select(SaleModel.client_id).where(
                SaleModel.sold_by_user_id == user_id
            )
            sale_client_ids_result = await self.session.execute(sale_client_ids_query)
            client_ids.update(row[0] for row in sale_client_ids_result.all())

            if not client_ids:
                return []

            clients_result = await self.session.execute(
                select(ClientModel).where(ClientModel.id.in_(client_ids))
            )
            clients = clients_result.scalars().all()
        else:
            clients = await client_repo.get_all()

        pipeline_data = []

        for client in clients:
            # Count active reservations
            res_query = select(func.count()).where(
                ReservationModel.client_id == client.id,
                ReservationModel.status == "active",
            )
            if project_id:
                res_query = res_query.where(ReservationModel.project_id == project_id)
            if user_id:
                res_query = res_query.where(
                    ReservationModel.reserved_by_user_id == user_id
                )
            res_result = await self.session.execute(res_query)
            active_reservations = res_result.scalar() or 0

            # Count sales and total purchases
            sales_query = select(func.count(), func.sum(SaleModel.price)).where(
                SaleModel.client_id == client.id
            )
            if project_id:
                sales_query = sales_query.where(SaleModel.project_id == project_id)
            if user_id:
                sales_query = sales_query.where(SaleModel.sold_by_user_id == user_id)
            sales_result = await self.session.execute(sales_query)
            sales_row = sales_result.one()
            total_sales = sales_row[0] or 0
            total_purchases = float(sales_row[1] or 0)

            # Calculate total deposit
            deposit_query = select(func.sum(ReservationModel.deposit)).where(
                ReservationModel.client_id == client.id,
                ReservationModel.status == "active",
            )
            if project_id:
                deposit_query = deposit_query.where(
                    ReservationModel.project_id == project_id
                )
            if user_id:
                deposit_query = deposit_query.where(
                    ReservationModel.reserved_by_user_id == user_id
                )
            deposit_result = await self.session.execute(deposit_query)
            total_deposit = float(deposit_result.scalar() or 0)

            # Determine pipeline status
            if total_sales > 0:
                pipeline_status = "buyer"
            elif active_reservations > 0:
                pipeline_status = "active_reservation"
            else:
                pipeline_status = "prospect"

            # Get last activity
            last_activity = client.updated_at

            pipeline_data.append(
                {
                    "id": client.id,
                    "name": client.name,
                    "phone": client.phone,
                    "email": client.email,
                    "cin": client.cin,
                    "client_type": client.client_type,
                    "notes": client.notes,
                    "created_by_user_id": client.created_by_user_id,
                    "created_at": client.created_at,
                    "updated_at": client.updated_at,
                    "active_reservations": active_reservations,
                    "total_sales": total_sales,
                    "total_deposit": total_deposit,
                    "total_purchases": total_purchases,
                    "last_activity": last_activity,
                    "pipeline_status": pipeline_status,
                }
            )

        # Sort by pipeline status priority
        status_order = {"buyer": 0, "active_reservation": 1, "prospect": 2}
        pipeline_data.sort(key=lambda x: status_order.get(x["pipeline_status"], 3))

        return pipeline_data

    async def get_lots_dashboard(
        self,
        project_id: int | None = None,
        user_id: int | None = None,
    ) -> list[dict]:
        """Get lots with details for dashboard.

        Args:
            project_id: Optional project filter
            user_id: Optional user filter (for commercial view)

        Returns:
            List of lots with reservation and client details
        """
        from app.infrastructure.database.models import ClientModel

        now = datetime.now(timezone.utc)

        # Build base query
        query = (
            select(
                LotModel,
                ReservationModel,
                ClientModel,
            )
            .outerjoin(
                ReservationModel,
                (ReservationModel.lot_id == LotModel.id)
                & (ReservationModel.status == "active"),
            )
            .outerjoin(ClientModel, ClientModel.id == ReservationModel.client_id)
        )

        if project_id:
            query = query.where(LotModel.project_id == project_id)

        # Filter by user - show lots with reservations/sales by this user
        if user_id:
            # Get lot IDs associated with this user
            user_lot_ids_query = select(ReservationModel.lot_id).where(
                ReservationModel.reserved_by_user_id == user_id
            )
            user_lot_ids_result = await self.session.execute(user_lot_ids_query)
            user_lot_ids = {row[0] for row in user_lot_ids_result.all()}

            # Also include lots from sales
            user_sales_lot_ids_query = select(SaleModel.lot_id).where(
                SaleModel.sold_by_user_id == user_id
            )
            user_sales_lot_ids_result = await self.session.execute(
                user_sales_lot_ids_query
            )
            user_lot_ids.update(row[0] for row in user_sales_lot_ids_result.all())

            if user_lot_ids:
                query = query.where(LotModel.id.in_(user_lot_ids))
            else:
                return []

        query = query.order_by(LotModel.project_id, LotModel.numero)

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
