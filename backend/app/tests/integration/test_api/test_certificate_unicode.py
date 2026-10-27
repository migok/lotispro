"""The deed and receipt downloads must survive non-Latin-1 client data."""

from collections.abc import Callable

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.models import (
    LotModel,
    ReservationModel,
    UserModel,
)
from app.tests.factories import make_client, make_lot, make_project

pytestmark = pytest.mark.integration

Headers = Callable[[UserModel], dict[str, str]]


@pytest.fixture
async def reservation_id(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    commercial: UserModel,
    auth_headers: Headers,
) -> int:
    """An engaged reservation whose client lives abroad (typographic quotes)."""
    project = await make_project(db_session, manager)
    lot: LotModel = await make_lot(db_session, project, status="available")
    buyer = await make_client(
        db_session,
        manager,
        last_name="Benali",
        first_name="Aïcha",
        address_abroad="12 rue de l’Église",
        city_abroad="Abidjan",
        country_abroad="Côte d’Ivoire",
        acte_address="abroad",
    )
    response = await client.post(
        f"/api/lots/{lot.id}/transitions/direct-engage",
        headers=auth_headers(commercial),
        json={
            "client_id": buyer.id,
            "guarantee_amount": 50000,
            "payment_type": "cash",
        },
    )
    assert response.status_code == 200, response.text
    result = await db_session.execute(
        select(ReservationModel.id).where(ReservationModel.lot_id == lot.id)
    )
    return result.scalar_one()


async def test_certificate_with_unicode_address_returns_pdf(
    client: AsyncClient,
    commercial: UserModel,
    auth_headers: Headers,
    reservation_id: int,
) -> None:
    resp = await client.get(
        f"/api/reservations/{reservation_id}/certificate",
        headers=auth_headers(commercial),
    )

    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF")


async def test_receipt_with_unicode_address_returns_pdf(
    client: AsyncClient,
    commercial: UserModel,
    auth_headers: Headers,
    reservation_id: int,
) -> None:
    resp = await client.get(
        f"/api/reservations/{reservation_id}/receipt",
        headers=auth_headers(commercial),
    )

    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF")
