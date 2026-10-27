"""Lot status history schemas."""

from datetime import datetime

from app.domain.schemas.common import BaseSchema


class LotStatusHistoryResponse(BaseSchema):
    """One status change of a lot."""

    id: int
    lot_id: int
    from_status: str
    to_status: str
    transition: str
    user_id: int | None
    user_name: str | None
    reservation_id: int | None
    changed_at: datetime
