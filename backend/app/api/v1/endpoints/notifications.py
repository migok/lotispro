"""Notification history endpoints."""

from fastapi import APIRouter, Query

from app.api.dependencies import CommercialOrManager, NotificationServiceDep
from app.core.exceptions import ValidationError
from app.domain.schemas.notification import NotificationResponse

router = APIRouter()


@router.get(
    "",
    response_model=list[NotificationResponse],
    summary="Historique des notifications",
    description="Notifications d'un client et/ou d'un lot, les plus récentes d'abord.",
)
async def list_notifications(
    current_user: CommercialOrManager,
    notification_service: NotificationServiceDep,
    client_id: int | None = Query(default=None, description="Filtrer par client"),
    lot_id: int | None = Query(default=None, description="Filtrer par lot"),
) -> list[NotificationResponse]:
    """List the notifications of a client and/or a lot (one filter required)."""
    if client_id is None and lot_id is None:
        raise ValidationError("Indiquez client_id ou lot_id.")
    rows = await notification_service.list(client_id, lot_id)
    return [NotificationResponse.model_validate(row) for row in rows]
