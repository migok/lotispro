"""Transition option -> reservation_engagee (only when RAF is disabled)."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any, get_args

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.schemas.reservation import PAYMENT_TYPE
from app.infrastructure.database.models import (
    LotStatusHistoryModel,
    PaymentScheduleModel,
    ReservationModel,
    UserModel,
)
from app.tests.factories import make_client, make_lot, make_project

pytestmark = pytest.mark.integration

PAYMENT = get_args(PAYMENT_TYPE)[0]
Headers = Callable[[UserModel], dict[str, str]]


def _engage_payload(**extra: Any) -> dict[str, Any]:
    return {"guarantee_amount": 50000, "payment_type": PAYMENT, **extra}


async def _post(
    client: AsyncClient,
    headers: dict[str, str],
    lot_id: int,
    name: str,
    json: dict[str, Any],
) -> Response:
    return await client.post(
        f"/api/lots/{lot_id}/transitions/{name}", headers=headers, json=json
    )


async def _start_option(
    client: AsyncClient, headers: dict[str, str], lot_id: int, client_id: int
) -> int:
    response = await _post(
        client,
        headers,
        lot_id,
        "start-option",
        {
            "client_id": client_id,
            "expiration_date": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
        },
    )
    assert response.status_code == 200, response.json()
    return response.json()["id"]


class TestOptionEngage:
    async def test_option_becomes_engaged_keeping_reservation(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        project = await make_project(
            db_session, manager, enabled_optional_statuses=["option"]
        )
        lot = await make_lot(db_session, project, status="available")
        buyer = await make_client(db_session, manager, email=None)
        headers = auth_headers(commercial)
        reservation_id = await _start_option(client, headers, lot.id, buyer.id)

        response = await _post(
            client,
            headers,
            lot.id,
            "option-engage",
            _engage_payload(
                sale_price=450000,
                promotion_paid_timing="fin",
                payment_plan={"deposit_count": 1, "balance_count": 1},
            ),
        )

        assert response.status_code == 200, response.json()
        body = response.json()
        assert body["id"] == reservation_id
        assert body["client_id"] == buyer.id
        assert body["guarantee_amount"] == 50000
        assert body["sale_price"] == 450000
        assert body["promotion_amount"] == 50000
        assert body["promotion_paid_timing"] == "fin"
        await db_session.refresh(lot)
        assert lot.status == "reservation_engagee"
        assert lot.current_reservation_id == reservation_id
        reservation = await db_session.get(ReservationModel, reservation_id)
        assert reservation is not None
        await db_session.refresh(reservation)
        assert reservation.reserved_by_user_id == commercial.id
        schedules = (
            (
                await db_session.execute(
                    select(PaymentScheduleModel).where(
                        PaymentScheduleModel.reservation_id == reservation_id
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(schedules) == 1
        history = (
            (
                await db_session.execute(
                    select(LotStatusHistoryModel)
                    .where(LotStatusHistoryModel.lot_id == lot.id)
                    .order_by(LotStatusHistoryModel.id.desc())
                )
            )
            .scalars()
            .first()
        )
        assert history is not None
        assert (history.from_status, history.to_status, history.transition) == (
            "option",
            "reservation_engagee",
            "option_engage",
        )
        assert history.reservation_id == reservation_id
        assert history.user_id == commercial.id

    async def test_default_project_refuses_with_exact_message(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        project = await make_project(db_session, manager)
        lot = await make_lot(db_session, project, status="available")
        buyer = await make_client(db_session, manager)
        headers = auth_headers(commercial)
        await _start_option(client, headers, lot.id, buyer.id)

        response = await _post(
            client, headers, lot.id, "option-engage", _engage_payload()
        )

        assert response.status_code == 400
        assert response.json()["message"] == (
            "Passez par « Réservation à finaliser » : l'engagement direct depuis "
            "une option n'est possible que si ce statut est désactivé."
        )
        await db_session.refresh(lot)
        assert lot.status == "option"

    async def test_wrong_status_is_refused(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        project = await make_project(
            db_session, manager, enabled_optional_statuses=["option"]
        )
        lot = await make_lot(db_session, project, status="available")

        response = await _post(
            client, auth_headers(commercial), lot.id, "option-engage", _engage_payload()
        )

        assert response.status_code == 400
        await db_session.refresh(lot)
        assert lot.status == "available"

    async def test_other_commercial_is_refused(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        other_commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        project = await make_project(
            db_session, manager, enabled_optional_statuses=["option"]
        )
        lot = await make_lot(db_session, project, status="available")
        buyer = await make_client(db_session, manager)
        await _start_option(client, auth_headers(commercial), lot.id, buyer.id)

        response = await _post(
            client,
            auth_headers(other_commercial),
            lot.id,
            "option-engage",
            _engage_payload(),
        )

        assert response.status_code == 400
        assert response.json()["details"][0]["rule"] == "insufficient_permissions"
        await db_session.refresh(lot)
        assert lot.status == "option"
