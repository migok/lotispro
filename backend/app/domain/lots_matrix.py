"""Lots matrix: lot counts by type and status (pure, no database access)."""

from collections import defaultdict
from collections.abc import Iterable

from app.domain.lot_workflow import ALL_STATUSES, is_status_enabled
from app.domain.schemas.lots_matrix import LotsMatrixResponse, LotsMatrixRow


def _sort_key(type_lot: str) -> tuple[str, str]:
    return (type_lot.casefold(), type_lot)


def build_lots_matrix(
    enabled_optional: Iterable[str],
    counts: Iterable[tuple[str | None, str, int]],
) -> LotsMatrixResponse:
    """Build the matrix from ``(type_lot, status, count)`` triples.

    Columns are the statuses enabled for the project plus any status that
    still holds lots, in pipeline order. Rows are sorted by type (case
    insensitive), untyped lots last.
    """
    enabled = set(enabled_optional)
    by_type: dict[str | None, dict[str, int]] = defaultdict(dict)
    used: set[str] = set()
    for type_lot, status, count in counts:
        by_type[type_lot][status] = by_type[type_lot].get(status, 0) + count
        used.add(status)

    statuses = [s for s in ALL_STATUSES if is_status_enabled(enabled, s) or s in used]

    typed = sorted((t for t in by_type if t is not None), key=_sort_key)
    ordered: list[str | None] = [*typed, *([None] if None in by_type else [])]
    rows = []
    for type_lot in ordered:
        row_counts = {s: by_type[type_lot].get(s, 0) for s in statuses}
        rows.append(
            LotsMatrixRow(
                type_lot=type_lot,
                counts=row_counts,
                total=sum(row_counts.values()),
            )
        )

    totals = {s: sum(row.counts[s] for row in rows) for s in statuses}
    return LotsMatrixResponse(
        statuses=statuses,
        rows=rows,
        totals=totals,
        grand_total=sum(totals.values()),
    )
