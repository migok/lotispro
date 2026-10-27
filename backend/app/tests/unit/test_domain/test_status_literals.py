"""Every hard-coded lot status list follows ``lot_workflow.ALL_STATUSES``."""

import re
from typing import get_args

from sqlalchemy import CheckConstraint

from app.domain.lot_workflow import ALL_STATUSES, EDL_STATUSES, SOLD_STATUSES
from app.domain.schemas.dashboard import DashboardCounts
from app.domain.schemas.lot import (
    ACTIVE_LOT_STATUSES,
    LOT_STATUS,
    NON_DELETABLE_STATUSES,
)
from app.infrastructure.database.models import LotModel


def test_lot_status_literal_is_all_statuses() -> None:
    assert get_args(LOT_STATUS) == ALL_STATUSES


def test_active_and_non_deletable_statuses_include_edl() -> None:
    for status in EDL_STATUSES:
        assert status in ACTIVE_LOT_STATUSES
        assert status in NON_DELETABLE_STATUSES


def test_dashboard_counts_has_a_field_per_status() -> None:
    assert set(ALL_STATUSES) <= set(DashboardCounts.model_fields)


def test_lots_check_constraint_lists_all_statuses() -> None:
    [constraint] = [
        c
        for c in LotModel.__table__.constraints
        if isinstance(c, CheckConstraint) and c.name == "valid_lot_status"
    ]
    statuses = re.findall(r"'([a-z_]+)'", str(constraint.sqltext))
    assert tuple(statuses) == ALL_STATUSES


def test_sold_statuses_cover_edl() -> None:
    assert set(EDL_STATUSES) <= set(SOLD_STATUSES)
