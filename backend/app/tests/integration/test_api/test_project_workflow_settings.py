"""Per-project optional lot statuses: settings endpoint and enforcement."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any, get_args

import pytest
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.lot_workflow import EDL_STATUSES, OPTIONAL_KEY_STATUSES
from app.domain.schemas.reservation import PAYMENT_TYPE
from app.infrastructure.database.models import UserModel
from app.tests.factories import make_client, make_lot, make_project

pytestmark = pytest.mark.integration

PAYMENT = get_args(PAYMENT_TYPE)[0]
Headers = Callable[[UserModel], dict[str, str]]


def _in_days(days: int) -> str:
    return (datetime.now(UTC) + timedelta(days=days)).isoformat()


async def _put_workflow(
    client: AsyncClient, headers: dict[str, str], project_id: int, enabled: list[str]
) -> Response:
    return await client.put(
        f"/api/projects/{project_id}/workflow",
        headers=headers,
        json={"enabled_optional_statuses": enabled},
    )


async def _transition(
    client: AsyncClient,
    headers: dict[str, str],
    lot_id: int,
    name: str,
    json: dict[str, Any] | None = None,
) -> Response:
    return await client.post(
        f"/api/lots/{lot_id}/transitions/{name}", headers=headers, json=json
    )


class TestDefaults:
    async def test_new_project_has_default_settings(
        self, client: AsyncClient, manager: UserModel, auth_headers: Headers
    ) -> None:
        response = await client.post(
            "/api/projects", headers=auth_headers(manager), json={"name": "Nouveau"}
        )

        assert response.status_code == 201
        body = response.json()
        assert body["enabled_optional_statuses"] == [
            "option",
            "reservation_a_finaliser",
        ]
        assert "edl_programme" not in body["enabled_statuses"]
        assert "option" in body["enabled_statuses"]

    async def test_existing_project_has_default_settings(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        auth_headers: Headers,
    ) -> None:
        project = await make_project(db_session, manager)

        response = await client.get(
            f"/api/projects/{project.id}", headers=auth_headers(manager)
        )

        assert response.status_code == 200
        assert response.json()["enabled_optional_statuses"] == [
            "option",
            "reservation_a_finaliser",
        ]

    async def test_factory_accepts_setting(
        self, db_session: AsyncSession, manager: UserModel
    ) -> None:
        project = await make_project(
            db_session, manager, enabled_optional_statuses=["edl"]
        )
        assert project.enabled_optional_statuses == ["edl"]


class TestPutWorkflow:
    async def test_commercial_forbidden(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        project = await make_project(db_session, manager)

        response = await _put_workflow(
            client, auth_headers(commercial), project.id, ["option"]
        )

        assert response.status_code == 403

    async def test_unknown_value_is_422(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        auth_headers: Headers,
    ) -> None:
        project = await make_project(db_session, manager)

        response = await _put_workflow(
            client, auth_headers(manager), project.id, ["option", "bogus"]
        )

        assert response.status_code == 422

    async def test_unknown_project_is_404(
        self, client: AsyncClient, manager: UserModel, auth_headers: Headers
    ) -> None:
        response = await _put_workflow(client, auth_headers(manager), 99999, [])
        assert response.status_code == 404

    @pytest.mark.parametrize(
        ("enabled", "expected"),
        [
            (
                [],
                [
                    "creation",
                    "available",
                    "reservation_engagee",
                    "reservation_soldee",
                    "chez_notaire",
                    "chez_proprietaire",
                    "blocked",
                ],
            ),
            (
                ["edl", "option", "edl"],
                [
                    "creation",
                    "available",
                    "option",
                    "reservation_engagee",
                    "reservation_soldee",
                    "edl_programme",
                    "edl_realise",
                    "edl_finalise",
                    "chez_notaire",
                    "chez_proprietaire",
                    "blocked",
                ],
            ),
            (
                ["reservation_a_finaliser"],
                [
                    "creation",
                    "available",
                    "reservation_a_finaliser",
                    "reservation_engagee",
                    "reservation_soldee",
                    "chez_notaire",
                    "chez_proprietaire",
                    "blocked",
                ],
            ),
        ],
    )
    async def test_enabled_statuses_in_pipeline_order(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        auth_headers: Headers,
        enabled: list[str],
        expected: list[str],
    ) -> None:
        project = await make_project(db_session, manager)

        response = await _put_workflow(
            client, auth_headers(manager), project.id, enabled
        )

        assert response.status_code == 200
        body = response.json()
        assert body["enabled_statuses"] == expected
        assert body["enabled_optional_statuses"] == list(dict.fromkeys(enabled))
        again = await client.get(
            f"/api/projects/{project.id}", headers=auth_headers(manager)
        )
        assert again.json()["enabled_statuses"] == expected

    async def test_disable_option_refused_when_lots_in_option(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        auth_headers: Headers,
    ) -> None:
        project = await make_project(db_session, manager)
        await make_lot(db_session, project, status="option", numero="A2")
        await make_lot(db_session, project, status="option", numero="A1")
        await make_lot(db_session, project, status="available", numero="A3")

        response = await _put_workflow(
            client, auth_headers(manager), project.id, ["reservation_a_finaliser"]
        )

        assert response.status_code == 400
        body = response.json()
        assert body["message"] == (
            "Impossible de désactiver « Option » : lots concernés : A1, A2."
        )
        assert "status_in_use" in str(body)

    async def test_disable_edl_allowed_when_no_lot_in_edl_status(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        auth_headers: Headers,
    ) -> None:
        # EDL statuses cannot be stored before the lots constraint is widened
        # (task 3); until then "edl in use" is covered by the key mapping below.
        project = await make_project(
            db_session,
            manager,
            enabled_optional_statuses=["option", "reservation_a_finaliser", "edl"],
        )
        await make_lot(db_session, project, status="reservation_soldee")

        response = await _put_workflow(
            client,
            auth_headers(manager),
            project.id,
            ["option", "reservation_a_finaliser"],
        )

        assert response.status_code == 200
        assert OPTIONAL_KEY_STATUSES["edl"] == EDL_STATUSES


class TestEnforcement:
    async def test_disabled_option_blocks_start_option(
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
        assert (
            await _put_workflow(
                client, auth_headers(manager), project.id, ["reservation_a_finaliser"]
            )
        ).status_code == 200

        response = await _transition(
            client,
            auth_headers(commercial),
            lot.id,
            "start-option",
            {"client_id": buyer.id, "expiration_date": _in_days(7)},
        )

        assert response.status_code == 400
        assert response.json()["message"] == (
            "Le statut « Option » est désactivé pour ce projet."
        )
        await db_session.refresh(lot)
        assert lot.status == "available"

    async def test_disabled_raf_blocks_direct_reservation_and_to_reservation(
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
        available = await make_lot(db_session, project, status="available")
        in_option = await make_lot(db_session, project, status="option")
        buyer = await make_client(db_session, manager)
        headers = auth_headers(commercial)

        direct = await _transition(
            client,
            headers,
            available.id,
            "direct-reservation",
            {
                "client_id": buyer.id,
                "guarantee_amount": 10000,
                "payment_type": PAYMENT,
                "finalization_date": _in_days(15),
            },
        )
        to_res = await _transition(
            client,
            headers,
            in_option.id,
            "to-reservation",
            {
                "guarantee_amount": 10000,
                "payment_type": PAYMENT,
                "finalization_date": _in_days(15),
            },
        )

        expected = "Le statut « Réservation à finaliser » est désactivé pour ce projet."
        assert direct.status_code == 400
        assert direct.json()["message"] == expected
        assert to_res.status_code == 400
        assert to_res.json()["message"] == expected

    async def test_default_project_transitions_unchanged(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        project = await make_project(db_session, manager)
        creation = await make_lot(db_session, project, status="creation")
        available = await make_lot(db_session, project, status="available")
        buyer = await make_client(db_session, manager)
        headers = auth_headers(commercial)

        activate = await _transition(client, headers, creation.id, "activate")
        option = await _transition(
            client,
            headers,
            available.id,
            "start-option",
            {"client_id": buyer.id, "expiration_date": _in_days(7)},
        )
        cancel = await _transition(client, headers, available.id, "cancel-option")

        assert activate.status_code == 200
        assert option.status_code == 200
        assert cancel.status_code == 200
        await db_session.refresh(available)
        assert available.status == "available"
