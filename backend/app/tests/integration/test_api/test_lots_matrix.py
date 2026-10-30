"""GET /api/projects/{id}/lots-matrix: lot type x status counts."""

from collections.abc import Callable

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.models import UserModel
from app.tests.factories import assign, make_lot, make_project

pytestmark = pytest.mark.integration

Headers = Callable[[UserModel], dict[str, str]]


def _url(project_id: int) -> str:
    return f"/api/projects/{project_id}/lots-matrix"


async def test_matrix_counts_by_type_and_status(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
) -> None:
    project = await make_project(db_session, manager)
    for _ in range(2):
        await make_lot(db_session, project, status="available", type_lot="Villa")
    await make_lot(db_session, project, status="option", type_lot="Villa")
    await make_lot(
        db_session, project, status="reservation_engagee", type_lot="Appartement"
    )

    response = await client.get(_url(project.id), headers=auth_headers(manager))

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["rows"][0]["type_lot"] == "Appartement"
    assert body["rows"][0]["counts"]["reservation_engagee"] == 1
    assert body["rows"][0]["total"] == 1
    assert body["rows"][1]["type_lot"] == "Villa"
    assert body["rows"][1]["counts"]["available"] == 2
    assert body["rows"][1]["total"] == 3
    assert body["totals"]["option"] == 1
    assert body["grand_total"] == 4
    assert set(body["totals"]) == set(body["statuses"])


async def test_blank_and_null_types_grouped_last(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
) -> None:
    project = await make_project(db_session, manager)
    for type_lot in (None, "", "  ", " Villa ", "Villa"):
        await make_lot(db_session, project, type_lot=type_lot)

    response = await client.get(_url(project.id), headers=auth_headers(manager))

    assert response.status_code == 200, response.text
    rows = response.json()["rows"]
    assert [(r["type_lot"], r["total"]) for r in rows] == [("Villa", 2), (None, 3)]


async def test_other_projects_lots_are_ignored(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
) -> None:
    project = await make_project(db_session, manager)
    other = await make_project(db_session, manager)
    await make_lot(db_session, project, type_lot="Villa")
    await make_lot(db_session, other, type_lot="Villa")
    await make_lot(db_session, other, type_lot="Terrain")

    response = await client.get(_url(project.id), headers=auth_headers(manager))

    assert response.status_code == 200, response.text
    body = response.json()
    assert [r["type_lot"] for r in body["rows"]] == ["Villa"]
    assert body["grand_total"] == 1


async def test_unassigned_commercial_forbidden(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    commercial: UserModel,
    auth_headers: Headers,
) -> None:
    project = await make_project(db_session, manager, visibility="private")

    response = await client.get(_url(project.id), headers=auth_headers(commercial))

    assert response.status_code == 403
    assert "Vous n'avez pas accès à ce projet." in response.text


async def test_geojson_unassigned_commercial_forbidden_in_french(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    commercial: UserModel,
    auth_headers: Headers,
) -> None:
    """The Lots tab loads the matrix and the geojson together: both must say the same thing."""
    project = await make_project(db_session, manager, visibility="private")

    response = await client.get(
        f"/api/projects/{project.id}/lots.geojson", headers=auth_headers(commercial)
    )

    assert response.status_code == 403
    assert "Vous n'avez pas accès à ce projet." in response.text


async def test_assigned_commercial_allowed(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    commercial: UserModel,
    auth_headers: Headers,
) -> None:
    project = await make_project(db_session, manager, visibility="private")
    await assign(db_session, commercial, project)
    await make_lot(db_session, project, type_lot="Villa")

    response = await client.get(_url(project.id), headers=auth_headers(commercial))

    assert response.status_code == 200, response.text
    assert response.json()["grand_total"] == 1


async def test_unknown_project_404(
    client: AsyncClient, manager: UserModel, auth_headers: Headers
) -> None:
    response = await client.get(_url(999999), headers=auth_headers(manager))

    assert response.status_code == 404


async def test_requires_authentication(
    client: AsyncClient, db_session: AsyncSession, manager: UserModel
) -> None:
    project = await make_project(db_session, manager)

    response = await client.get(_url(project.id))

    assert response.status_code == 401
