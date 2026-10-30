"""GET /api/dashboard/stats with a period: flow and state KPIs (E6-T1)."""

from calendar import monthrange
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.dashboard_period import Period, business_today, business_tz
from app.infrastructure.database.models import (
    ClientModel,
    LotModel,
    LotStatusHistoryModel,
    ProjectModel,
    ReservationModel,
    UserModel,
)
from app.services.dashboard_period_service import DashboardPeriodService, SoldLot
from app.tests.factories import (
    make_client,
    make_lot,
    make_project,
    make_reservation,
    make_reservation_payment,
    make_status_change,
)

pytestmark = pytest.mark.integration

Headers = Callable[[UserModel], dict[str, str]]

URL = "/api/dashboard/stats"
OCTOBER = ("2026-10-01", "2026-10-31")
EMPTY_FLOW = {
    "lots_vendus": 0,
    "ca": 0.0,
    "reservations_creees": 0,
    "taux_conversion": 0.0,
    "encaissements": 0.0,
}
NULL_VARIATIONS = dict.fromkeys(EMPTY_FLOW)


def _local(
    year: int, month: int, day: int, hour: int = 12, minute: int = 0
) -> datetime:
    """UTC instant of a Casablanca local time (never hard-code the offset)."""
    return datetime(year, month, day, hour, minute, tzinfo=business_tz()).astimezone(
        UTC
    )


async def _stats(
    client: AsyncClient,
    headers: dict[str, str],
    project_id: int | None,
    period: tuple[str, str] | None = OCTOBER,
    **extra: Any,
) -> dict[str, Any]:
    params: dict[str, Any] = {**extra}
    if project_id is not None:
        params["project_id"] = project_id
    if period is not None:
        params["date_from"], params["date_to"] = period
    response = await client.get(URL, headers=headers, params=params)
    assert response.status_code == 200, response.text
    return response.json()


async def _engaged(
    db: AsyncSession,
    project: ProjectModel,
    client_: ClientModel,
    on: datetime,
    *,
    user: UserModel | None = None,
    agreed: float | None = 500000.0,
    lot_price: float | None = 500000.0,
    reservation_date: datetime | None = None,
    **lot_fields: Any,
) -> tuple[LotModel, ReservationModel]:
    """A lot engaged at ``on`` through a reservation created at ``reservation_date``."""
    lot = await make_lot(
        db, project, status="reservation_engagee", price=lot_price, **lot_fields
    )
    reservation = await make_reservation(
        db,
        lot,
        client_,
        user=user,
        reservation_date=reservation_date or on,
        agreed_total_price=agreed,
    )
    await make_status_change(
        db, lot, "reservation_engagee", on, reservation=reservation
    )
    return lot, reservation


async def test_lots_vendus_and_ca_use_engagement_date_and_agreed_price(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
) -> None:
    project = await make_project(db_session, manager)
    buyer = await make_client(db_session, manager)
    lot_a = await make_lot(db_session, project, status="reservation_engagee")
    reservation_a = await make_reservation(
        db_session,
        lot_a,
        buyer,
        reservation_date=_local(2026, 9, 20),
        agreed_total_price=600000.0,
        sale_price=450000.0,
    )
    await make_status_change(
        db_session,
        lot_a,
        "reservation_engagee",
        _local(2026, 10, 5),
        reservation=reservation_a,
    )
    await _engaged(db_session, project, buyer, _local(2026, 9, 28), agreed=700000.0)

    body = await _stats(client, auth_headers(manager), project.id)

    assert body["flow"]["lots_vendus"] == 1
    assert body["flow"]["ca"] == 600000.0
    assert body["period"] == {"date_from": "2026-10-01", "date_to": "2026-10-31"}


async def test_legacy_reservation_falls_back_to_lot_price(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
) -> None:
    buyer = await make_client(db_session, manager)
    priced = await make_project(db_session, manager)
    unpriced = await make_project(db_session, manager)
    await _engaged(
        db_session, priced, buyer, _local(2026, 10, 5), agreed=None, lot_price=500000.0
    )
    await _engaged(
        db_session, unpriced, buyer, _local(2026, 10, 5), agreed=None, lot_price=None
    )

    priced_body = await _stats(client, auth_headers(manager), priced.id)
    unpriced_body = await _stats(client, auth_headers(manager), unpriced.id)

    assert priced_body["flow"]["ca"] == 500000.0
    assert unpriced_body["flow"]["lots_vendus"] == 1
    assert unpriced_body["flow"]["ca"] == 0.0


async def test_engagement_counted_once_per_reservation(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
) -> None:
    project = await make_project(db_session, manager)
    buyer = await make_client(db_session, manager)
    lot, reservation = await _engaged(
        db_session, project, buyer, _local(2026, 10, 5), agreed=600000.0
    )
    # Blocked, unblocked, engaged again: still one sale.
    await make_status_change(
        db_session,
        lot,
        "blocked",
        _local(2026, 10, 10),
        from_status="reservation_engagee",
        reservation=reservation,
    )
    await make_status_change(
        db_session,
        lot,
        "available",
        _local(2026, 10, 12),
        from_status="blocked",
        reservation=reservation,
    )
    await make_status_change(
        db_session,
        lot,
        "reservation_engagee",
        _local(2026, 10, 15),
        reservation=reservation,
    )

    body = await _stats(client, auth_headers(manager), project.id)

    assert body["flow"]["lots_vendus"] == 1
    assert body["flow"]["ca"] == 600000.0


async def test_flow_bounds_use_business_time_zone(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
) -> None:
    project = await make_project(db_session, manager)
    buyer = await make_client(db_session, manager)
    # 23:30 local on date_to and 00:30 local on date_from count; 00:30 the day
    # after date_to does not (reservation_date follows the same bounds).
    await _engaged(db_session, project, buyer, _local(2026, 10, 31, 23, 30))
    await _engaged(db_session, project, buyer, _local(2026, 10, 1, 0, 30))
    await _engaged(db_session, project, buyer, _local(2026, 11, 1, 0, 30))

    # Same edges in June, when Casablanca is UTC+1 (the installed tz database
    # puts it at UTC+0 from late September 2026, so October alone cannot tell
    # business time from UTC).
    june = await make_project(db_session, manager)
    late_june = _local(2026, 6, 30, 23, 30)
    early_june = _local(2026, 6, 1, 0, 30)
    early_july = _local(2026, 7, 1, 0, 30)
    assert early_june.date() == date(2026, 5, 31), "premise: UTC+1 in June"
    for moment, agreed in ((late_june, 100.0), (early_june, 10.0), (early_july, 1.0)):
        await _engaged(db_session, june, buyer, moment, agreed=agreed)

    body = await _stats(client, auth_headers(manager), project.id)
    june_body = await _stats(
        client, auth_headers(manager), june.id, ("2026-06-01", "2026-06-30")
    )

    assert body["flow"]["lots_vendus"] == 2
    assert body["flow"]["ca"] == 1000000.0
    assert body["flow"]["reservations_creees"] == 2
    assert june_body["flow"]["lots_vendus"] == 2
    assert june_body["flow"]["ca"] == 110.0
    assert june_body["flow"]["reservations_creees"] == 2


async def test_reservations_creees_and_conversion(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
) -> None:
    buyer = await make_client(db_session, manager)
    # 4 created in October, 1 of them engaged → 25 %.
    quarter = await make_project(db_session, manager)
    await _engaged(db_session, quarter, buyer, _local(2026, 10, 10))
    for day in (2, 3, 4):
        lot = await make_lot(db_session, quarter, status="option")
        await make_reservation(
            db_session, lot, buyer, reservation_date=_local(2026, 10, day)
        )
    # 1 created and 2 engaged (one created in September) → 200 %.
    double = await make_project(db_session, manager)
    await _engaged(db_session, double, buyer, _local(2026, 10, 10))
    await _engaged(
        db_session,
        double,
        buyer,
        _local(2026, 10, 12),
        reservation_date=_local(2026, 9, 20),
    )
    # Nothing created → 0, no division error.
    none_created = await make_project(db_session, manager)
    await _engaged(
        db_session,
        none_created,
        buyer,
        _local(2026, 10, 12),
        reservation_date=_local(2026, 9, 20),
    )

    quarter_flow = (await _stats(client, auth_headers(manager), quarter.id))["flow"]
    double_flow = (await _stats(client, auth_headers(manager), double.id))["flow"]
    none_flow = (await _stats(client, auth_headers(manager), none_created.id))["flow"]

    assert quarter_flow["reservations_creees"] == 4
    assert quarter_flow["taux_conversion"] == 25.0
    assert double_flow["reservations_creees"] == 1
    assert double_flow["taux_conversion"] == 200.0
    assert none_flow["reservations_creees"] == 0
    assert none_flow["lots_vendus"] == 1
    assert none_flow["taux_conversion"] == 0


async def test_encaissements_by_paid_on(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
) -> None:
    project = await make_project(db_session, manager)
    buyer = await make_client(db_session, manager)
    _, reservation = await _engaged(db_session, project, buyer, _local(2026, 9, 5))
    await make_reservation_payment(db_session, reservation, 7.0, date(2026, 9, 30))
    await make_reservation_payment(db_session, reservation, 100.0, date(2026, 10, 1))
    await make_reservation_payment(db_session, reservation, 250.5, date(2026, 10, 31))
    await make_reservation_payment(db_session, reservation, 1000.0, date(2026, 11, 1))

    body = await _stats(client, auth_headers(manager), project.id)

    assert body["flow"]["encaissements"] == 350.5


async def test_user_filter_applies_to_flows_not_state(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    commercial: UserModel,
    other_commercial: UserModel,
    auth_headers: Headers,
) -> None:
    project = await make_project(db_session, manager)
    buyer = await make_client(db_session, manager)
    created = _local(2026, 9, 1)
    _, mine = await _engaged(
        db_session,
        project,
        buyer,
        _local(2026, 10, 5),
        user=commercial,
        agreed=600000.0,
        created_at=created,
    )
    _, theirs = await _engaged(
        db_session,
        project,
        buyer,
        _local(2026, 10, 6),
        user=other_commercial,
        agreed=400000.0,
        created_at=created,
    )
    await make_reservation_payment(db_session, mine, 100.0, date(2026, 10, 7))
    await make_reservation_payment(db_session, theirs, 50.0, date(2026, 10, 8))
    for status in ("available", "available", "option"):
        await make_lot(db_session, project, status=status, created_at=created)

    everyone = await _stats(client, auth_headers(manager), project.id)
    filtered = await _stats(
        client, auth_headers(manager), project.id, user_id=commercial.id
    )

    assert everyone["flow"]["lots_vendus"] == 2
    assert filtered["flow"] == {
        "lots_vendus": 1,
        "ca": 600000.0,
        "reservations_creees": 1,
        "taux_conversion": 100.0,
        "encaissements": 100.0,
    }
    assert filtered["state"] == everyone["state"] == {"available": 2, "option": 1}


async def test_state_at_date_to_from_history(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
) -> None:
    project = await make_project(db_session, manager)
    created = _local(2026, 9, 1)
    # Option today, but only since 2 November → available on 31 October.
    later_option = await make_lot(
        db_session, project, status="option", created_at=created
    )
    await make_status_change(db_session, later_option, "option", _local(2026, 11, 2))
    # Created after date_to → not counted.
    await make_lot(
        db_session, project, status="available", created_at=_local(2026, 11, 5)
    )
    # No history → its current status.
    await make_lot(db_session, project, status="option", created_at=created)
    # Option on 10 October, engaged on 3 November → option on 31 October.
    engaged_later = await make_lot(
        db_session, project, status="reservation_engagee", created_at=created
    )
    await make_status_change(db_session, engaged_later, "option", _local(2026, 10, 10))
    await make_status_change(
        db_session,
        engaged_later,
        "reservation_engagee",
        _local(2026, 11, 3),
        from_status="option",
    )

    body = await _stats(client, auth_headers(manager), project.id)

    assert body["state"] == {"available": 1, "option": 2}


async def test_previous_period_and_variations(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
) -> None:
    project = await make_project(db_session, manager)
    buyer = await make_client(db_session, manager)
    # History starts before the previous period, so its flows are available.
    early = await make_lot(db_session, project, status="option")
    await make_status_change(db_session, early, "option", _local(2026, 8, 1))
    await _engaged(db_session, project, buyer, _local(2026, 10, 5))
    await _engaged(db_session, project, buyer, _local(2026, 10, 6))
    await _engaged(db_session, project, buyer, _local(2026, 9, 15))

    body = await _stats(client, auth_headers(manager), project.id)

    assert body["previous_period"] == {
        "date_from": "2026-08-31",
        "date_to": "2026-09-30",
    }
    assert body["flow_previous"]["lots_vendus"] == 1
    assert body["flow_previous"]["ca"] == 500000.0
    assert body["variations"]["lots_vendus"] == 100.0
    assert body["variations"]["ca"] == 100.0
    assert body["variations"]["reservations_creees"] == 100.0
    assert body["variations"]["encaissements"] is None


async def test_empty_period_returns_zeros_and_null_variations(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
) -> None:
    empty = await make_project(db_session, manager)
    empty_body = await _stats(client, auth_headers(manager), empty.id)

    assert empty_body["flow"] == EMPTY_FLOW
    assert empty_body["flow_previous"] == EMPTY_FLOW
    assert empty_body["variations"] == NULL_VARIATIONS
    assert empty_body["state"] == {"available": 0, "option": 0}

    # Previous value 0 (history available) → variation null, not a division error.
    busy = await make_project(db_session, manager)
    buyer = await make_client(db_session, manager)
    early = await make_lot(db_session, busy, status="option")
    await make_status_change(db_session, early, "option", _local(2026, 8, 1))
    await _engaged(db_session, busy, buyer, _local(2026, 10, 5))

    busy_body = await _stats(client, auth_headers(manager), busy.id)

    assert busy_body["flow"]["lots_vendus"] == 1
    assert busy_body["flow_previous"] == EMPTY_FLOW
    assert busy_body["variations"] == NULL_VARIATIONS


async def test_availability_flags_from_history_start(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
) -> None:
    project = await make_project(db_session, manager)
    buyer = await make_client(db_session, manager)
    await _engaged(db_session, project, buyer, _local(2026, 10, 10, 0, 30))
    await _engaged(db_session, project, buyer, _local(2026, 10, 20))
    headers = auth_headers(manager)

    october = await _stats(client, headers, project.id)
    from_start = await _stats(client, headers, project.id, ("2026-10-10", "2026-10-31"))
    before_start = await _stats(
        client, headers, project.id, ("2026-10-01", "2026-10-05")
    )

    assert october["history_start"] == "2026-10-10"
    assert october["flow_kpis_available"] is False
    assert october["state_kpis_available"] is True
    # Previous period (September) lies before the history: no variation.
    assert october["variations"] == NULL_VARIATIONS
    assert from_start["flow_kpis_available"] is True
    assert before_start["state_kpis_available"] is False
    assert before_start["flow_kpis_available"] is False

    await db_session.execute(delete(LotStatusHistoryModel))
    await db_session.commit()
    no_history = await _stats(client, headers, project.id, ("2026-10-01", "2026-10-05"))

    assert no_history["history_start"] is None
    assert no_history["flow_kpis_available"] is True
    assert no_history["state_kpis_available"] is True


async def test_default_period_is_current_month(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
) -> None:
    project = await make_project(db_session, manager)
    today = business_today()
    first = today.replace(day=1)
    last = today.replace(day=monthrange(today.year, today.month)[1])

    body = await _stats(client, auth_headers(manager), project.id, period=None)

    assert body["period"] == {
        "date_from": first.isoformat(),
        "date_to": last.isoformat(),
    }
    assert body["previous_period"]["date_to"] == (first - timedelta(days=1)).isoformat()


@pytest.mark.parametrize(
    ("params", "message"),
    [
        (
            {"date_from": "2026-10-31", "date_to": "2026-10-01"},
            "La date de début doit être antérieure ou égale à la date de fin.",
        ),
        (
            {"date_from": "2026-10-01"},
            "Indiquez la date de début et la date de fin.",
        ),
        (
            {"date_to": "2026-10-31"},
            "Indiquez la date de début et la date de fin.",
        ),
        (
            {
                "date_from": "2020-01-01",
                "date_to": (date(2020, 1, 1) + timedelta(days=3660)).isoformat(),
            },
            "La période ne peut pas dépasser 10 ans.",
        ),
    ],
)
async def test_invalid_periods_return_422(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
    params: dict[str, str],
    message: str,
) -> None:
    response = await client.get(URL, headers=auth_headers(manager), params=params)

    assert response.status_code == 422, response.text
    assert response.json()["message"] == message


async def test_existing_fields_unchanged(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
) -> None:
    project = await make_project(db_session, manager)
    await make_lot(db_session, project, status="available", price=300000.0)

    body = await _stats(client, auth_headers(manager), project.id)

    assert body["counts"]["total"] == 1
    assert body["counts"]["available"] == 1
    assert body["ca_realise"] == 0
    assert body["ca_total"] == 300000.0


async def test_sold_lots_rows(
    db_session: AsyncSession,
    manager: UserModel,
    commercial: UserModel,
) -> None:
    project = await make_project(db_session, manager)
    buyer = await make_client(db_session, manager, name="Alami")
    late_lot, late = await _engaged(
        db_session,
        project,
        buyer,
        _local(2026, 10, 20),
        user=commercial,
        agreed=650000.0,
        numero="B-2",
        zone="Nord",
        type_lot="Villa",
        surface=250.0,
    )
    _, early = await _engaged(
        db_session, project, buyer, _local(2026, 10, 3), agreed=None, numero="A-1"
    )
    # Engagement row without a reservation: ignored.
    orphan = await make_lot(db_session, project, status="reservation_engagee")
    await make_status_change(
        db_session, orphan, "reservation_engagee", _local(2026, 10, 4)
    )

    rows = await DashboardPeriodService(db_session).sold_lots(
        Period(date(2026, 10, 1), date(2026, 10, 31)), project.id, None
    )

    assert [row.reservation_id for row in rows] == [early.id, late.id]
    assert rows[1] == SoldLot(
        reservation_id=late.id,
        lot_id=late_lot.id,
        lot_numero="B-2",
        zone="Nord",
        type_lot="Villa",
        surface=250.0,
        client_name="Alami",
        commercial_name=commercial.name,
        engaged_on=date(2026, 10, 20),
        agreed_total_price=650000.0,
        deed_price=None,
        lot_status="reservation_engagee",
    )
    assert rows[0].agreed_total_price == 500000.0
    assert rows[0].commercial_name is None
