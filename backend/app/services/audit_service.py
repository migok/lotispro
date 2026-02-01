"""Audit service - Audit log operations."""

import json
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.infrastructure.database.repositories import AuditLogRepository

logger = get_logger(__name__)


class AuditService:
    """Service for audit log operations."""

    def __init__(self, session: AsyncSession):
        """Initialize with database session."""
        self.session = session
        self.audit_repo = AuditLogRepository(session)

    async def get_logs(
        self,
        entity_type: str | None = None,
        entity_id: str | None = None,
        user_id: str | None = None,
        action: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict]:
        """Get audit logs with optional filters.

        Args:
            entity_type: Filter by entity type
            entity_id: Filter by entity ID
            user_id: Filter by user ID
            action: Filter by action
            limit: Max number of logs
            offset: Pagination offset

        Returns:
            List of audit log entries
        """
        logs = await self.audit_repo.get_logs(
            entity_type=entity_type,
            entity_id=entity_id,
            user_id=user_id,
            action=action,
            limit=limit,
            offset=offset,
        )

        return [
            {
                "id": log.id,
                "entity_type": log.entity_type,
                "entity_id": log.entity_id,
                "action": log.action,
                "user_id": log.user_id,
                "old_data": json.loads(log.old_data) if log.old_data else None,
                "new_data": json.loads(log.new_data) if log.new_data else None,
                "created_at": log.created_at.isoformat(),
            }
            for log in logs
        ]

    async def log_action(
        self,
        entity_type: str,
        entity_id: int | str,
        action: str,
        user_id: int | str | None = None,
        old_data: dict[str, Any] | None = None,
        new_data: dict[str, Any] | None = None,
    ) -> None:
        """Log an action to the audit log.

        Args:
            entity_type: Type of entity (lot, reservation, sale, etc.)
            entity_id: ID of the entity
            action: Action performed (create, update, delete)
            user_id: ID of user who performed the action
            old_data: Previous state data
            new_data: New state data
        """
        old_data_str = json.dumps(old_data) if old_data else None
        new_data_str = json.dumps(new_data) if new_data else None

        await self.audit_repo.create_log(
            entity_type=entity_type,
            entity_id=str(entity_id),
            action=action,
            user_id=str(user_id) if user_id else None,
            old_data=old_data_str,
            new_data=new_data_str,
        )

        logger.debug(
            "Audit log created",
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            user_id=user_id,
        )
