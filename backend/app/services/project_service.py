"""Project service - Project management operations."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    AuthorizationError,
    BusinessRuleError,
    NotFoundError,
    StorageError,
)
from app.core.logging import get_logger
from app.domain.schemas.project import (
    ProjectCreate,
    ProjectKPIs,
    ProjectPerformance,
    ProjectResponse,
    ProjectUpdate,
)
from app.domain.schemas.user import UserResponse
from app.infrastructure.database.models import (
    AssignmentModel,
    LotModel,
    ProjectModel,
    ReservationModel,
    SaleModel,
    UserModel,
)
from app.infrastructure.database.repositories import (
    LotRepository,
    ProjectRepository,
    ReservationRepository,
    SaleRepository,
    UserRepository,
)

logger = get_logger(__name__)


class ProjectService:
    """Service for project management operations."""

    def __init__(self, session: AsyncSession):
        """Initialize with database session."""
        self.session = session
        self.project_repo = ProjectRepository(session)
        self.lot_repo = LotRepository(session)
        self.user_repo = UserRepository(session)
        self.reservation_repo = ReservationRepository(session)
        self.sale_repo = SaleRepository(session)

    async def get_projects(
        self,
        user_id: int,
        user_role: str,
    ) -> list[ProjectResponse]:
        """Get projects accessible to user.

        Args:
            user_id: Current user ID
            user_role: Current user role

        Returns:
            List of accessible projects
        """
        projects = await self.project_repo.get_all_for_user(user_id, user_role)

        # Calculate ca_objectif for each project (sum of all lot prices)
        project_ids = [p.id for p in projects]
        ca_objectifs = {}

        if project_ids:
            # Get sum of lot prices grouped by project
            result = await self.session.execute(
                select(
                    LotModel.project_id,
                    func.coalesce(func.sum(LotModel.price), 0).label("total_price")
                ).where(
                    LotModel.project_id.in_(project_ids)
                ).group_by(LotModel.project_id)
            )
            ca_objectifs = {row[0]: float(row[1]) for row in result.all()}

            # Get reserved lots count grouped by project
            reserved_result = await self.session.execute(
                select(
                    LotModel.project_id,
                    func.count(LotModel.id).label("reserved_count")
                ).where(
                    LotModel.project_id.in_(project_ids),
                    LotModel.status == "reserved",
                ).group_by(LotModel.project_id)
            )
            reserved_lots_map = {row[0]: row[1] for row in reserved_result.all()}
        else:
            reserved_lots_map = {}

        return [
            ProjectResponse(
                id=p.id,
                name=p.name,
                description=p.description,
                visibility=p.visibility,
                total_lots=p.total_lots,
                sold_lots=p.sold_lots,
                reserved_lots=reserved_lots_map.get(p.id, 0),
                ca_objectif=ca_objectifs.get(p.id, 0.0),
                created_by=p.created_by,
                created_at=p.created_at,
                updated_at=p.updated_at,
            )
            for p in projects
        ]

    async def get_project(
        self,
        project_id: int,
        user_id: int,
        user_role: str,
    ) -> ProjectResponse:
        """Get project by ID with access check.

        Args:
            project_id: Project ID
            user_id: Current user ID
            user_role: Current user role

        Returns:
            Project response

        Raises:
            NotFoundError: If project not found
            AuthorizationError: If user cannot access project
        """
        project = await self.project_repo.get_by_id(project_id)

        if not project:
            raise NotFoundError("Project", project_id)

        # Check access
        can_access = await self.project_repo.can_user_access(
            project_id, user_id, user_role
        )
        if not can_access:
            raise AuthorizationError(
                message="You don't have access to this project",
            )

        # Calculate ca_objectif as sum of all lot prices
        ca_objectif_result = await self.session.execute(
            select(func.coalesce(func.sum(LotModel.price), 0)).where(
                LotModel.project_id == project_id
            )
        )
        ca_objectif = float(ca_objectif_result.scalar() or 0)

        # Count reserved lots
        reserved_result = await self.session.execute(
            select(func.count(LotModel.id)).where(
                LotModel.project_id == project_id,
                LotModel.status == "reserved",
            )
        )
        reserved_lots = reserved_result.scalar() or 0

        return ProjectResponse(
            id=project.id,
            name=project.name,
            description=project.description,
            visibility=project.visibility,
            total_lots=project.total_lots,
            sold_lots=project.sold_lots,
            reserved_lots=reserved_lots,
            ca_objectif=ca_objectif,
            created_by=project.created_by,
            created_at=project.created_at,
            updated_at=project.updated_at,
        )

    async def create_project(
        self,
        data: ProjectCreate,
        user_id: int,
    ) -> ProjectResponse:
        """Create a new project.

        Args:
            data: Project creation data
            user_id: Creator user ID

        Returns:
            Created project response
        """
        project = await self.project_repo.create(
            name=data.name,
            description=data.description,
            visibility=data.visibility,
            ca_objectif=None,  # Will be calculated from lot prices
            created_by=user_id,
        )

        logger.info(
            "Project created",
            project_id=project.id,
            name=project.name,
            created_by=user_id,
        )

        # New project has no lots yet, so ca_objectif is 0
        return ProjectResponse(
            id=project.id,
            name=project.name,
            description=project.description,
            visibility=project.visibility,
            total_lots=project.total_lots,
            sold_lots=project.sold_lots,
            ca_objectif=0.0,
            created_by=project.created_by,
            created_at=project.created_at,
            updated_at=project.updated_at,
        )

    async def update_project(
        self,
        project_id: int,
        data: ProjectUpdate,
    ) -> ProjectResponse:
        """Update a project.

        Args:
            project_id: Project ID
            data: Update data

        Returns:
            Updated project response

        Raises:
            NotFoundError: If project not found
        """
        project = await self.project_repo.get_by_id(project_id)
        if not project:
            raise NotFoundError("Project", project_id)

        updated = await self.project_repo.update(
            project_id,
            name=data.name,
            description=data.description,
            visibility=data.visibility,
            ca_objectif=None,  # Will be calculated from lot prices
        )

        logger.info("Project updated", project_id=project_id)

        # Calculate ca_objectif as sum of all lot prices
        ca_objectif_result = await self.session.execute(
            select(func.coalesce(func.sum(LotModel.price), 0)).where(
                LotModel.project_id == project_id
            )
        )
        ca_objectif = float(ca_objectif_result.scalar() or 0)

        return ProjectResponse(
            id=updated.id,
            name=updated.name,
            description=updated.description,
            visibility=updated.visibility,
            total_lots=updated.total_lots,
            sold_lots=updated.sold_lots,
            ca_objectif=ca_objectif,
            created_by=updated.created_by,
            created_at=updated.created_at,
            updated_at=updated.updated_at,
        )

    async def delete_project(self, project_id: int) -> None:
        """Delete a project and all its dependencies.

        Args:
            project_id: Project ID

        Raises:
            NotFoundError: If project not found
        """
        project = await self.project_repo.get_by_id(project_id)
        if not project:
            raise NotFoundError("Project", project_id)

        # Delete in FK dependency order (bulk SQL deletes bypass ORM cascade):
        # 1. Sales (reference reservations, lots, project)
        await self.session.execute(
            delete(SaleModel).where(SaleModel.project_id == project_id)
        )
        # 2. Reservations (reference lots, project)
        await self.session.execute(
            delete(ReservationModel).where(ReservationModel.project_id == project_id)
        )
        # 3. Lots (reference project)
        await self.session.execute(
            delete(LotModel).where(LotModel.project_id == project_id)
        )
        # 4. Assignments (reference project)
        await self.session.execute(
            delete(AssignmentModel).where(AssignmentModel.project_id == project_id)
        )
        # 5. Project
        await self.session.execute(
            delete(ProjectModel).where(ProjectModel.id == project_id)
        )
        await self.session.flush()

        logger.info("Project deleted", project_id=project_id)

    async def assign_user(
        self,
        project_id: int,
        user_id: int,
        assigned_by: int,
    ) -> None:
        """Assign user to project.

        Args:
            project_id: Project ID
            user_id: User to assign
            assigned_by: User performing assignment

        Raises:
            NotFoundError: If project or user not found
            BusinessRuleError: If already assigned
        """
        # Check project exists
        project = await self.project_repo.get_by_id(project_id)
        if not project:
            raise NotFoundError("Project", project_id)

        # Check user exists
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User", user_id)

        # Check not already assigned
        if await self.project_repo.is_user_assigned(project_id, user_id):
            raise BusinessRuleError(
                message="User is already assigned to this project",
                rule="user_already_assigned",
            )

        await self.project_repo.assign_user(project_id, user_id, assigned_by)

        logger.info(
            "User assigned to project",
            project_id=project_id,
            user_id=user_id,
            assigned_by=assigned_by,
        )

    async def unassign_user(self, project_id: int, user_id: int) -> None:
        """Remove user from project.

        Args:
            project_id: Project ID
            user_id: User to remove

        Raises:
            NotFoundError: If assignment not found
        """
        removed = await self.project_repo.unassign_user(project_id, user_id)

        if not removed:
            raise NotFoundError("Assignment", f"{project_id}/{user_id}")

        logger.info(
            "User unassigned from project",
            project_id=project_id,
            user_id=user_id,
        )

    async def get_assigned_users(self, project_id: int) -> list[UserResponse]:
        """Get users assigned to project.

        Args:
            project_id: Project ID

        Returns:
            List of assigned users

        Raises:
            NotFoundError: If project not found
        """
        project = await self.project_repo.get_by_id(project_id)
        if not project:
            raise NotFoundError("Project", project_id)

        users = await self.project_repo.get_assigned_users(project_id)

        return [
            UserResponse(
                id=u.id,
                email=u.email,
                name=u.name,
                role=u.role,
                created_at=u.created_at,
                updated_at=u.updated_at,
            )
            for u in users
        ]

    async def get_project_kpis(
        self,
        project_id: int,
        user_id: int,
        user_role: str,
        filter_user_id: int | None = None,
    ) -> ProjectKPIs:
        """Get KPIs for a specific project.

        Args:
            project_id: Project ID
            user_id: Current user ID
            user_role: Current user role
            filter_user_id: Optional filter by commercial user ID

        Returns:
            Project KPIs

        Raises:
            NotFoundError: If project not found
            AuthorizationError: If user cannot access project
        """
        project = await self.project_repo.get_by_id(project_id)
        if not project:
            raise NotFoundError("Project", project_id)

        # Check access
        can_access = await self.project_repo.can_user_access(
            project_id, user_id, user_role
        )
        if not can_access:
            raise AuthorizationError(message="You don't have access to this project")

        # If filtering by user, calculate user-specific KPIs
        if filter_user_id:
            return await self._get_user_filtered_kpis(project, filter_user_id)

        # Count lots by status
        status_counts = await self.lot_repo.count_by_status(project_id)

        # Calculate surfaces by status
        surface_result = await self.session.execute(
            select(
                func.coalesce(func.sum(LotModel.surface), 0).label("total"),
                func.coalesce(
                    func.sum(LotModel.surface).filter(LotModel.status == "available"), 0
                ).label("available"),
                func.coalesce(
                    func.sum(LotModel.surface).filter(LotModel.status == "reserved"), 0
                ).label("reserved"),
                func.coalesce(
                    func.sum(LotModel.surface).filter(LotModel.status == "sold"), 0
                ).label("sold"),
            ).where(LotModel.project_id == project_id)
        )
        surface_row = surface_result.one()

        # CA realized (from sales)
        ca_result = await self.session.execute(
            select(func.sum(SaleModel.price)).where(SaleModel.project_id == project_id)
        )
        ca_realise = float(ca_result.scalar() or 0)

        # CA potential (from active reservations - more accurate than lot status)
        potential_result = await self.session.execute(
            select(func.coalesce(func.sum(LotModel.price), 0)).where(
                LotModel.project_id == project_id,
                LotModel.id.in_(
                    select(ReservationModel.lot_id).where(
                        ReservationModel.project_id == project_id,
                        ReservationModel.status == "active",
                    )
                ),
            )
        )
        ca_potentiel = float(potential_result.scalar() or 0)

        # Calculate rates
        total = sum(status_counts.values()) or 1
        sold_lots = status_counts.get("sold", 0)
        reserved_lots = status_counts.get("reserved", 0)
        taux_vente = round((sold_lots / total) * 100, 2)
        taux_reservation = round((reserved_lots / total) * 100, 2)

        # Conversion rate
        conversion_result = await self.session.execute(
            select(
                func.count().label("total"),
                func.count().filter(ReservationModel.status == "converted").label(
                    "converted"
                ),
            ).where(ReservationModel.project_id == project_id)
        )
        conv_row = conversion_result.one()
        total_res = conv_row.total or 1
        taux_transformation = round((conv_row.converted / total_res) * 100, 2)

        # Calculate ca_objectif as total price of all lots
        ca_objectif_result = await self.session.execute(
            select(func.coalesce(func.sum(LotModel.price), 0)).where(
                LotModel.project_id == project_id
            )
        )
        ca_objectif = float(ca_objectif_result.scalar() or 0)

        # Financial calculations
        surface_vendue = float(surface_row.sold or 0)
        progression_ca = 0.0
        if ca_objectif > 0:
            progression_ca = round((ca_realise / ca_objectif) * 100, 2)

        prix_moyen_lot = 0.0
        if sold_lots > 0:
            prix_moyen_lot = round(ca_realise / sold_lots, 2)

        prix_moyen_m2 = 0.0
        if surface_vendue > 0:
            prix_moyen_m2 = round(ca_realise / surface_vendue, 2)

        # Total deposits from active reservations
        deposits_result = await self.session.execute(
            select(func.coalesce(func.sum(ReservationModel.deposit), 0)).where(
                ReservationModel.project_id == project_id,
                ReservationModel.status == "active",
            )
        )
        total_deposits = float(deposits_result.scalar() or 0)

        # Monthly stats - current month
        from datetime import date

        today = date.today()
        first_day_this_month = date(today.year, today.month, 1)

        # Calculate first day of previous month
        if today.month == 1:
            first_day_prev_month = date(today.year - 1, 12, 1)
        else:
            first_day_prev_month = date(today.year, today.month - 1, 1)

        # Sales this month - use func.date() to compare dates without timezone issues
        sales_this_month_result = await self.session.execute(
            select(
                func.count().label("count"),
                func.coalesce(func.sum(SaleModel.price), 0).label("total"),
            ).where(
                SaleModel.project_id == project_id,
                func.date(SaleModel.sale_date) >= first_day_this_month,
            )
        )
        sales_this_month = sales_this_month_result.one()
        ventes_mois = sales_this_month.count or 0
        ca_mois = float(sales_this_month.total or 0)

        # Sales previous month
        sales_prev_month_result = await self.session.execute(
            select(
                func.count().label("count"),
                func.coalesce(func.sum(SaleModel.price), 0).label("total"),
            ).where(
                SaleModel.project_id == project_id,
                func.date(SaleModel.sale_date) >= first_day_prev_month,
                func.date(SaleModel.sale_date) < first_day_this_month,
            )
        )
        sales_prev_month = sales_prev_month_result.one()
        ventes_prev = sales_prev_month.count or 0
        ca_prev = float(sales_prev_month.total or 0)

        # Calculate trends
        tendance_ventes = 0.0
        if ventes_prev > 0:
            tendance_ventes = round(((ventes_mois - ventes_prev) / ventes_prev) * 100, 2)
        elif ventes_mois > 0:
            tendance_ventes = 100.0

        tendance_ca = 0.0
        if ca_prev > 0:
            tendance_ca = round(((ca_mois - ca_prev) / ca_prev) * 100, 2)
        elif ca_mois > 0:
            tendance_ca = 100.0

        return ProjectKPIs(
            project_id=project_id,
            total_lots=sum(status_counts.values()),
            available_lots=status_counts.get("available", 0),
            reserved_lots=reserved_lots,
            sold_lots=sold_lots,
            blocked_lots=status_counts.get("blocked", 0),
            surface_totale=round(float(surface_row.total or 0), 2),
            surface_disponible=round(float(surface_row.available or 0), 2),
            surface_reservee=round(float(surface_row.reserved or 0), 2),
            surface_vendue=round(surface_vendue, 2),
            ca_realise=ca_realise,
            ca_potentiel=ca_potentiel,
            ca_objectif=ca_objectif,
            progression_ca=progression_ca,
            prix_moyen_lot=prix_moyen_lot,
            prix_moyen_m2=prix_moyen_m2,
            taux_vente=taux_vente,
            taux_reservation=taux_reservation,
            taux_transformation=taux_transformation,
            taux_conversion=taux_transformation,
            total_deposits=total_deposits,
            ventes_mois=ventes_mois,
            ca_mois=ca_mois,
            tendance_ventes=tendance_ventes,
            tendance_ca=tendance_ca,
        )

    async def _get_user_filtered_kpis(
        self,
        project,
        filter_user_id: int,
    ) -> ProjectKPIs:
        """Get KPIs filtered by a specific commercial user."""
        from datetime import date

        project_id = project.id

        # Get lots associated with this user (via reservations or sales)
        user_reserved_lots = select(ReservationModel.lot_id).where(
            ReservationModel.project_id == project_id,
            ReservationModel.reserved_by_user_id == filter_user_id,
        )
        user_sold_lots = select(SaleModel.lot_id).where(
            SaleModel.project_id == project_id,
            SaleModel.sold_by_user_id == filter_user_id,
        )

        # Count user's reservations (active)
        reserved_count_result = await self.session.execute(
            select(func.count()).where(
                ReservationModel.project_id == project_id,
                ReservationModel.reserved_by_user_id == filter_user_id,
                ReservationModel.status == "active",
            )
        )
        reserved_lots = reserved_count_result.scalar() or 0

        # Count user's sales
        sold_count_result = await self.session.execute(
            select(func.count()).where(
                SaleModel.project_id == project_id,
                SaleModel.sold_by_user_id == filter_user_id,
            )
        )
        sold_lots = sold_count_result.scalar() or 0

        # CA realized (from user's sales)
        ca_result = await self.session.execute(
            select(func.coalesce(func.sum(SaleModel.price), 0)).where(
                SaleModel.project_id == project_id,
                SaleModel.sold_by_user_id == filter_user_id,
            )
        )
        ca_realise = float(ca_result.scalar() or 0)

        # CA potential (from user's active reservations)
        potential_result = await self.session.execute(
            select(func.coalesce(func.sum(LotModel.price), 0)).where(
                LotModel.id.in_(
                    select(ReservationModel.lot_id).where(
                        ReservationModel.project_id == project_id,
                        ReservationModel.reserved_by_user_id == filter_user_id,
                        ReservationModel.status == "active",
                    )
                ),
            )
        )
        ca_potentiel = float(potential_result.scalar() or 0)

        # Get global lot count for percentage calculation
        total_lots_result = await self.session.execute(
            select(func.count()).where(LotModel.project_id == project_id)
        )
        total_lots = total_lots_result.scalar() or 1

        # Calculate rates based on user's performance
        taux_vente = round((sold_lots / total_lots) * 100, 2)
        taux_reservation = round((reserved_lots / total_lots) * 100, 2)

        # Conversion rate for this user
        conversion_result = await self.session.execute(
            select(
                func.count().label("total"),
                func.count().filter(ReservationModel.status == "converted").label(
                    "converted"
                ),
            ).where(
                ReservationModel.project_id == project_id,
                ReservationModel.reserved_by_user_id == filter_user_id,
            )
        )
        conv_row = conversion_result.one()
        total_res = conv_row.total or 1
        taux_transformation = round((conv_row.converted / total_res) * 100, 2)

        # Surfaces for user's lots
        surface_reserved_result = await self.session.execute(
            select(func.coalesce(func.sum(LotModel.surface), 0)).where(
                LotModel.id.in_(
                    select(ReservationModel.lot_id).where(
                        ReservationModel.project_id == project_id,
                        ReservationModel.reserved_by_user_id == filter_user_id,
                        ReservationModel.status == "active",
                    )
                ),
            )
        )
        surface_reservee = float(surface_reserved_result.scalar() or 0)

        surface_sold_result = await self.session.execute(
            select(func.coalesce(func.sum(LotModel.surface), 0)).where(
                LotModel.id.in_(
                    select(SaleModel.lot_id).where(
                        SaleModel.project_id == project_id,
                        SaleModel.sold_by_user_id == filter_user_id,
                    )
                ),
            )
        )
        surface_vendue = float(surface_sold_result.scalar() or 0)

        # Calculate ca_objectif as total price of all lots
        ca_objectif_result = await self.session.execute(
            select(func.coalesce(func.sum(LotModel.price), 0)).where(
                LotModel.project_id == project_id
            )
        )
        ca_objectif = float(ca_objectif_result.scalar() or 0)

        # Financial calculations
        progression_ca = 0.0
        if ca_objectif > 0:
            progression_ca = round((ca_realise / ca_objectif) * 100, 2)

        prix_moyen_lot = 0.0
        if sold_lots > 0:
            prix_moyen_lot = round(ca_realise / sold_lots, 2)

        prix_moyen_m2 = 0.0
        if surface_vendue > 0:
            prix_moyen_m2 = round(ca_realise / surface_vendue, 2)

        # Total deposits from user's active reservations
        deposits_result = await self.session.execute(
            select(func.coalesce(func.sum(ReservationModel.deposit), 0)).where(
                ReservationModel.project_id == project_id,
                ReservationModel.reserved_by_user_id == filter_user_id,
                ReservationModel.status == "active",
            )
        )
        total_deposits = float(deposits_result.scalar() or 0)

        # Monthly stats for this user
        today = date.today()
        first_day_this_month = date(today.year, today.month, 1)
        if today.month == 1:
            first_day_prev_month = date(today.year - 1, 12, 1)
        else:
            first_day_prev_month = date(today.year, today.month - 1, 1)

        # Sales this month
        sales_this_month_result = await self.session.execute(
            select(
                func.count().label("count"),
                func.coalesce(func.sum(SaleModel.price), 0).label("total"),
            ).where(
                SaleModel.project_id == project_id,
                SaleModel.sold_by_user_id == filter_user_id,
                func.date(SaleModel.sale_date) >= first_day_this_month,
            )
        )
        sales_this_month = sales_this_month_result.one()
        ventes_mois = sales_this_month.count or 0
        ca_mois = float(sales_this_month.total or 0)

        # Sales previous month
        sales_prev_month_result = await self.session.execute(
            select(
                func.count().label("count"),
                func.coalesce(func.sum(SaleModel.price), 0).label("total"),
            ).where(
                SaleModel.project_id == project_id,
                SaleModel.sold_by_user_id == filter_user_id,
                func.date(SaleModel.sale_date) >= first_day_prev_month,
                func.date(SaleModel.sale_date) < first_day_this_month,
            )
        )
        sales_prev_month = sales_prev_month_result.one()
        ventes_prev = sales_prev_month.count or 0
        ca_prev = float(sales_prev_month.total or 0)

        # Calculate trends
        tendance_ventes = 0.0
        if ventes_prev > 0:
            tendance_ventes = round(((ventes_mois - ventes_prev) / ventes_prev) * 100, 2)
        elif ventes_mois > 0:
            tendance_ventes = 100.0

        tendance_ca = 0.0
        if ca_prev > 0:
            tendance_ca = round(((ca_mois - ca_prev) / ca_prev) * 100, 2)
        elif ca_mois > 0:
            tendance_ca = 100.0

        return ProjectKPIs(
            project_id=project_id,
            total_lots=total_lots,
            available_lots=0,  # Not relevant for user filter
            reserved_lots=reserved_lots,
            sold_lots=sold_lots,
            blocked_lots=0,  # Not relevant for user filter
            surface_totale=0,  # Not relevant for user filter
            surface_disponible=0,  # Not relevant for user filter
            surface_reservee=round(surface_reservee, 2),
            surface_vendue=round(surface_vendue, 2),
            ca_realise=ca_realise,
            ca_potentiel=ca_potentiel,
            ca_objectif=ca_objectif,
            progression_ca=progression_ca,
            prix_moyen_lot=prix_moyen_lot,
            prix_moyen_m2=prix_moyen_m2,
            taux_vente=taux_vente,
            taux_reservation=taux_reservation,
            taux_transformation=taux_transformation,
            taux_conversion=taux_transformation,
            total_deposits=total_deposits,
            ventes_mois=ventes_mois,
            ca_mois=ca_mois,
            tendance_ventes=tendance_ventes,
            tendance_ca=tendance_ca,
        )

    async def get_project_performance(
        self,
        project_id: int,
        user_id: int,
        user_role: str,
    ) -> list[ProjectPerformance]:
        """Get commercial performance for a project.

        Args:
            project_id: Project ID
            user_id: Current user ID
            user_role: Current user role

        Returns:
            List of commercial performance data

        Raises:
            NotFoundError: If project not found
            AuthorizationError: If user cannot access project
        """
        project = await self.project_repo.get_by_id(project_id)
        if not project:
            raise NotFoundError("Project", project_id)

        # Check access
        can_access = await self.project_repo.can_user_access(
            project_id, user_id, user_role
        )
        if not can_access:
            raise AuthorizationError(message="You don't have access to this project")

        # Get assigned users
        assigned_users = await self.project_repo.get_assigned_users(project_id)

        performances = []
        for user in assigned_users:
            # Count sales
            sales_result = await self.session.execute(
                select(func.count(), func.sum(SaleModel.price)).where(
                    SaleModel.project_id == project_id,
                    SaleModel.sold_by_user_id == user.id,
                )
            )
            sales_row = sales_result.one()
            total_sales = sales_row[0] or 0
            ca_total = float(sales_row[1] or 0)

            # Count reservations
            res_result = await self.session.execute(
                select(
                    func.count().label("total"),
                    func.count()
                    .filter(ReservationModel.status == "converted")
                    .label("converted"),
                ).where(
                    ReservationModel.project_id == project_id,
                    ReservationModel.reserved_by_user_id == user.id,
                )
            )
            res_row = res_result.one()
            total_reservations = res_row.total or 0
            converted = res_row.converted or 0
            taux = (
                round((converted / total_reservations) * 100, 2)
                if total_reservations > 0
                else 0
            )

            performances.append(
                ProjectPerformance(
                    user_id=user.id,
                    user_name=user.name,
                    total_sales=total_sales,
                    total_reservations=total_reservations,
                    converted_reservations=converted,
                    ca_total=ca_total,
                    taux_transformation=taux,
                )
            )

        return performances

    async def get_project_history(
        self,
        project_id: int,
        user_id: int,
        user_role: str,
        limit: int = 50,
        filter_user_id: int | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
    ) -> list[dict]:
        """Get project action history.

        Args:
            project_id: Project ID
            user_id: Current user ID
            user_role: Current user role
            limit: Maximum number of entries
            filter_user_id: Filter by specific user
            date_from: Start date (YYYY-MM-DD)
            date_to: End date (YYYY-MM-DD)

        Returns:
            List of history entries

        Raises:
            NotFoundError: If project not found
            AuthorizationError: If user cannot access project
        """
        from app.infrastructure.database.models import ClientModel

        project = await self.project_repo.get_by_id(project_id)
        if not project:
            raise NotFoundError("Project", project_id)

        # Check access
        can_access = await self.project_repo.can_user_access(
            project_id, user_id, user_role
        )
        if not can_access:
            raise AuthorizationError(message="You don't have access to this project")

        # Commercial can only see their own history
        if user_role == "commercial":
            filter_user_id = user_id

        history = []

        # Build base conditions
        res_conditions = [ReservationModel.project_id == project_id]
        sale_conditions = [SaleModel.project_id == project_id]

        if filter_user_id:
            res_conditions.append(
                ReservationModel.reserved_by_user_id == filter_user_id
            )
            sale_conditions.append(SaleModel.sold_by_user_id == filter_user_id)

        if date_from:
            from_dt = datetime.fromisoformat(date_from)
            res_conditions.append(ReservationModel.created_at >= from_dt)
            sale_conditions.append(SaleModel.created_at >= from_dt)

        if date_to:
            to_dt = datetime.fromisoformat(date_to)
            res_conditions.append(ReservationModel.created_at <= to_dt)
            sale_conditions.append(SaleModel.created_at <= to_dt)

        # Get reservations
        res_query = (
            select(
                ReservationModel,
                LotModel.numero.label("lot_numero"),
                ClientModel.name.label("client_name"),
                UserModel.name.label("user_name"),
            )
            .join(LotModel, LotModel.id == ReservationModel.lot_id)
            .outerjoin(ClientModel, ClientModel.id == ReservationModel.client_id)
            .outerjoin(UserModel, UserModel.id == ReservationModel.reserved_by_user_id)
            .where(*res_conditions)
            .order_by(ReservationModel.created_at.desc())
            .limit(limit)
        )
        res_result = await self.session.execute(res_query)

        for res, lot_numero, client_name, user_name in res_result.all():
            action_map = {
                "active": "reserve",
                "converted": "sell",
                "released": "cancel",
                "expired": "expire",
            }
            action = action_map.get(res.status, "reserve")

            description = f"Réservation du lot {lot_numero}"
            if client_name:
                description += f" pour {client_name}"
            if res.deposit and res.deposit > 0:
                description += f" (acompte: {res.deposit} MAD)"

            history.append(
                {
                    "id": f"r_{res.id}",
                    "action": action,
                    "description": description,
                    "user_name": user_name or "Système",
                    "user_id": res.reserved_by_user_id,
                    "created_at": res.created_at.isoformat(),
                    "lot_numero": lot_numero,
                    "client_name": client_name,
                }
            )

        # Get sales
        sale_query = (
            select(
                SaleModel,
                LotModel.numero.label("lot_numero"),
                ClientModel.name.label("client_name"),
                UserModel.name.label("user_name"),
            )
            .join(LotModel, LotModel.id == SaleModel.lot_id)
            .outerjoin(ClientModel, ClientModel.id == SaleModel.client_id)
            .outerjoin(UserModel, UserModel.id == SaleModel.sold_by_user_id)
            .where(*sale_conditions)
            .order_by(SaleModel.created_at.desc())
            .limit(limit)
        )
        sale_result = await self.session.execute(sale_query)

        for sale, lot_numero, client_name, user_name in sale_result.all():
            description = f"Vente du lot {lot_numero}"
            if client_name:
                description += f" à {client_name}"
            if sale.price:
                description += f" pour {sale.price:,.0f} MAD"

            history.append(
                {
                    "id": f"s_{sale.id}",
                    "action": "sell",
                    "description": description,
                    "user_name": user_name or "Système",
                    "user_id": sale.sold_by_user_id,
                    "created_at": sale.created_at.isoformat(),
                    "lot_numero": lot_numero,
                    "client_name": client_name,
                }
            )

        # Sort by created_at descending
        history.sort(key=lambda x: x["created_at"], reverse=True)

        return history[:limit]

    async def upload_geojson(
        self,
        project_id: int,
        user_id: int,
        user_role: str,
        geojson_data: dict,
    ) -> dict:
        """Upload GeoJSON and create/update lots.

        Args:
            project_id: Project ID
            user_id: Current user ID
            user_role: Current user role
            geojson_data: GeoJSON FeatureCollection

        Returns:
            Upload result with created/updated/skipped counts

        Raises:
            NotFoundError: If project not found
            AuthorizationError: If user cannot access project
            BusinessRuleError: If GeoJSON format is invalid
        """
        import json

        project = await self.project_repo.get_by_id(project_id)
        if not project:
            raise NotFoundError("Project", project_id)

        # Check access (only manager can upload)
        if user_role != "manager":
            raise AuthorizationError(message="Only managers can upload GeoJSON")

        # Validate GeoJSON format
        if geojson_data.get("type") != "FeatureCollection":
            raise BusinessRuleError(
                message="Invalid GeoJSON: must be a FeatureCollection",
                rule="invalid_geojson_format",
            )

        features = geojson_data.get("features", [])
        if not features:
            raise BusinessRuleError(
                message="Invalid GeoJSON: no features found",
                rule="empty_geojson",
            )

        created = 0
        updated = 0
        skipped = 0
        errors = []

        for i, feature in enumerate(features):
            try:
                props = feature.get("properties", {})
                geometry = feature.get("geometry")

                # Get lot numero from properties (support various naming conventions)
                numero = (
                    props.get("numero")
                    or props.get("Numero")
                    or props.get("parcelid")
                    or props.get("Parcelid")
                    or props.get("PARCELID")
                    or props.get("id")
                )
                if not numero:
                    errors.append(f"Feature {i}: missing 'numero' property")
                    skipped += 1
                    continue

                numero = str(numero)

                # Check if lot exists
                existing_lot = await self.lot_repo.get_by_numero(project_id, numero)

                # Extract other properties (support various naming conventions)
                zone = props.get("zone") or props.get("Zone")
                surface = (
                    props.get("surface")
                    or props.get("Surface")
                    or props.get("Shape_Area")
                    or props.get("shape_area")
                    or props.get("SHAPE_AREA")
                )
                price = props.get("price") or props.get("Prix") or props.get("prix")

                # Metadata fields
                type_lot = props.get("type_lot") or props.get("type de lots") or props.get("type_de_lots")
                emplacement = props.get("emplacement") or props.get("Emplacement")
                type_maison = props.get("type_maison") or props.get("type maison") or props.get("type_maison")

                # Convert surface/price to float if needed
                if surface and not isinstance(surface, (int, float)):
                    try:
                        surface = float(surface)
                    except (ValueError, TypeError):
                        surface = None

                if price and not isinstance(price, (int, float)):
                    try:
                        price = float(price)
                    except (ValueError, TypeError):
                        price = None

                geometry_str = json.dumps(geometry) if geometry else None

                if existing_lot:
                    # Update existing lot
                    await self.lot_repo.update(
                        existing_lot.id,
                        zone=zone or existing_lot.zone,
                        surface=surface or existing_lot.surface,
                        price=price or existing_lot.price,
                        geometry=geometry_str,
                        type_lot=type_lot or existing_lot.type_lot,
                        emplacement=emplacement or existing_lot.emplacement,
                        type_maison=type_maison or existing_lot.type_maison,
                    )
                    updated += 1
                else:
                    # Create new lot
                    await self.lot_repo.create(
                        project_id=project_id,
                        numero=numero,
                        zone=zone,
                        surface=surface,
                        price=price,
                        status="available",
                        geometry=geometry_str,
                        type_lot=type_lot,
                        emplacement=emplacement,
                        type_maison=type_maison,
                    )
                    created += 1

            except Exception as e:
                errors.append(f"Feature {i}: {str(e)}")
                skipped += 1

        # Update project lot count
        new_total = project.total_lots + created
        await self.project_repo.update_lot_counts(project_id, total_lots=new_total)

        logger.info(
            "GeoJSON uploaded",
            project_id=project_id,
            created=created,
            updated=updated,
            skipped=skipped,
        )

        return {
            "created": created,
            "updated": updated,
            "skipped": skipped,
            "errors": errors,
        }

    async def upload_geojson_file(
        self,
        project_id: int,
        user_id: int,
        user_role: str,
        file: "UploadFile",
    ) -> dict:
        """Upload GeoJSON file to Supabase Storage and create/update lots.

        Args:
            project_id: Project ID
            user_id: Current user ID
            user_role: Current user role
            file: Uploaded GeoJSON file

        Returns:
            Upload result with created/updated/skipped counts and file URL

        Raises:
            NotFoundError: If project not found
            AuthorizationError: If user cannot access project
            BusinessRuleError: If GeoJSON format is invalid
            StorageError: If file upload to Supabase Storage fails
        """
        import json
        from fastapi import UploadFile

        from app.infrastructure.storage.supabase_storage import get_storage_client

        project = await self.project_repo.get_by_id(project_id)
        if not project:
            raise NotFoundError("Project", project_id)

        # Check access (only manager can upload)
        if user_role != "manager":
            raise AuthorizationError(message="Only managers can upload GeoJSON")

        # Validate file type
        if not file.filename or not file.filename.endswith(".geojson"):
            if not file.filename or not file.filename.endswith(".json"):
                raise BusinessRuleError(
                    message="Invalid file type: must be a .geojson or .json file",
                    rule="invalid_file_type",
                )

        # Read file content
        content = await file.read()

        # Parse GeoJSON
        try:
            geojson_data = json.loads(content)
        except json.JSONDecodeError as e:
            raise BusinessRuleError(
                message=f"Invalid JSON format: {e}",
                rule="invalid_json",
            )

        # Upload to Supabase Storage
        storage_client = get_storage_client()
        file_path = f"projects/{project_id}/{file.filename}"

        try:
            file_url = storage_client.upload_file(
                file_path=file_path,
                file_content=content,
                content_type="application/geo+json",
            )
        except Exception as e:
            logger.error(f"Failed to upload file to Supabase Storage: {e}")
            raise StorageError(
                message=f"Failed to upload file to storage: {e}",
                storage_path=file_path,
            )

        # Update project with file URL
        await self.project_repo.update(
            project_id,
            geojson_file_url=file_url,
        )

        # Process GeoJSON and create/update lots
        result = await self.upload_geojson(
            project_id=project_id,
            user_id=user_id,
            user_role=user_role,
            geojson_data=geojson_data,
        )

        # Add file URL to result
        result["file_url"] = file_url
        result["file_path"] = file_path

        logger.info(
            "GeoJSON file uploaded to Supabase Storage",
            project_id=project_id,
            file_path=file_path,
            file_url=file_url,
        )

        return result

    async def export_geojson(
        self,
        project_id: int,
        user_id: int,
        user_role: str,
    ) -> dict:
        """Export project lots as GeoJSON FeatureCollection.

        Args:
            project_id: Project ID
            user_id: Current user ID
            user_role: Current user role

        Returns:
            GeoJSON FeatureCollection

        Raises:
            NotFoundError: If project not found
            AuthorizationError: If user cannot access project
        """
        import json

        project = await self.project_repo.get_by_id(project_id)
        if not project:
            raise NotFoundError("Project", project_id)

        # Check access
        can_access = await self.project_repo.can_user_access(
            project_id, user_id, user_role
        )
        if not can_access:
            raise AuthorizationError(message="You don't have access to this project")

        # Get lots with details
        lots_data = await self.lot_repo.get_project_lots_with_details(project_id)

        features = []
        for lot in lots_data:
            # Parse geometry from string
            geometry = None
            if lot.get("geometry"):
                try:
                    geometry = json.loads(lot["geometry"])
                except (json.JSONDecodeError, TypeError):
                    pass

            # Build properties (include aliases for frontend compatibility)
            properties = {
                # Primary identifiers
                "id": lot["id"],
                "db_id": lot["id"],  # Alias for frontend
                "numero": lot["numero"],
                "lot_id": lot["numero"],  # Alias for frontend
                "parcelid": lot["numero"],  # Alias for frontend
                # Lot details
                "zone": lot.get("zone"),
                "surface": lot.get("surface"),
                "Shape_Area": lot.get("surface"),  # Alias for frontend
                "price": lot.get("price"),
                "status": lot["status"],
                # Metadata fields
                "type_lot": lot.get("type_lot"),
                "emplacement": lot.get("emplacement"),
                "type_maison": lot.get("type_maison"),
            }

            # Add reservation info if present
            if lot.get("client_id"):
                properties["client_id"] = lot["client_id"]
            if lot.get("client_name"):
                properties["client_name"] = lot["client_name"]
            if lot.get("client_phone"):
                properties["client_phone"] = lot["client_phone"]
            if lot.get("reservation_id"):
                properties["reservation_id"] = lot["reservation_id"]
            if lot.get("reservation_date"):
                properties["reservation_date"] = (
                    lot["reservation_date"].isoformat()
                    if hasattr(lot["reservation_date"], "isoformat")
                    else str(lot["reservation_date"])
                )
            if lot.get("expiration_date"):
                properties["expiration_date"] = (
                    lot["expiration_date"].isoformat()
                    if hasattr(lot["expiration_date"], "isoformat")
                    else str(lot["expiration_date"])
                )
            if lot.get("deposit") is not None:
                properties["deposit"] = lot["deposit"]
            if lot.get("reserved_by_user_id"):
                properties["reserved_by_user_id"] = lot["reserved_by_user_id"]
            if lot.get("reserved_by"):
                properties["reserved_by"] = lot["reserved_by"]
            if lot.get("days_in_status") is not None:
                properties["days_in_status"] = lot["days_in_status"]

            features.append(
                {
                    "type": "Feature",
                    "geometry": geometry,
                    "properties": properties,
                }
            )

        return {
            "type": "FeatureCollection",
            "features": features,
        }

    async def import_csv_metadata(
        self,
        project_id: int,
        user_id: int,
        user_role: str,
        csv_rows: list[dict],
    ) -> dict:
        """Import CSV metadata to update existing lots.

        The CSV must have a 'parcelid' column that matches lot 'numero'.
        Supported columns: parcelid, type de lots, emplacement, type maison, prix

        Args:
            project_id: Project ID
            user_id: Current user ID
            user_role: Current user role
            csv_rows: List of CSV row dictionaries

        Returns:
            Import result with updated/skipped counts

        Raises:
            NotFoundError: If project not found
            AuthorizationError: If user cannot access project
        """
        project = await self.project_repo.get_by_id(project_id)
        if not project:
            raise NotFoundError("Project", project_id)

        # Check access (only manager can import)
        if user_role != "manager":
            raise AuthorizationError(message="Only managers can import CSV metadata")

        if not csv_rows:
            raise BusinessRuleError(
                message="CSV file is empty",
                rule="empty_csv",
            )

        updated = 0
        skipped = 0
        not_found = 0
        errors = []

        for i, row in enumerate(csv_rows):
            try:
                # Get lot numero from parcelid column (support various naming)
                numero = (
                    row.get("parcelid")
                    or row.get("parcel_id")
                    or row.get("Parcelid")
                    or row.get("PARCELID")
                    or row.get("numero")
                    or row.get("Numero")
                )

                if not numero:
                    errors.append(f"Row {i + 1}: missing 'parcelid' column")
                    skipped += 1
                    continue

                numero = str(numero).strip()

                # Find existing lot
                existing_lot = await self.lot_repo.get_by_numero(project_id, numero)
                if not existing_lot:
                    errors.append(f"Row {i + 1}: lot '{numero}' not found in project")
                    not_found += 1
                    continue

                # Extract metadata fields (support various column naming)
                type_lot = (
                    row.get("type de lots")
                    or row.get("type_de_lots")
                    or row.get("type_lot")
                    or row.get("Type de lots")
                )
                emplacement = (
                    row.get("emplacement")
                    or row.get("Emplacement")
                    or row.get("EMPLACEMENT")
                )
                type_maison = (
                    row.get("type maison")
                    or row.get("type_maison")
                    or row.get("Type maison")
                    or row.get("TYPE_MAISON")
                )
                price = (
                    row.get("prix")
                    or row.get("Prix")
                    or row.get("price")
                    or row.get("Price")
                )

                # Convert price to float if provided
                if price and not isinstance(price, (int, float)):
                    try:
                        price = float(str(price).replace(" ", "").replace(",", "."))
                    except (ValueError, TypeError):
                        price = None

                # Update lot with metadata
                update_data = {}
                if type_lot:
                    update_data["type_lot"] = str(type_lot).strip()
                if emplacement:
                    update_data["emplacement"] = str(emplacement).strip()
                if type_maison:
                    update_data["type_maison"] = str(type_maison).strip()
                if price is not None:
                    update_data["price"] = price

                if update_data:
                    await self.lot_repo.update(existing_lot.id, **update_data)
                    updated += 1
                else:
                    skipped += 1

            except Exception as e:
                errors.append(f"Row {i + 1}: {str(e)}")
                skipped += 1

        logger.info(
            "CSV metadata imported",
            project_id=project_id,
            updated=updated,
            skipped=skipped,
            not_found=not_found,
        )

        return {
            "updated": updated,
            "skipped": skipped,
            "not_found": not_found,
            "errors": errors[:20],  # Limit errors to first 20
        }
