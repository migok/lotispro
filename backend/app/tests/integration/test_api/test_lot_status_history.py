"""Every lot status change writes exactly one ``lot_status_history`` row.

Intermediate states are reached through the transition routes themselves, so
the setup steps write history rows too: each test counts the rows written by
the final call only.
"""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any, get_args

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.schemas.reservation import PAYMENT_TYPE
from app.infrastructure.database.models import (
    ClientModel,
    LotModel,
    LotPricingConfigModel,
    LotStatusHistoryModel,
    NotaireModel,
    ReservationModel,
    UserModel,
)
from app.services.lot_pricing_service import LotPricingService
from app.services.project_service import ProjectService
from app.tests.factories import make_client, make_lot, make_notaire, make_project

pytestmark = pytest.mark.integration

PAYMENT = get_args(PAYMENT_TYPE)[0]

Headers = Callable[[UserModel], dict[str, str]]


def _in_days(days: int) -> str:
    return (datetime.now(UTC) + timedelta(days=days)).isoformat()


def _today() -> str:
    return datetime.now(UTC).date().isoformat()


def _payload(route: str, buyer_id: int, notaire_id: int) -> dict[str, Any] | None:
    """Request body of a transition route (``None`` when it takes none)."""
    payloads: dict[str, dict[str, Any]] = {
        "start-option": {"client_id": buyer_id, "expiration_date": _in_days(7)},
        "direct-reservation": {
            "client_id": buyer_id,
            "guarantee_amount": 10000,
            "payment_type": PAYMENT,
            "finalization_date": _in_days(15),
        },
        "to-reservation": {
            "guarantee_amount": 10000,
            "payment_type": PAYMENT,
            "finalization_date": _in_days(15),
        },
        "refund": {"refund_amount": 10000, "refund_date": _today()},
        "direct-engage": {
            "client_id": buyer_id,
            "guarantee_amount": 50000,
            "payment_type": PAYMENT,
        },
        "engage": {"guarantee_action": "deduct"},
        "solde": {"price": 500000},
        "set-notaire-intent": {"wants_notaire": True},
        "notaire": {"notaire_id": notaire_id, "notary_date": _today()},
        "block": {"reason": "test"},
        "unblock": {},
    }
    return payloads.get(route)


# Routes that only a manager may call.
MANAGER_ROUTES = {"proprietaire", "unblock"}

TO_SOLDEE = ["direct-engage", "solde"]
TO_NOTAIRE = [*TO_SOLDEE, "set-notaire-intent", "notaire"]

# (route, setup routes, initial lot status, from, to, transition name)
STATUS_CHANGES = [
    pytest.param("activate", [], "creation", "creation", "available", "activate"),
    pytest.param(
        "start-option", [], "available", "available", "option", "start_option"
    ),
    pytest.param(
        "cancel-option",
        ["start-option"],
        "available",
        "option",
        "available",
        "cancel_option",
    ),
    pytest.param(
        "direct-reservation",
        [],
        "available",
        "available",
        "reservation_a_finaliser",
        "direct_reservation",
    ),
    pytest.param(
        "to-reservation",
        ["start-option"],
        "available",
        "option",
        "reservation_a_finaliser",
        "to_reservation",
    ),
    pytest.param(
        "refund",
        ["direct-reservation"],
        "available",
        "reservation_a_finaliser",
        "available",
        "refund",
    ),
    pytest.param(
        "direct-engage",
        [],
        "available",
        "available",
        "reservation_engagee",
        "direct_engage",
    ),
    pytest.param(
        "engage",
        ["direct-reservation"],
        "available",
        "reservation_a_finaliser",
        "reservation_engagee",
        "engage",
    ),
    pytest.param(
        "solde",
        ["direct-engage"],
        "available",
        "reservation_engagee",
        "reservation_soldee",
        "solde",
    ),
    pytest.param(
        "notaire",
        [*TO_SOLDEE, "set-notaire-intent"],
        "available",
        "reservation_soldee",
        "chez_notaire",
        "notaire",
    ),
    pytest.param(
        "proprietaire",
        TO_NOTAIRE,
        "available",
        "chez_notaire",
        "chez_proprietaire",
        "proprietaire",
    ),
    pytest.param("block", [], "available", "available", "blocked", "block"),
    pytest.param("unblock", ["block"], "available", "blocked", "available", "unblock"),
]


@pytest.fixture
async def buyer(db_session: AsyncSession, manager: UserModel) -> ClientModel:
    return await make_client(db_session, manager)


@pytest.fixture
async def notaire(db_session: AsyncSession) -> NotaireModel:
    return await make_notaire(db_session)


class _Api:
    """Calls transition routes as the commercial (or the manager when required)."""

    def __init__(
        self,
        client: AsyncClient,
        headers: Headers,
        commercial: UserModel,
        manager: UserModel,
        buyer: ClientModel,
        notaire: NotaireModel,
    ) -> None:
        self.client = client
        self.headers = headers
        self.commercial = commercial
        self.manager = manager
        self.buyer = buyer
        self.notaire = notaire

    def actor(self, route: str) -> UserModel:
        return self.manager if route in MANAGER_ROUTES else self.commercial

    async def post(self, lot_id: int, route: str) -> Response:
        response = await self.client.post(
            f"/api/lots/{lot_id}/transitions/{route}",
            headers=self.headers(self.actor(route)),
            json=_payload(route, self.buyer.id, self.notaire.id),
        )
        assert response.status_code == 200, (route, response.json())
        return response


@pytest.fixture
def api(
    client: AsyncClient,
    auth_headers: Headers,
    commercial: UserModel,
    manager: UserModel,
    buyer: ClientModel,
    notaire: NotaireModel,
) -> _Api:
    return _Api(client, auth_headers, commercial, manager, buyer, notaire)


async def _history(
    db_session: AsyncSession, lot_id: int
) -> list[LotStatusHistoryModel]:
    result = await db_session.execute(
        select(LotStatusHistoryModel)
        .where(LotStatusHistoryModel.lot_id == lot_id)
        .order_by(LotStatusHistoryModel.id)
    )
    return list(result.scalars().all())


async def _history_count(db_session: AsyncSession) -> int:
    return (
        await db_session.execute(
            select(func.count()).select_from(LotStatusHistoryModel)
        )
    ).scalar_one()


async def _reservation_id(db_session: AsyncSession, lot_id: int) -> int | None:
    return (
        await db_session.execute(
            select(ReservationModel.id).where(ReservationModel.lot_id == lot_id)
        )
    ).scalar_one_or_none()


class TestEachStatusChangeWritesOneRow:
    @pytest.mark.parametrize(
        ("route", "setup", "initial", "from_status", "to_status", "transition"),
        STATUS_CHANGES,
    )
    async def test_one_history_row(
        self,
        db_session: AsyncSession,
        manager: UserModel,
        api: _Api,
        route: str,
        setup: list[str],
        initial: str,
        from_status: str,
        to_status: str,
        transition: str,
    ) -> None:
        project = await make_project(db_session, manager)
        lot = await make_lot(db_session, project, status=initial)
        for step in setup:
            await api.post(lot.id, step)
        before = await _history(db_session, lot.id)

        await api.post(lot.id, route)

        rows = await _history(db_session, lot.id)
        assert len(rows) == len(before) + 1
        row = rows[-1]
        assert row.from_status == from_status
        assert row.to_status == to_status
        assert row.transition == transition
        assert row.user_id == api.actor(route).id
        assert row.changed_at is not None
        assert row.reservation_id == await _reservation_id(db_session, lot.id)
        await db_session.refresh(lot)
        assert lot.status == to_status


class TestUnchangedStatusWritesNoRow:
    @pytest.mark.parametrize(
        ("setup", "route"),
        [
            pytest.param(["start-option"], "extend-option", id="extend-option"),
            pytest.param(TO_SOLDEE, "set-notaire-intent", id="set-notaire-intent"),
        ],
    )
    async def test_post_without_status_change(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
        api: _Api,
        setup: list[str],
        route: str,
    ) -> None:
        project = await make_project(db_session, manager)
        lot = await make_lot(db_session, project, status="available")
        for step in setup:
            await api.post(lot.id, step)
        before = await _history_count(db_session)

        response = await client.post(
            f"/api/lots/{lot.id}/transitions/{route}",
            headers=auth_headers(commercial),
            json=_payload(route, api.buyer.id, api.notaire.id),
            params={"additional_days": 5} if route == "extend-option" else None,
        )

        assert response.status_code == 200
        assert await _history_count(db_session) == before

    async def test_notaire_update(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
        api: _Api,
    ) -> None:
        project = await make_project(db_session, manager)
        lot = await make_lot(db_session, project, status="available")
        for step in TO_NOTAIRE:
            await api.post(lot.id, step)
        before = await _history_count(db_session)

        response = await client.put(
            f"/api/lots/{lot.id}/transitions/notaire",
            headers=auth_headers(commercial),
            json={"notaire_id": api.notaire.id, "notary_date": _today()},
        )

        assert response.status_code == 200
        assert await _history_count(db_session) == before

    async def test_refused_transition(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        auth_headers: Headers,
    ) -> None:
        project = await make_project(db_session, manager)
        lot = await make_lot(db_session, project, status="available")

        response = await client.post(
            f"/api/lots/{lot.id}/transitions/solde",
            headers=auth_headers(manager),
            json={"price": 500000},
        )

        assert response.status_code == 400
        assert await _history_count(db_session) == 0


class TestOtherStatusWriters:
    async def test_direct_update_writes_one_row(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        auth_headers: Headers,
    ) -> None:
        project = await make_project(db_session, manager)
        lot = await make_lot(db_session, project, status="creation")

        response = await client.put(
            f"/api/lots/{lot.id}",
            headers=auth_headers(manager),
            json={"status": "blocked"},
        )

        assert response.status_code == 200
        rows = await _history(db_session, lot.id)
        assert [
            (r.from_status, r.to_status, r.transition, r.user_id) for r in rows
        ] == [("creation", "blocked", "direct_update", manager.id)]

    async def test_direct_update_without_status_change_writes_no_row(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        auth_headers: Headers,
    ) -> None:
        project = await make_project(db_session, manager)
        lot = await make_lot(db_session, project, status="available")

        response = await client.put(
            f"/api/lots/{lot.id}",
            headers=auth_headers(manager),
            json={"status": "available", "zone": "B"},
        )

        assert response.status_code == 200
        assert await _history(db_session, lot.id) == []

    async def test_pricing_auto_activation_on_update_writes_activate_row(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        auth_headers: Headers,
    ) -> None:
        project = await make_project(db_session, manager)
        lot = await make_lot(
            db_session, project, status="creation", price=None, zone="A"
        )
        db_session.add(
            LotPricingConfigModel(
                project_id=project.id,
                zone="A",
                prix_m2_acte=1000.0,
                prix_m2_catalogue=1200.0,
                created_by=manager.id,
            )
        )
        await db_session.commit()

        response = await client.put(
            f"/api/lots/{lot.id}",
            headers=auth_headers(manager),
            json={"surface": 100},
        )

        assert response.status_code == 200
        assert response.json()["status"] == "available"
        rows = await _history(db_session, lot.id)
        assert [
            (r.from_status, r.to_status, r.transition, r.user_id) for r in rows
        ] == [("creation", "available", "activate", manager.id)]

    async def test_pricing_grid_activation_writes_activate_row(
        self,
        db_session: AsyncSession,
        manager: UserModel,
    ) -> None:
        project = await make_project(db_session, manager)
        lot = await make_lot(
            db_session, project, status="creation", price=None, zone="A"
        )
        db_session.add(
            LotPricingConfigModel(
                project_id=project.id,
                zone="A",
                prix_m2_acte=1000.0,
                prix_m2_catalogue=1200.0,
                created_by=manager.id,
            )
        )
        await db_session.commit()

        result = await LotPricingService(db_session).apply_configs_to_existing_lots(
            project.id, manager.id, "manager"
        )

        assert result["lots_activated"] == 1
        rows = await _history(db_session, lot.id)
        assert [
            (r.from_status, r.to_status, r.transition, r.user_id) for r in rows
        ] == [("creation", "available", "activate", manager.id)]

    async def test_csv_import_activation_writes_activate_row(
        self,
        db_session: AsyncSession,
        manager: UserModel,
    ) -> None:
        project = await make_project(db_session, manager)
        lot = await make_lot(
            db_session, project, status="creation", price=None, numero="L-1"
        )

        result = await ProjectService(db_session).import_csv_metadata(
            project_id=project.id,
            user_id=manager.id,
            user_role="manager",
            csv_rows=[{"N_LOT": "L-1", "prix": "300000"}],
        )

        assert result["activated"] == 1
        rows = await _history(db_session, lot.id)
        assert [
            (r.from_status, r.to_status, r.transition, r.user_id) for r in rows
        ] == [("creation", "available", "activate", manager.id)]


class TestStatusHistoryEndpoint:
    async def test_lists_newest_first_with_user_name(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
        api: _Api,
    ) -> None:
        project = await make_project(db_session, manager)
        lot = await make_lot(db_session, project, status="available")
        await api.post(lot.id, "block")
        await api.post(lot.id, "unblock")
        await api.post(lot.id, "start-option")

        response = await client.get(
            f"/api/lots/{lot.id}/status-history", headers=auth_headers(commercial)
        )

        assert response.status_code == 200
        body = response.json()
        assert [(e["from_status"], e["to_status"], e["transition"]) for e in body] == [
            ("available", "option", "start_option"),
            ("blocked", "available", "unblock"),
            ("available", "blocked", "block"),
        ]
        assert [e["user_name"] for e in body] == [
            commercial.name,
            manager.name,
            commercial.name,
        ]
        assert [e["user_id"] for e in body] == [
            commercial.id,
            manager.id,
            commercial.id,
        ]
        assert all(e["lot_id"] == lot.id for e in body)
        assert body[0]["reservation_id"] == await _reservation_id(db_session, lot.id)
        assert {"id", "changed_at"} <= set(body[0])

    async def test_unknown_lot_is_404(
        self, client: AsyncClient, commercial: UserModel, auth_headers: Headers
    ) -> None:
        response = await client.get(
            "/api/lots/999999/status-history", headers=auth_headers(commercial)
        )

        assert response.status_code == 404

    async def test_requires_authentication(
        self, client: AsyncClient, db_session: AsyncSession, manager: UserModel
    ) -> None:
        project = await make_project(db_session, manager)
        lot: LotModel = await make_lot(db_session, project)

        response = await client.get(f"/api/lots/{lot.id}/status-history")

        assert response.status_code == 401
