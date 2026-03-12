"""Project repository implementation."""

from sqlalchemy import and_, func, or_, select

from app.infrastructure.database.models import (
    AssignmentModel,
    LotModel,
    ProjectModel,
    UserModel,
)
from app.infrastructure.database.repositories.base import BaseRepository


class ProjectRepository(BaseRepository[ProjectModel]):
    """Repository for project data access operations."""

    model = ProjectModel

    async def get_by_id(self, id: int) -> ProjectModel | None:
        """Get a project by ID with dynamically calculated lot counts.

        Args:
            id: Project ID

        Returns:
            Project with accurate sold_lots and total_lots counts
        """
        # Subquery to count sold lots
        sold_lots_subquery = (
            select(func.count(LotModel.id))
            .where(LotModel.project_id == id, LotModel.status == "sold")
            .scalar_subquery()
        )

        # Subquery to count total lots
        total_lots_subquery = (
            select(func.count(LotModel.id))
            .where(LotModel.project_id == id)
            .scalar_subquery()
        )

        query = select(
            ProjectModel,
            func.coalesce(sold_lots_subquery, 0).label("actual_sold_lots"),
            func.coalesce(total_lots_subquery, 0).label("actual_total_lots"),
        ).where(ProjectModel.id == id)

        result = await self.session.execute(query)
        row = result.one_or_none()

        if not row:
            return None

        project = row[0]
        # Override with actual counts from lots table
        project.sold_lots = row[1]
        project.total_lots = row[2]

        return project

    async def get_all_for_user(
        self,
        user_id: int | None = None,
        user_role: str | None = None,
    ) -> list[ProjectModel]:
        """Get projects based on user access with dynamically calculated sold_lots.

        Args:
            user_id: Current user's ID
            user_role: Current user's role

        Returns:
            List of accessible projects with accurate sold_lots counts
        """
        # Subquery to count sold lots per project
        sold_lots_subquery = (
            select(
                LotModel.project_id,
                func.count(LotModel.id).label("sold_count"),
            )
            .where(LotModel.status == "sold")
            .group_by(LotModel.project_id)
            .subquery()
        )

        # Subquery to count total lots per project
        total_lots_subquery = (
            select(
                LotModel.project_id,
                func.count(LotModel.id).label("total_count"),
            )
            .group_by(LotModel.project_id)
            .subquery()
        )

        query = select(
            ProjectModel,
            func.coalesce(sold_lots_subquery.c.sold_count, 0).label("actual_sold_lots"),
            func.coalesce(total_lots_subquery.c.total_count, 0).label("actual_total_lots"),
        ).outerjoin(
            sold_lots_subquery,
            ProjectModel.id == sold_lots_subquery.c.project_id,
        ).outerjoin(
            total_lots_subquery,
            ProjectModel.id == total_lots_subquery.c.project_id,
        )

        if user_role == "manager":
            # Managers see all projects
            pass
        elif user_role == "commercial" and user_id:
            # Commercials see assigned + public projects
            assigned_subquery = (
                select(AssignmentModel.project_id)
                .where(AssignmentModel.user_id == user_id)
            )
            query = query.where(
                or_(
                    ProjectModel.visibility == "public",
                    ProjectModel.id.in_(assigned_subquery),
                )
            )
        else:
            # Clients see only public projects
            query = query.where(ProjectModel.visibility == "public")

        query = query.order_by(ProjectModel.created_at.desc())

        result = await self.session.execute(query)
        projects = []
        for row in result.all():
            project = row[0]
            # Override with actual counts from lots table
            project.sold_lots = row[1]
            project.total_lots = row[2]
            projects.append(project)

        return projects

    async def is_user_assigned(self, project_id: int, user_id: int) -> bool:
        """Check if user is assigned to project.

        Args:
            project_id: Project ID
            user_id: User ID

        Returns:
            True if assigned
        """
        result = await self.session.execute(
            select(AssignmentModel.id).where(
                and_(
                    AssignmentModel.project_id == project_id,
                    AssignmentModel.user_id == user_id,
                )
            )
        )
        return result.scalar_one_or_none() is not None

    async def assign_user(
        self,
        project_id: int,
        user_id: int,
        assigned_by: int,
    ) -> AssignmentModel:
        """Assign user to project.

        Args:
            project_id: Project ID
            user_id: User to assign
            assigned_by: User performing assignment

        Returns:
            Created assignment
        """
        assignment = AssignmentModel(
            project_id=project_id,
            user_id=user_id,
            assigned_by=assigned_by,
        )
        self.session.add(assignment)
        await self.session.flush()
        await self.session.refresh(assignment)
        return assignment

    async def unassign_user(self, project_id: int, user_id: int) -> bool:
        """Remove user from project.

        Args:
            project_id: Project ID
            user_id: User to remove

        Returns:
            True if removed
        """
        from sqlalchemy import delete

        result = await self.session.execute(
            delete(AssignmentModel).where(
                and_(
                    AssignmentModel.project_id == project_id,
                    AssignmentModel.user_id == user_id,
                )
            )
        )
        await self.session.flush()
        return result.rowcount > 0

    async def get_assigned_users(self, project_id: int) -> list[UserModel]:
        """Get all users assigned to project.

        Args:
            project_id: Project ID

        Returns:
            List of assigned users
        """
        result = await self.session.execute(
            select(UserModel)
            .join(AssignmentModel, AssignmentModel.user_id == UserModel.id)
            .where(AssignmentModel.project_id == project_id)
        )
        return list(result.scalars().all())

    async def get_user_projects(self, user_id: int) -> list[ProjectModel]:
        """Get all projects assigned to user.

        Args:
            user_id: User ID

        Returns:
            List of assigned projects
        """
        result = await self.session.execute(
            select(ProjectModel)
            .join(AssignmentModel, AssignmentModel.project_id == ProjectModel.id)
            .where(AssignmentModel.user_id == user_id)
        )
        return list(result.scalars().all())

    async def can_user_access(
        self,
        project_id: int,
        user_id: int,
        user_role: str,
    ) -> bool:
        """Check if user can access project.

        Args:
            project_id: Project ID
            user_id: User ID
            user_role: User's role

        Returns:
            True if user can access
        """
        if user_role == "manager":
            return True

        project = await self.get_by_id(project_id)
        if not project:
            return False

        if project.visibility == "public":
            return True

        if user_role == "commercial":
            return await self.is_user_assigned(project_id, user_id)

        return False

    async def update_lot_counts(
        self,
        project_id: int,
        total_lots: int | None = None,
        sold_lots: int | None = None,
    ) -> None:
        """Update project lot counts.

        Args:
            project_id: Project ID
            total_lots: New total lots count
            sold_lots: New sold lots count
        """
        update_data = {}
        if total_lots is not None:
            update_data["total_lots"] = total_lots
        if sold_lots is not None:
            update_data["sold_lots"] = sold_lots

        if update_data:
            await self.update(project_id, **update_data)
