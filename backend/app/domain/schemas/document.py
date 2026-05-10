"""Schemas for lot document management."""

from datetime import datetime

from app.domain.schemas.common import BaseSchema


class LotDocumentResponse(BaseSchema):
    """Response schema for a lot document."""

    id: int
    lot_id: int
    reservation_id: int | None = None
    filename: str
    content_type: str
    uploaded_by_user_id: int | None = None
    created_at: datetime
