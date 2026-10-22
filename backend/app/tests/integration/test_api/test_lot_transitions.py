"""Characterization tests for the lot status workflow.

These tests pin the CURRENT behaviour of ``POST /api/lots/{id}/transitions/*``
so later epics can change the workflow knowingly. They describe what the code
does today, not what it should do: suspicious behaviour is recorded in
``docs/AVANCEMENT.md`` (section "Anomalies constatees"), never "fixed" here.

Intermediate states are reached through the API itself (not by writing the
status in the database) so side effects (reservation, closing date...) are
pinned as well.

The API and the tests share one ``db_session`` (``expire_on_commit=False``),
so every ORM object held by a test is refreshed before being asserted on.
"""

from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any, get_args

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.schemas.reservation import PAYMENT_TYPE
from app.infrastructure.database.models import (
    ClientModel,
    LotModel,
    ReservationModel,
    UserModel,
)
from app.tests.factories import make_client, make_lot, make_notaire, make_project

pytestmark = pytest.mark.integration

PAYMENT = get_args(PAYMENT_TYPE)[0]

Headers = Callable[[UserModel], dict[str, str]]


async def post_transition(
    client: AsyncClient,
    headers: dict[str, str],
    lot_id: int,
    name: str,
    json: dict | None = None,
    params: dict | None = None,
) -> Response:
    """Call ``POST /api/lots/{lot_id}/transitions/{name}``."""
    return await client.post(
        f"/api/lots/{lot_id}/transitions/{name}",
        headers=headers,
        json=json,
        params=params,
    )


def _in_days(days: int) -> str:
    return (datetime.now(UTC) + timedelta(days=days)).isoformat()


def _today() -> str:
    return date.today().isoformat()


def _option_payload(client_id: int) -> dict[str, Any]:
    return {"client_id": client_id, "expiration_date": _in_days(7)}


def _direct_reservation_payload(client_id: int) -> dict[str, Any]:
    return {
        "client_id": client_id,
        "guarantee_amount": 10000,
        "payment_type": PAYMENT,
        "finalization_date": _in_days(15),
    }


def _to_reservation_payload() -> dict[str, Any]:
    return {
        "guarantee_amount": 10000,
        "payment_type": PAYMENT,
        "finalization_date": _in_days(15),
    }


def _direct_engage_payload(client_id: int) -> dict[str, Any]:
    return {"client_id": client_id, "guarantee_amount": 50000, "payment_type": PAYMENT}


async def _reservation_of(db_session: AsyncSession, lot: LotModel) -> ReservationModel:
    """The reservation linked to ``lot`` (the only one the tests create)."""
    result = await db_session.execute(
        select(ReservationModel).where(ReservationModel.lot_id == lot.id)
    )
    reservation = result.scalar_one()
    await db_session.refresh(reservation)
    return reservation


@pytest.fixture
async def lot(db_session: AsyncSession, manager: UserModel) -> LotModel:
    """An ``available`` lot with price and surface."""
    project = await make_project(db_session, manager)
    return await make_lot(db_session, project, status="available")


@pytest.fixture
async def buyer(db_session: AsyncSession, manager: UserModel) -> ClientModel:
    return await make_client(db_session, manager)


class TestActivate:
    async def test_activate_creation_to_available(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        project = await make_project(db_session, manager)
        creation_lot = await make_lot(db_session, project, status="creation")

        response = await post_transition(
            client, auth_headers(commercial), creation_lot.id, "activate"
        )

        assert response.status_code == 200
        assert response.json()["status"] == "available"
        await db_session.refresh(creation_lot)
        assert creation_lot.status == "available"

    async def test_activate_refused_without_price(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        project = await make_project(db_session, manager)
        creation_lot = await make_lot(
            db_session, project, status="creation", price=None
        )

        response = await post_transition(
            client, auth_headers(commercial), creation_lot.id, "activate"
        )

        assert response.status_code == 400
        assert "Prix" in response.json()["message"]
        await db_session.refresh(creation_lot)
        assert creation_lot.status == "creation"


class TestOption:
    async def test_start_option_available_to_option(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        lot: LotModel,
        buyer: ClientModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        response = await post_transition(
            client,
            auth_headers(commercial),
            lot.id,
            "start-option",
            _option_payload(buyer.id),
        )

        assert response.status_code == 200
        assert response.json()["status"] == "active"
        await db_session.refresh(lot)
        assert lot.status == "option"
        reservation = await _reservation_of(db_session, lot)
        assert lot.current_reservation_id == reservation.id
        assert reservation.status == "active"
        assert reservation.client_id == buyer.id
        assert reservation.reserved_by_user_id == commercial.id

    async def test_cancel_option_back_to_available(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        lot: LotModel,
        buyer: ClientModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        await post_transition(
            client, headers, lot.id, "start-option", _option_payload(buyer.id)
        )

        response = await post_transition(client, headers, lot.id, "cancel-option")

        assert response.status_code == 200
        assert response.json()["status"] == "available"
        await db_session.refresh(lot)
        assert lot.status == "available"
        assert lot.current_reservation_id is None
        reservation = await _reservation_of(db_session, lot)
        assert reservation.status == "released"

    async def test_extend_option_keeps_status(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        lot: LotModel,
        buyer: ClientModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        await post_transition(
            client, headers, lot.id, "start-option", _option_payload(buyer.id)
        )
        reservation = await _reservation_of(db_session, lot)
        previous_expiration = reservation.expiration_date

        # ``additional_days`` is a query parameter on this route, not a JSON body.
        response = await post_transition(
            client, headers, lot.id, "extend-option", params={"additional_days": 5}
        )

        assert response.status_code == 200
        await db_session.refresh(lot)
        assert lot.status == "option"
        await db_session.refresh(reservation)
        assert reservation.expiration_date > previous_expiration
        assert reservation.expiration_date - previous_expiration == timedelta(days=5)


class TestToReservationAFinaliser:
    async def test_direct_reservation_available_to_raf(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        lot: LotModel,
        buyer: ClientModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        response = await post_transition(
            client,
            auth_headers(commercial),
            lot.id,
            "direct-reservation",
            _direct_reservation_payload(buyer.id),
        )

        assert response.status_code == 200
        await db_session.refresh(lot)
        assert lot.status == "reservation_a_finaliser"
        reservation = await _reservation_of(db_session, lot)
        assert reservation.guarantee_amount == 10000
        assert reservation.payment_type == PAYMENT
        assert lot.current_reservation_id == reservation.id

    async def test_option_to_reservation(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        lot: LotModel,
        buyer: ClientModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        await post_transition(
            client, headers, lot.id, "start-option", _option_payload(buyer.id)
        )

        response = await post_transition(
            client, headers, lot.id, "to-reservation", _to_reservation_payload()
        )

        assert response.status_code == 200
        await db_session.refresh(lot)
        assert lot.status == "reservation_a_finaliser"
        reservation = await _reservation_of(db_session, lot)
        assert reservation.guarantee_amount == 10000
        assert reservation.payment_type == PAYMENT

    async def test_refund_raf_to_available(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        lot: LotModel,
        buyer: ClientModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        await post_transition(
            client,
            headers,
            lot.id,
            "direct-reservation",
            _direct_reservation_payload(buyer.id),
        )

        response = await post_transition(
            client,
            headers,
            lot.id,
            "refund",
            {"refund_amount": 10000, "refund_date": _today()},
        )

        assert response.status_code == 200
        await db_session.refresh(lot)
        assert lot.status == "available"
        assert lot.current_reservation_id is None
        reservation = await _reservation_of(db_session, lot)
        assert reservation.status == "released"
        assert reservation.deposit_refund_amount == 10000


class TestEngage:
    async def test_direct_engage_available_to_engagee(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        lot: LotModel,
        buyer: ClientModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        response = await post_transition(
            client,
            auth_headers(commercial),
            lot.id,
            "direct-engage",
            _direct_engage_payload(buyer.id),
        )

        assert response.status_code == 200
        await db_session.refresh(lot)
        assert lot.status == "reservation_engagee"
        reservation = await _reservation_of(db_session, lot)
        assert reservation.guarantee_amount == 50000

    async def test_engage_raf_to_engagee(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        lot: LotModel,
        buyer: ClientModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        await post_transition(
            client,
            headers,
            lot.id,
            "direct-reservation",
            _direct_reservation_payload(buyer.id),
        )

        response = await post_transition(
            client, headers, lot.id, "engage", {"guarantee_action": "deduct"}
        )

        assert response.status_code == 200
        await db_session.refresh(lot)
        assert lot.status == "reservation_engagee"


class TestSolde:
    async def test_solde_engagee_to_soldee(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        lot: LotModel,
        buyer: ClientModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        await post_transition(
            client, headers, lot.id, "direct-engage", _direct_engage_payload(buyer.id)
        )

        response = await post_transition(
            client, headers, lot.id, "solde", {"price": 500000}
        )

        assert response.status_code == 200
        assert response.json()["price"] == 500000
        await db_session.refresh(lot)
        assert lot.status == "reservation_soldee"
        reservation = await _reservation_of(db_session, lot)
        assert reservation.status == "converted"

    async def test_solde_refused_for_other_commercial(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        lot: LotModel,
        buyer: ClientModel,
        commercial: UserModel,
        other_commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        await post_transition(
            client,
            auth_headers(commercial),
            lot.id,
            "direct-engage",
            _direct_engage_payload(buyer.id),
        )

        response = await post_transition(
            client, auth_headers(other_commercial), lot.id, "solde", {"price": 500000}
        )

        assert response.status_code == 400
        await db_session.refresh(lot)
        assert lot.status == "reservation_engagee"


class TestNotaire:
    async def test_notaire_soldee_to_chez_notaire(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        lot: LotModel,
        buyer: ClientModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        notaire = await make_notaire(db_session)
        await post_transition(
            client, headers, lot.id, "direct-engage", _direct_engage_payload(buyer.id)
        )
        await post_transition(client, headers, lot.id, "solde", {"price": 500000})
        # The client must first express the wish to go to the notary.
        intent = await post_transition(
            client, headers, lot.id, "set-notaire-intent", {"wants_notaire": True}
        )
        assert intent.status_code == 200

        response = await post_transition(
            client,
            headers,
            lot.id,
            "notaire",
            {"notaire_id": notaire.id, "notary_date": _today()},
        )

        assert response.status_code == 200
        await db_session.refresh(lot)
        assert lot.status == "chez_notaire"
        reservation = await _reservation_of(db_session, lot)
        assert reservation.notaire_id == notaire.id
        assert reservation.notary_name == f"{notaire.prenom} {notaire.nom}"

    async def test_notaire_refused_without_notaire_intent(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        lot: LotModel,
        buyer: ClientModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        notaire = await make_notaire(db_session)
        await post_transition(
            client, headers, lot.id, "direct-engage", _direct_engage_payload(buyer.id)
        )
        await post_transition(client, headers, lot.id, "solde", {"price": 500000})

        response = await post_transition(
            client,
            headers,
            lot.id,
            "notaire",
            {"notaire_id": notaire.id, "notary_date": _today()},
        )

        assert response.status_code == 400
        await db_session.refresh(lot)
        assert lot.status == "reservation_soldee"

    async def test_proprietaire_sets_closed_at(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        lot: LotModel,
        buyer: ClientModel,
        commercial: UserModel,
        manager: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        notaire = await make_notaire(db_session)
        await post_transition(
            client, headers, lot.id, "direct-engage", _direct_engage_payload(buyer.id)
        )
        await post_transition(client, headers, lot.id, "solde", {"price": 500000})
        await post_transition(
            client, headers, lot.id, "set-notaire-intent", {"wants_notaire": True}
        )
        await post_transition(
            client,
            headers,
            lot.id,
            "notaire",
            {"notaire_id": notaire.id, "notary_date": _today()},
        )

        response = await post_transition(
            client, auth_headers(manager), lot.id, "proprietaire"
        )

        assert response.status_code == 200
        await db_session.refresh(lot)
        assert lot.status == "chez_proprietaire"
        reservation = await _reservation_of(db_session, lot)
        assert reservation.closed_at is not None

    async def test_proprietaire_manager_only(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        lot: LotModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        response = await post_transition(
            client, auth_headers(commercial), lot.id, "proprietaire"
        )

        assert response.status_code == 403
        await db_session.refresh(lot)
        assert lot.status == "available"


class TestBlock:
    async def test_block_stores_reason(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        lot: LotModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        response = await post_transition(
            client, auth_headers(commercial), lot.id, "block", {"reason": "test"}
        )

        assert response.status_code == 200
        await db_session.refresh(lot)
        assert lot.status == "blocked"
        assert lot.blocked_reason == "test"

    async def test_unblock_manager_only(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        lot: LotModel,
        commercial: UserModel,
        manager: UserModel,
        auth_headers: Headers,
    ) -> None:
        await post_transition(
            client, auth_headers(commercial), lot.id, "block", {"reason": "test"}
        )

        refused = await post_transition(
            client, auth_headers(commercial), lot.id, "unblock", {}
        )
        assert refused.status_code == 403
        await db_session.refresh(lot)
        assert lot.status == "blocked"

        allowed = await post_transition(
            client, auth_headers(manager), lot.id, "unblock", {}
        )
        assert allowed.status_code == 200
        await db_session.refresh(lot)
        assert lot.status == "available"

    async def test_unblock_returns_to_available_and_keeps_reservation_link(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        lot: LotModel,
        buyer: ClientModel,
        commercial: UserModel,
        manager: UserModel,
        auth_headers: Headers,
    ) -> None:
        """Blocking an optioned lot then unblocking it loses the option status.

        Pinned as-is (see "Anomalies constatees"): the lot comes back
        ``available`` while still pointing to an ``active`` reservation.
        """
        await post_transition(
            client,
            auth_headers(commercial),
            lot.id,
            "start-option",
            _option_payload(buyer.id),
        )
        await post_transition(
            client, auth_headers(commercial), lot.id, "block", {"reason": "test"}
        )

        response = await post_transition(
            client, auth_headers(manager), lot.id, "unblock", {}
        )

        assert response.status_code == 200
        await db_session.refresh(lot)
        assert lot.status == "available"
        reservation = await _reservation_of(db_session, lot)
        assert lot.current_reservation_id == reservation.id
        assert reservation.status == "active"


class TestInvalidTransitions:
    async def test_transition_from_wrong_status_refused(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        buyer: ClientModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        project = await make_project(db_session, manager)
        creation_lot = await make_lot(db_session, project, status="creation")

        response = await post_transition(
            client,
            auth_headers(commercial),
            creation_lot.id,
            "start-option",
            _option_payload(buyer.id),
        )

        assert response.status_code == 400
        await db_session.refresh(creation_lot)
        assert creation_lot.status == "creation"
