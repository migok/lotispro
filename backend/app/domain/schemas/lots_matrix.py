"""Schemas for the project lots matrix (lot type x status)."""

from app.domain.schemas.common import BaseSchema


class LotsMatrixRow(BaseSchema):
    """One lot type of the matrix; ``type_lot`` is ``None`` for untyped lots."""

    type_lot: str | None
    counts: dict[str, int]
    total: int


class LotsMatrixResponse(BaseSchema):
    """Lot counts by type and status; ``counts`` and ``totals`` have one key per
    entry of ``statuses``."""

    statuses: list[str]
    rows: list[LotsMatrixRow]
    totals: dict[str, int]
    grand_total: int
