"""Audit log repository implementation."""

from sqlalchemy import select

from app.infrastructure.database.models import AuditLogModel
from app.infrastructure.database.repositories.base import BaseRepository


class AuditLogRepository(BaseRepository[AuditLogModel]):
    """Repository for audit log data access operations."""

    model = AuditLogModel

    async def get_logs(
        self,
        entity_type: str | None = None,
        entity_id: str | None = None,
        user_id: str | None = None,
        action: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[AuditLogModel]:
        """Get audit logs with optional filters.

        Args:
            entity_type: Filter by entity type (e.g., 'lot', 'reservation')
            entity_id: Filter by entity ID
            user_id: Filter by user ID
            action: Filter by action (e.g., 'create', 'update', 'delete')
            limit: Max number of logs to return
            offset: Pagination offset

        Returns:
            List of audit log entries
        """
        query = select(AuditLogModel)

        if entity_type:
            query = query.where(AuditLogModel.entity_type == entity_type)
        if entity_id:
            query = query.where(AuditLogModel.entity_id == entity_id)
        if user_id:
            query = query.where(AuditLogModel.user_id == user_id)
        if action:
            query = query.where(AuditLogModel.action == action)

        query = query.order_by(AuditLogModel.created_at.desc()).offset(offset).limit(limit)

        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def create_log(
        self,
        entity_type: str,
        entity_id: str,
        action: str,
        user_id: str | None = None,
        old_data: str | None = None,
        new_data: str | None = None,
    ) -> AuditLogModel:
        """Create a new audit log entry.

        Args:
            entity_type: Type of entity (e.g., 'lot', 'reservation')
            entity_id: ID of the entity
            action: Action performed (e.g., 'create', 'update', 'delete')
            user_id: ID of user who performed the action
            old_data: JSON string of old data (for updates)
            new_data: JSON string of new data

        Returns:
            Created audit log entry
        """
        return await self.create(
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            user_id=user_id,
            old_data=old_data,
            new_data=new_data,
        )
