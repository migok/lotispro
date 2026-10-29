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
    client: AsyncClient,
    headers: dict[str, str],
    lot_id: int,
    client_id: int,
    **extra: Any,
) -> int:
    response = await _post(
        client,
        headers,
        lot_id,
        "start-option",
        {
            "client_id": client_id,
            "expiration_date": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
            **extra,
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
                gap_due_timing="fin",
                payment_plan={"deposit_count": 1, "balance_count": 1},
            ),
        )

        assert response.status_code == 200, response.json()
        body = response.json()
        assert body["id"] == reservation_id
        assert body["client_id"] == buyer.id
        assert body["guarantee_amount"] == 50000
        assert body["sale_price"] == 450000
        assert body["agreed_total_price"] == 500000
        assert body["gap_amount"] == 50000
        assert body["gap_due_timing"] == "fin"
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
        assert response.json()["message"] == (
            "Action « Engager la réservation depuis l'option » impossible depuis "
            "le statut « Disponible »."
        )
        assert response.json()["details"][0]["rule"] == "invalid_lot_status"
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


PLAN = {"deposit_count": 1, "balance_count": 1}


async def _schedule_total(
    client: AsyncClient, headers: dict[str, str], reservation_id: int
) -> float:
    response = await client.get(
        f"/api/payments/schedules/reservation/{reservation_id}", headers=headers
    )
    assert response.status_code == 200, response.json()
    return sum(i["amount"] for i in response.json()["installments"])


@pytest.fixture
async def option_with_deposit(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    commercial: UserModel,
    auth_headers: Headers,
):
    project = await make_project(
        db_session, manager, enabled_optional_statuses=["option"]
    )
    lot = await make_lot(db_session, project, status="available")
    buyer = await make_client(db_session, manager, email=None)
    reservation_id = await _start_option(
        client,
        auth_headers(commercial),
        lot.id,
        buyer.id,
        deposit=100000,
        notes="note option",
    )
    return lot, reservation_id


class TestOptionDeposit:
    async def test_deposit_action_required_when_option_has_deposit(
        self, client, db_session, commercial, auth_headers, option_with_deposit
    ) -> None:
        lot, _ = option_with_deposit

        response = await _post(
            client, auth_headers(commercial), lot.id, "option-engage", _engage_payload()
        )

        assert response.status_code == 400
        assert response.json()["message"] == (
            "Indiquez si l'acompte de l'option est déduit ou remboursé."
        )
        assert response.json()["details"][0]["rule"] == "deposit_action_required"
        await db_session.refresh(lot)
        assert lot.status == "option"

    async def test_deduct_removes_deposit_from_schedule_base(
        self, client, db_session, commercial, auth_headers, option_with_deposit
    ) -> None:
        lot, reservation_id = option_with_deposit
        headers = auth_headers(commercial)

        response = await _post(
            client,
            headers,
            lot.id,
            "option-engage",
            _engage_payload(
                sale_price=450000, deposit_action="deduct", payment_plan=PLAN
            ),
        )

        assert response.status_code == 200, response.json()
        assert response.json()["deposit_refund_amount"] is None
        # 500000 agreed - 50000 first payment - 100000 option deposit kept
        assert await _schedule_total(client, headers, reservation_id) == 350000

    async def test_refund_records_fields_and_schedules_full_price(
        self, client, db_session, commercial, auth_headers, option_with_deposit
    ) -> None:
        lot, reservation_id = option_with_deposit
        headers = auth_headers(commercial)

        response = await _post(
            client,
            headers,
            lot.id,
            "option-engage",
            _engage_payload(
                sale_price=450000,
                deposit_action="refund",
                refund_amount=100000,
                refund_date="2026-10-20",
                refund_payment_type=PAYMENT,
                payment_plan=PLAN,
            ),
        )

        assert response.status_code == 200, response.json()
        body = response.json()
        assert body["deposit_refund_amount"] == 100000
        assert body["deposit_refund_date"] == "2026-10-20"
        assert body["deposit_refund_payment_type"] == PAYMENT
        # 500000 agreed - 50000 first payment (refunded deposit not deducted)
        assert await _schedule_total(client, headers, reservation_id) == 450000

    async def test_expiration_and_notes(
        self, client, db_session, commercial, auth_headers, option_with_deposit
    ) -> None:
        lot, _ = option_with_deposit

        response = await _post(
            client,
            auth_headers(commercial),
            lot.id,
            "option-engage",
            _engage_payload(deposit_action="deduct", notes="nouvelle note"),
        )

        assert response.status_code == 200, response.json()
        body = response.json()
        assert body["notes"] == "note option\nnouvelle note"
        expiration = datetime.fromisoformat(body["expiration_date"])
        if expiration.tzinfo is None:
            expiration = expiration.replace(tzinfo=UTC)
        delta = expiration - datetime.now(UTC)
        assert timedelta(days=364) < delta < timedelta(days=366)

    async def test_option_without_deposit_needs_no_action(
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
            _engage_payload(sale_price=450000, payment_plan=PLAN),
        )

        assert response.status_code == 200, response.json()
        # 500000 agreed - 50000 first payment
        assert await _schedule_total(client, headers, reservation_id) == 450000
