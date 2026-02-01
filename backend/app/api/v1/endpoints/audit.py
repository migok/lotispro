"""Audit log endpoints."""

from fastapi import APIRouter, Query

from app.api.dependencies import AuditServiceDep, ManagerUser

router = APIRouter()


@router.get(
    "",
    summary="Get audit logs",
    description="Get audit log entries with optional filters (manager only)",
)
async def get_audit_logs(
    current_user: ManagerUser,
    audit_service: AuditServiceDep,
    entity_type: str | None = Query(default=None, description="Filter by entity type"),
    entity_id: str | None = Query(default=None, description="Filter by entity ID"),
    user_id: str | None = Query(default=None, description="Filter by user ID"),
    action: str | None = Query(default=None, description="Filter by action"),
    limit: int = Query(default=100, ge=1, le=500, description="Max entries to return"),
    offset: int = Query(default=0, ge=0, description="Pagination offset"),
) -> list[dict]:
    """Get audit log entries.

    Available entity types: lot, reservation, sale, client, project, user
    Available actions: create, update, delete
    """
    return await audit_service.get_logs(
        entity_type=entity_type,
        entity_id=entity_id,
        user_id=user_id,
        action=action,
        limit=limit,
        offset=offset,
    )
