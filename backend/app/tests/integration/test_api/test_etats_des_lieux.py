"""États des lieux (EDL): transitions, actions, read endpoint and side effects.

A lot reaches ``reservation_soldee`` through the API (direct-engage + solde)
so the EDL is linked to a real reservation.
"""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any, get_args

import pytest
from fastapi import FastAPI
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.schemas.reservation import PAYMENT_TYPE
from app.infrastructure.database.models import (
    LotModel,
    LotStatusHistoryModel,
    ProjectModel,
    UserModel,
)
from app.tests.factories import make_client, make_lot, make_notaire, make_project

pytestmark = pytest.mark.integration

PAYMENT = get_args(PAYMENT_TYPE)[0]
Headers = Callable[[UserModel], dict[str, str]]

WITH_EDL = ["option", "reservation_a_finaliser", "edl"]


def _in_days(days: int) -> str:
    return (datetime.now(UTC) + timedelta(days=days)).isoformat()


def _today() -> str:
    return datetime.now(UTC).date().isoformat()


async def _post(
    client: AsyncClient,
    headers: dict[str, str],
    lot_id: int,
    name: str,
    json: dict[str, Any] | None = None,
) -> Response:
    return await client.post(
        f"/api/lots/{lot_id}/transitions/{name}", headers=headers, json=json
    )


def _schedule_payload(**extra: Any) -> dict[str, Any]:
    return {"scheduled_at": _in_days(3), "intervenant": "M. Expert", **extra}


def _done_payload(actions: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "done_at": datetime.now(UTC).isoformat(),
        "note": "Visite faite",
        "actions": actions or [],
    }


async def _sold_lot(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    headers: dict[str, str],
    enabled: list[str] | None = None,
    numero: str = "A1",
) -> tuple[ProjectModel, LotModel]:
    """A ``reservation_soldee`` lot reached through the API."""
    project = await make_project(
        db_session,
        manager,
        enabled_optional_statuses=WITH_EDL if enabled is None else enabled,
    )
    lot = await make_lot(db_session, project, status="available", numero=numero)
    buyer = await make_client(db_session, manager)
    # Paid in full at engagement: nothing left to pay, the lot can be « soldé ».
    engage = await _post(
        client,
        headers,
        lot.id,
        "direct-engage",
        {"client_id": buyer.id, "guarantee_amount": 500000, "payment_type": PAYMENT},
    )
    assert engage.status_code == 200, engage.json()
    solde = await _post(client, headers, lot.id, "solde", {"price": 500000})
    assert solde.status_code == 200, solde.json()
    return project, lot


async def _realised_lot(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    headers: dict[str, str],
    actions: list[dict[str, Any]] | None = None,
) -> LotModel:
    """An ``edl_realise`` lot with the given actions."""
    _, lot = await _sold_lot(client, db_session, manager, headers)
    assert (
        await _post(client, headers, lot.id, "edl-schedule", _schedule_payload())
    ).status_code == 200
    done = await _post(client, headers, lot.id, "edl-done", _done_payload(actions))
    assert done.status_code == 200, done.json()
    return lot


async def _get_edl(
    client: AsyncClient, headers: dict[str, str], lot_id: int
) -> dict[str, Any]:
    response = await client.get(f"/api/lots/{lot_id}/edl", headers=headers)
    assert response.status_code == 200, response.json()
    return response.json()


async def _put_workflow(
    client: AsyncClient, headers: dict[str, str], project_id: int, enabled: list[str]
) -> Response:
    return await client.put(
        f"/api/projects/{project_id}/workflow",
        headers=headers,
        json={"enabled_optional_statuses": enabled},
    )


class TestFullWorkflow:
    async def test_soldee_to_proprietaire_through_edl(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, lot = await _sold_lot(client, db_session, manager, headers)
        notaire = await make_notaire(db_session)

        schedule = await _post(
            client, headers, lot.id, "edl-schedule", _schedule_payload(note="RDV")
        )
        assert schedule.status_code == 200, schedule.json()
        assert schedule.json()["status"] == "edl_programme"
        edl = await _get_edl(client, headers, lot.id)
        assert edl["intervenant"] == "M. Expert"
        assert edl["schedule_note"] == "RDV"
        assert edl["reservation_id"] == lot.current_reservation_id
        assert edl["actions"] == []

        reschedule = await client.put(
            f"/api/lots/{lot.id}/transitions/edl-schedule",
            headers=headers,
            json={"scheduled_at": _in_days(5), "intervenant": "Mme Autre"},
        )
        assert reschedule.status_code == 200, reschedule.json()
        assert reschedule.json()["status"] == "edl_programme"
        edl = await _get_edl(client, headers, lot.id)
        assert edl["intervenant"] == "Mme Autre"
        assert edl["scheduled_at"].startswith(_in_days(5)[:10])

        done = await _post(
            client,
            headers,
            lot.id,
            "edl-done",
            _done_payload(
                [
                    {"description": "Fissure salon", "responsable": "Entreprise A"},
                    {"description": "Retouche peinture"},
                ]
            ),
        )
        assert done.status_code == 200, done.json()
        assert done.json()["status"] == "edl_realise"
        edl = await _get_edl(client, headers, lot.id)
        assert edl["done_note"] == "Visite faite"
        assert edl["done_at"] is not None
        actions = edl["actions"]
        assert [a["description"] for a in actions] == [
            "Fissure salon",
            "Retouche peinture",
        ]
        assert [a["status"] for a in actions] == ["ouverte", "ouverte"]
        assert actions[0]["responsable"] == "Entreprise A"
        assert actions[1]["responsable"] is None

        refused = await _post(client, headers, lot.id, "edl-finalize")
        assert refused.status_code == 400
        assert refused.json()["message"] == (
            "Impossible de finaliser : 2 action(s) encore ouverte(s)."
        )
        assert refused.json()["details"][0]["rule"] == "edl_open_actions"

        first = await client.put(
            f"/api/lots/{lot.id}/edl/actions/{actions[0]['id']}",
            headers=headers,
            json={"status": "faite"},
        )
        assert first.status_code == 200, first.json()
        assert first.json()["status"] == "faite"
        assert first.json()["done_at"] is not None
        still_refused = await _post(client, headers, lot.id, "edl-finalize")
        assert still_refused.json()["message"] == (
            "Impossible de finaliser : 1 action(s) encore ouverte(s)."
        )
        second = await client.put(
            f"/api/lots/{lot.id}/edl/actions/{actions[1]['id']}",
            headers=headers,
            json={"status": "faite"},
        )
        assert second.status_code == 200

        finalize = await _post(client, headers, lot.id, "edl-finalize")
        assert finalize.status_code == 200, finalize.json()
        assert finalize.json()["status"] == "edl_finalise"
        assert (await _get_edl(client, headers, lot.id))["finalized_at"] is not None

        intent = await _post(
            client, headers, lot.id, "set-notaire-intent", {"wants_notaire": True}
        )
        assert intent.status_code == 200, intent.json()
        to_notaire = await _post(
            client,
            headers,
            lot.id,
            "notaire",
            {"notaire_id": notaire.id, "notary_date": _today()},
        )
        assert to_notaire.status_code == 200, to_notaire.json()
        assert to_notaire.json()["status"] == "chez_notaire"
        owner = await _post(client, auth_headers(manager), lot.id, "proprietaire")
        assert owner.status_code == 200, owner.json()

        history = (
            await db_session.execute(
                select(LotStatusHistoryModel)
                .where(LotStatusHistoryModel.lot_id == lot.id)
                .order_by(LotStatusHistoryModel.id)
            )
        ).scalars()
        assert [(h.from_status, h.to_status, h.transition) for h in history] == [
            ("available", "reservation_engagee", "direct_engage"),
            ("reservation_engagee", "reservation_soldee", "solde"),
            ("reservation_soldee", "edl_programme", "edl_schedule"),
            ("edl_programme", "edl_realise", "edl_done"),
            ("edl_realise", "edl_finalise", "edl_finalize"),
            ("edl_finalise", "chez_notaire", "notaire"),
            ("chez_notaire", "chez_proprietaire", "proprietaire"),
        ]


class TestProjectConditions:
    async def test_schedule_refused_when_edl_disabled(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, lot = await _sold_lot(
            client,
            db_session,
            manager,
            headers,
            enabled=["option", "reservation_a_finaliser"],
        )

        response = await _post(
            client, headers, lot.id, "edl-schedule", _schedule_payload()
        )

        assert response.status_code == 400
        assert response.json()["message"] == (
            "Le statut « État des lieux programmé » est désactivé pour ce projet."
        )
        assert response.json()["details"][0]["rule"] == "status_disabled"
        await db_session.refresh(lot)
        assert lot.status == "reservation_soldee"

    async def test_notaire_from_soldee_refused_when_edl_enabled(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, lot = await _sold_lot(client, db_session, manager, headers)
        notaire = await make_notaire(db_session)
        assert (
            await _post(
                client, headers, lot.id, "set-notaire-intent", {"wants_notaire": True}
            )
        ).status_code == 200

        response = await _post(
            client,
            headers,
            lot.id,
            "notaire",
            {"notaire_id": notaire.id, "notary_date": _today()},
        )

        assert response.status_code == 400
        assert response.json()["message"] == (
            "L'état des lieux est activé pour ce projet : programmez-le avant "
            "le passage chez le notaire."
        )
        assert response.json()["details"][0]["rule"] == "edl_required"
        await db_session.refresh(lot)
        assert lot.status == "reservation_soldee"

    async def test_notaire_from_edl_finalise_requires_intent(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        lot = await _realised_lot(client, db_session, manager, headers)
        assert (await _post(client, headers, lot.id, "edl-finalize")).status_code == 200
        notaire = await make_notaire(db_session)

        response = await _post(
            client,
            headers,
            lot.id,
            "notaire",
            {"notaire_id": notaire.id, "notary_date": _today()},
        )

        assert response.status_code == 400
        assert response.json()["details"][0]["rule"] == "notaire_intent_not_set"
        await db_session.refresh(lot)
        assert lot.status == "edl_finalise"

    @pytest.mark.parametrize("step", ["edl_programme", "edl_realise"])
    async def test_set_notaire_intent_allowed_in_edl_statuses(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
        step: str,
    ) -> None:
        headers = auth_headers(commercial)
        _, lot = await _sold_lot(client, db_session, manager, headers)
        await _post(client, headers, lot.id, "edl-schedule", _schedule_payload())
        if step == "edl_realise":
            await _post(client, headers, lot.id, "edl-done", _done_payload())
        await db_session.refresh(lot)
        assert lot.status == step

        response = await _post(
            client, headers, lot.id, "set-notaire-intent", {"wants_notaire": True}
        )

        assert response.status_code == 200, response.json()
        assert response.json()["wants_notaire"] is True


class TestWrongStatus:
    @pytest.mark.parametrize(
        ("method", "route", "payload"),
        [
            ("post", "edl-done", _done_payload()),
            ("post", "edl-finalize", None),
            ("put", "edl-schedule", _schedule_payload()),
        ],
    )
    async def test_edl_transitions_refused_from_soldee(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
        method: str,
        route: str,
        payload: dict[str, Any] | None,
    ) -> None:
        headers = auth_headers(commercial)
        _, lot = await _sold_lot(client, db_session, manager, headers)

        response = await client.request(
            method.upper(),
            f"/api/lots/{lot.id}/transitions/{route}",
            headers=headers,
            json=payload,
        )

        assert response.status_code == 400
        assert response.json()["details"][0]["rule"] == "invalid_lot_status"
        await db_session.refresh(lot)
        assert lot.status == "reservation_soldee"

    async def test_schedule_refused_from_available(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        project = await make_project(
            db_session, manager, enabled_optional_statuses=WITH_EDL
        )
        lot = await make_lot(db_session, project, status="available")

        response = await _post(
            client,
            auth_headers(commercial),
            lot.id,
            "edl-schedule",
            _schedule_payload(),
        )

        assert response.status_code == 400
        assert response.json()["message"] == (
            "Action « Programmer l'état des lieux » impossible depuis le statut "
            "« Disponible »."
        )


class TestActions:
    async def test_actions_editable_in_edl_realise(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        lot = await _realised_lot(
            client, db_session, manager, headers, [{"description": "Joint"}]
        )
        base = f"/api/lots/{lot.id}/edl/actions"

        created = await client.post(
            base,
            headers=headers,
            json={"description": "Prise cassée", "responsable": "Électricien"},
        )
        assert created.status_code == 201, created.json()
        action_id = created.json()["id"]
        assert created.json()["status"] == "ouverte"

        done = await client.put(
            f"{base}/{action_id}", headers=headers, json={"status": "faite"}
        )
        assert done.json()["done_at"] is not None
        reopened = await client.put(
            f"{base}/{action_id}",
            headers=headers,
            json={
                "status": "ouverte",
                "description": "Prise salon",
                "responsable": None,
            },
        )
        assert reopened.status_code == 200, reopened.json()
        body = reopened.json()
        assert body["status"] == "ouverte"
        assert body["done_at"] is None
        assert body["description"] == "Prise salon"
        assert body["responsable"] is None

        deleted = await client.delete(f"{base}/{action_id}", headers=headers)
        assert deleted.status_code == 200
        edl = await _get_edl(client, headers, lot.id)
        assert [a["description"] for a in edl["actions"]] == ["Joint"]

    async def test_actions_refused_outside_edl_realise(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, lot = await _sold_lot(client, db_session, manager, headers)
        await _post(client, headers, lot.id, "edl-schedule", _schedule_payload())
        base = f"/api/lots/{lot.id}/edl/actions"

        in_programme = await client.post(
            base, headers=headers, json={"description": "Trop tôt"}
        )
        assert in_programme.status_code == 400
        assert in_programme.json()["details"][0]["rule"] == "invalid_lot_status"

        await _post(
            client,
            headers,
            lot.id,
            "edl-done",
            _done_payload([{"description": "Vitre"}]),
        )
        action_id = (await _get_edl(client, headers, lot.id))["actions"][0]["id"]
        await client.put(
            f"{base}/{action_id}", headers=headers, json={"status": "faite"}
        )
        assert (await _post(client, headers, lot.id, "edl-finalize")).status_code == 200

        put = await client.put(
            f"{base}/{action_id}", headers=headers, json={"status": "ouverte"}
        )
        delete = await client.delete(f"{base}/{action_id}", headers=headers)
        add = await client.post(base, headers=headers, json={"description": "Tard"})
        assert put.status_code == 400
        assert delete.status_code == 400
        assert add.status_code == 400
        edl = await _get_edl(client, headers, lot.id)
        assert [a["status"] for a in edl["actions"]] == ["faite"]

    async def test_action_of_another_lot_is_404(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        lot = await _realised_lot(
            client, db_session, manager, headers, [{"description": "Porte"}]
        )
        other = await _realised_lot(client, db_session, manager, headers)
        action_id = (await _get_edl(client, headers, lot.id))["actions"][0]["id"]

        response = await client.put(
            f"/api/lots/{other.id}/edl/actions/{action_id}",
            headers=headers,
            json={"status": "faite"},
        )

        assert response.status_code == 404


class TestReadAndCounts:
    async def test_get_edl_404_without_edl(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, lot = await _sold_lot(client, db_session, manager, headers)

        response = await client.get(f"/api/lots/{lot.id}/edl", headers=headers)

        assert response.status_code == 404

    async def test_dashboard_counts_edl_lot_as_sold(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        auth_headers: Headers,
    ) -> None:
        project = await make_project(
            db_session, manager, enabled_optional_statuses=WITH_EDL
        )
        await make_lot(db_session, project, status="edl_realise", numero="E1")
        await make_lot(db_session, project, status="available", numero="E2")
        headers = auth_headers(manager)

        stats = await client.get(
            "/api/dashboard/stats", headers=headers, params={"project_id": project.id}
        )
        project_body = await client.get(f"/api/projects/{project.id}", headers=headers)

        assert stats.status_code == 200, stats.json()
        counts = stats.json()["counts"]
        assert counts["edl_realise"] == 1
        assert counts["edl_programme"] == 0
        assert counts["edl_finalise"] == 0
        assert counts["en_cours"] == 1
        assert project_body.json()["sold_lots"] == 1

    async def test_lot_list_filters_on_edl_status(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        auth_headers: Headers,
    ) -> None:
        project = await make_project(
            db_session, manager, enabled_optional_statuses=WITH_EDL
        )
        await make_lot(db_session, project, status="edl_programme", numero="F1")
        await make_lot(db_session, project, status="available", numero="F2")

        response = await client.get(
            "/api/lots",
            headers=auth_headers(manager),
            params={"project_id": project.id, "status": "edl_programme"},
        )

        assert response.status_code == 200, response.json()
        assert [lot["numero"] for lot in response.json()["items"]] == ["F1"]

    async def test_notaire_alerts_include_edl_finalise(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        lot = await _realised_lot(client, db_session, manager, headers)
        await _post(client, headers, lot.id, "edl-finalize")
        await _post(
            client, headers, lot.id, "set-notaire-intent", {"wants_notaire": True}
        )

        response = await client.get(
            "/api/dashboard/notaire-alerts", headers=auth_headers(manager)
        )

        assert response.status_code == 200
        assert [a["lot_id"] for a in response.json()] == [lot.id]

    async def test_notaire_alerts_exclude_soldee_on_edl_project(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, lot = await _sold_lot(client, db_session, manager, headers)
        await _post(
            client, headers, lot.id, "set-notaire-intent", {"wants_notaire": True}
        )

        response = await client.get(
            "/api/dashboard/notaire-alerts", headers=auth_headers(manager)
        )

        assert response.status_code == 200
        assert response.json() == []

    async def test_notaire_alerts_include_soldee_on_default_project(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, lot = await _sold_lot(
            client,
            db_session,
            manager,
            headers,
            enabled=["option", "reservation_a_finaliser"],
        )
        await _post(
            client, headers, lot.id, "set-notaire-intent", {"wants_notaire": True}
        )

        response = await client.get(
            "/api/dashboard/notaire-alerts", headers=auth_headers(manager)
        )

        assert response.status_code == 200
        assert [a["lot_id"] for a in response.json()] == [lot.id]

    async def test_geojson_carries_edl_summary(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        lot = await _realised_lot(
            client,
            db_session,
            manager,
            headers,
            [{"description": "Volet"}, {"description": "Robinet"}],
        )

        response = await client.get(
            f"/api/projects/{lot.project_id}/lots.geojson",
            headers=auth_headers(manager),
        )

        assert response.status_code == 200, response.json()
        [feature] = response.json()["features"]
        properties = feature["properties"]
        assert properties["edl_intervenant"] == "M. Expert"
        assert properties["edl_open_actions_count"] == 2
        assert properties["edl_scheduled_at"] is not None

    async def test_edl_hidden_once_lot_back_to_available(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        """Blocking then unblocking keeps current_reservation_id: the old EDL
        must not show on an available lot."""
        headers = auth_headers(commercial)
        lot = await _realised_lot(
            client, db_session, manager, headers, [{"description": "Volet"}]
        )
        manager_headers = auth_headers(manager)
        block = await _post(client, manager_headers, lot.id, "block", {})
        assert block.status_code == 200, block.json()
        unblock = await _post(client, manager_headers, lot.id, "unblock")
        assert unblock.status_code == 200, unblock.json()

        edl = await client.get(f"/api/lots/{lot.id}/edl", headers=headers)
        geojson = await client.get(
            f"/api/projects/{lot.project_id}/lots.geojson", headers=manager_headers
        )

        assert edl.status_code == 404
        [feature] = geojson.json()["features"]
        properties = feature["properties"]
        assert properties["status"] == "available"
        assert properties.get("edl_intervenant") is None
        assert properties.get("edl_open_actions_count") is None
        assert properties.get("edl_scheduled_at") is None

    async def test_openapi_documents_edl_contract(self, app: FastAPI) -> None:
        schema = app.openapi()

        action_status = schema["components"]["schemas"]["EdlActionResponse"][
            "properties"
        ]["status"]
        alerts = schema["paths"]["/api/dashboard/notaire-alerts"]["get"]

        assert action_status.get("enum") == ["ouverte", "faite"]
        assert "edl_finalise" in alerts["description"]


class TestDisableInUse:
    """Carried from task 2: refusals leave the project setting unchanged."""

    async def test_disable_raf_refused_when_lot_in_raf(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        auth_headers: Headers,
    ) -> None:
        project = await make_project(db_session, manager)
        await make_lot(
            db_session, project, status="reservation_a_finaliser", numero="B1"
        )
        headers = auth_headers(manager)

        response = await _put_workflow(client, headers, project.id, ["option"])

        assert response.status_code == 400
        assert response.json()["message"] == (
            "Impossible de désactiver « Réservation à finaliser » : "
            "lots concernés : B1."
        )
        assert response.json()["details"][0]["rule"] == "status_in_use"
        again = await client.get(f"/api/projects/{project.id}", headers=headers)
        assert again.json()["enabled_optional_statuses"] == [
            "option",
            "reservation_a_finaliser",
        ]

    async def test_disable_edl_refused_when_lot_in_edl_programme(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        auth_headers: Headers,
    ) -> None:
        project = await make_project(
            db_session, manager, enabled_optional_statuses=WITH_EDL
        )
        await make_lot(db_session, project, status="edl_programme", numero="C1")
        headers = auth_headers(manager)

        response = await _put_workflow(
            client, headers, project.id, ["option", "reservation_a_finaliser"]
        )

        assert response.status_code == 400
        assert response.json()["message"] == (
            "Impossible de désactiver « État des lieux » : lots concernés : C1."
        )
        assert response.json()["details"][0]["rule"] == "status_in_use"
        again = await client.get(f"/api/projects/{project.id}", headers=headers)
        assert again.json()["enabled_optional_statuses"] == WITH_EDL
