"""GET /api/dashboard/performance with a period: bucketed series (E6-T1)."""

from collections.abc import Callable
from datetime import date
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.dashboard_period import INVERTED_MESSAGE
from app.infrastructure.database.models import UserModel
from app.tests.factories import (
    make_client,
    make_lot,
    make_project,
    make_reservation,
    make_reservation_payment,
    make_status_change,
)
from app.tests.integration.test_api.test_dashboard_period import _engaged, _local

pytestmark = pytest.mark.integration

Headers = Callable[[UserModel], dict[str, str]]

URL = "/api/dashboard/performance"
STATS_URL = "/api/dashboard/stats"


async def _get(
    client: AsyncClient,
    headers: dict[str, str],
    url: str,
    project_id: int,
    date_from: str,
    date_to: str,
    **extra: Any,
) -> dict[str, Any]:
    response = await client.get(
        url,
        headers=headers,
        params={
            "project_id": project_id,
            "date_from": date_from,
            "date_to": date_to,
            **extra,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


async def test_series_daily_for_a_month(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
) -> None:
    project = await make_project(db_session, manager)
    buyer = await make_client(db_session, manager)
    lot = await make_lot(db_session, project, status="reservation_engagee")
    reservation = await make_reservation(
        db_session,
        lot,
        buyer,
        reservation_date=_local(2026, 9, 20),
        agreed_total_price=600000.0,
    )
    await make_status_change(
        db_session,
        lot,
        "reservation_engagee",
        _local(2026, 10, 5),
        reservation=reservation,
    )
    await make_reservation_payment(db_session, reservation, 1500.0, date(2026, 10, 7))

    body = await _get(
        client, auth_headers(manager), URL, project.id, "2026-10-01", "2026-10-31"
    )

    assert body["granularity"] == "day"
    assert body["period"] == {"date_from": "2026-10-01", "date_to": "2026-10-31"}
    assert len(body["series"]) == 31
    assert body["series"][0]["key"] == "2026-10-01"
    by_key = {bucket["key"]: bucket for bucket in body["series"]}
    assert by_key["2026-10-05"]["lots_vendus"] == 1
    assert by_key["2026-10-05"]["ca"] == 600000.0
    assert by_key["2026-10-07"]["encaissements"] == 1500.0
    assert by_key["2026-10-06"] == {
        "key": "2026-10-06",
        "lots_vendus": 0,
        "ca": 0.0,
        "reservations_creees": 0,
        "encaissements": 0.0,
    }
    assert "sales_by_period" in body
    assert "average_durations" in body


async def test_series_weekly_for_a_quarter(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
) -> None:
    project = await make_project(db_session, manager)
    buyer = await make_client(db_session, manager)
    await _engaged(db_session, project, buyer, _local(2026, 8, 5))

    body = await _get(
        client, auth_headers(manager), URL, project.id, "2026-07-01", "2026-09-30"
    )

    assert body["granularity"] == "week"
    keys = [bucket["key"] for bucket in body["series"]]
    assert keys[0] == "2026-W27"
    assert keys[-1] == "2026-W40"
    assert len(keys) == len(set(keys))
    assert sum(bucket["lots_vendus"] for bucket in body["series"]) == 1
    august = next(b for b in body["series"] if b["key"] == "2026-W32")
    assert august["lots_vendus"] == 1


async def test_series_monthly_for_a_year(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
) -> None:
    project = await make_project(db_session, manager)
    buyer = await make_client(db_session, manager)
    await _engaged(db_session, project, buyer, _local(2026, 3, 15))

    body = await _get(
        client, auth_headers(manager), URL, project.id, "2026-01-01", "2026-12-31"
    )

    assert body["granularity"] == "month"
    assert [bucket["key"] for bucket in body["series"]] == [
        f"2026-{month:02d}" for month in range(1, 13)
    ]
    march = body["series"][2]
    assert march["lots_vendus"] == 1
    assert march["reservations_creees"] == 1


async def test_series_totals_match_stats(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
) -> None:
    project = await make_project(db_session, manager)
    buyer = await make_client(db_session, manager)
    _, first = await _engaged(
        db_session, project, buyer, _local(2026, 10, 5), agreed=600000.5
    )
    await _engaged(
        db_session,
        project,
        buyer,
        _local(2026, 10, 20),
        agreed=250000.25,
        reservation_date=_local(2026, 9, 25),
    )
    await _engaged(db_session, project, buyer, _local(2026, 11, 2))
    await make_reservation_payment(db_session, first, 100.1, date(2026, 10, 6))
    await make_reservation_payment(db_session, first, 200.2, date(2026, 10, 31))
    await make_reservation_payment(db_session, first, 999.0, date(2026, 11, 1))

    headers = auth_headers(manager)
    performance = await _get(
        client, headers, URL, project.id, "2026-10-01", "2026-10-31"
    )
    stats = await _get(
        client, headers, STATS_URL, project.id, "2026-10-01", "2026-10-31"
    )

    flow = stats["flow"]
    series = performance["series"]
    assert flow["lots_vendus"] == 2
    assert sum(b["lots_vendus"] for b in series) == flow["lots_vendus"]
    assert sum(b["ca"] for b in series) == pytest.approx(flow["ca"])
    assert sum(b["reservations_creees"] for b in series) == flow["reservations_creees"]
    assert sum(b["encaissements"] for b in series) == pytest.approx(
        flow["encaissements"]
    )


async def test_series_user_filter(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
) -> None:
    project = await make_project(db_session, manager)
    buyer = await make_client(db_session, manager)
    await _engaged(db_session, project, buyer, _local(2026, 10, 5))
    await _engaged(db_session, project, buyer, _local(2026, 10, 6), user=manager)

    body = await _get(
        client,
        auth_headers(manager),
        URL,
        project.id,
        "2026-10-01",
        "2026-10-31",
        user_id=manager.id,
    )

    assert sum(b["lots_vendus"] for b in body["series"]) == 1
    assert sum(b["reservations_creees"] for b in body["series"]) == 1


async def test_performance_invalid_period_422(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
) -> None:
    response = await client.get(
        URL,
        headers=auth_headers(manager),
        params={"date_from": "2026-10-31", "date_to": "2026-10-01"},
    )

    assert response.status_code == 422, response.text
    assert response.json()["message"] == INVERTED_MESSAGE
