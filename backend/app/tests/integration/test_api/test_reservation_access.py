"""E4 final review: the reservation finance / deed endpoints are role-guarded.

``client`` users never reach them; regenerating the archived deed is reserved
to the reservation's commercial and the managers (same rule as payments and
the engagement edit).
"""

from collections.abc import Callable
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.models import UserModel
from app.services.email_service import EmailService
from app.tests.factories import make_client, make_lot, make_project, make_user

pytestmark = pytest.mark.integration

Headers = Callable[[UserModel], dict[str, str]]

ACTE_OWNER_ONLY = (
    "Seuls le commercial auteur de la réservation et les managers "
    "peuvent régénérer l'acte."
)


@pytest.fixture(autouse=True)
def no_payment_email(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _skip(*_args: Any, **_kwargs: Any) -> bool:
        return True

    monkeypatch.setattr(EmailService, "send_payment_confirmation", _skip)


async def _engaged_by(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    headers: dict[str, str],
) -> int:
    """Direct-engage a 500 000 lot (50 000 received: the deed is archived)."""
    project = await make_project(db_session, manager)
    lot = await make_lot(db_session, project, status="available", price=500000)
    buyer = await make_client(db_session, manager)
    response = await client.post(
        f"/api/lots/{lot.id}/transitions/direct-engage",
        headers=headers,
        json={"client_id": buyer.id, "guarantee_amount": 50000, "payment_type": "cash"},
    )
    assert response.status_code == 200, response.text
    return response.json()["id"]


@pytest.mark.parametrize(
    ("method", "suffix"),
    [
        ("post", "acte"),
        ("get", "acte"),
        ("get", "payments"),
        ("get", "financial-summary"),
        ("get", "changes"),
    ],
)
async def test_client_role_is_refused(
    method: str,
    suffix: str,
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    commercial: UserModel,
    auth_headers: Headers,
) -> None:
    reservation_id = await _engaged_by(
        client, db_session, manager, auth_headers(commercial)
    )
    client_user = await make_user(db_session, role="client")

    response = await getattr(client, method)(
        f"/api/reservations/{reservation_id}/{suffix}",
        headers=auth_headers(client_user),
    )

    assert response.status_code == 403, response.text


@pytest.mark.parametrize(
    ("method", "suffix"),
    [
        ("get", "acte"),
        ("get", "payments"),
        ("get", "financial-summary"),
        ("get", "changes"),
    ],
)
async def test_commercial_and_manager_can_read(
    method: str,
    suffix: str,
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    commercial: UserModel,
    other_commercial: UserModel,
    auth_headers: Headers,
) -> None:
    reservation_id = await _engaged_by(
        client, db_session, manager, auth_headers(commercial)
    )

    for user in (commercial, other_commercial, manager):
        response = await getattr(client, method)(
            f"/api/reservations/{reservation_id}/{suffix}",
            headers=auth_headers(user),
        )
        assert response.status_code == 200, (user.email, response.text)


async def test_regenerate_acte_refused_to_another_commercial(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    commercial: UserModel,
    other_commercial: UserModel,
    auth_headers: Headers,
) -> None:
    reservation_id = await _engaged_by(
        client, db_session, manager, auth_headers(commercial)
    )

    response = await client.post(
        f"/api/reservations/{reservation_id}/acte",
        headers=auth_headers(other_commercial),
    )

    assert response.status_code == 403
    assert response.json()["message"] == ACTE_OWNER_ONLY


async def test_regenerate_acte_allowed_to_owner_and_manager(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    commercial: UserModel,
    auth_headers: Headers,
) -> None:
    reservation_id = await _engaged_by(
        client, db_session, manager, auth_headers(commercial)
    )

    for user in (commercial, manager):
        response = await client.post(
            f"/api/reservations/{reservation_id}/acte", headers=auth_headers(user)
        )
        assert response.status_code == 201, (user.email, response.text)
