"""Paying the last installment no longer converts the lot (issue #50).

Before the fix, ``PATCH /api/payments/installments/{id}`` on the last unpaid
installment wrote the obsolete ``sold`` lot status (500). Decision: the lot
stays ``reservation_engagee``; the commercial then uses « Marquer soldé ».
Since E4-T5 (R6) the PATCH no longer marks an installment paid at all: money
is recorded as payments (encaissements). The legacy ``POST /api/sales`` is
refused (400).
"""

from collections.abc import Callable
from datetime import UTC, datetime
from typing import get_args

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.schemas.reservation import PAYMENT_TYPE
from app.infrastructure.database.models import (
    LotModel,
    LotStatusHistoryModel,
    PaymentInstallmentModel,
    ReservationModel,
    ReservationPaymentModel,
    SaleModel,
    UserModel,
)
from app.tests.factories import make_client, make_lot, make_project

pytestmark = pytest.mark.integration

Headers = Callable[[UserModel], dict[str, str]]


async def _count(db_session: AsyncSession, model: type) -> int:
    return (
        await db_session.execute(select(func.count()).select_from(model))
    ).scalar_one()


@pytest.fixture
async def engaged_lot(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    commercial: UserModel,
    auth_headers: Headers,
) -> LotModel:
    """A ``reservation_engagee`` lot with a 1 deposit + 1 balance schedule."""
    project = await make_project(db_session, manager)
    lot = await make_lot(db_session, project, status="available")
    # No e-mail: the payment confirmation e-mail is skipped.
    buyer = await make_client(db_session, manager, email=None)
    response = await client.post(
        f"/api/lots/{lot.id}/transitions/direct-engage",
        headers=auth_headers(commercial),
        json={
            "client_id": buyer.id,
            "guarantee_amount": 50000,
            "payment_type": get_args(PAYMENT_TYPE)[0],
            "payment_plan": {"deposit_count": 1, "balance_count": 1},
        },
    )
    assert response.status_code == 200, response.json()
    return lot


async def _installment_ids(
    client: AsyncClient, headers: dict[str, str], reservation_id: int
) -> list[int]:
    response = await client.get(
        f"/api/payments/schedules/reservation/{reservation_id}", headers=headers
    )
    assert response.status_code == 200, response.json()
    installments = sorted(
        response.json()["installments"],
        key=lambda i: (i["payment_type"] != "deposit", i["installment_number"]),
    )
    return [i["id"] for i in installments]


async def _pay_all_installments(
    db_session: AsyncSession, reservation_id: int, installment_ids: list[int]
) -> None:
    """Record one payment per installment (the payment API comes in E4-T5b)."""
    for installment_id in installment_ids:
        installment = await db_session.get(PaymentInstallmentModel, installment_id)
        assert installment is not None
        db_session.add(
            ReservationPaymentModel(
                reservation_id=reservation_id,
                installment_id=installment_id,
                amount=installment.amount,
                paid_on=datetime.now(UTC).date(),
                method="transfer",
            )
        )
    await db_session.commit()


class TestLastInstallmentPaid:
    async def test_patch_paid_refused_and_lot_unchanged(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        commercial: UserModel,
        auth_headers: Headers,
        engaged_lot: LotModel,
    ) -> None:
        headers = auth_headers(commercial)
        await db_session.refresh(engaged_lot)
        reservation_id = engaged_lot.current_reservation_id
        assert reservation_id is not None
        installment_ids = await _installment_ids(client, headers, reservation_id)
        assert len(installment_ids) == 2
        history_before = await _count(db_session, LotStatusHistoryModel)

        responses = [
            await client.patch(
                f"/api/payments/installments/{installment_id}",
                headers=headers,
                json={"status": "paid"},
            )
            for installment_id in installment_ids
        ]

        assert [r.status_code for r in responses] == [400, 400]
        assert {r.json()["details"][0]["rule"] for r in responses} == {
            "use_payment_record"
        }
        await db_session.refresh(engaged_lot)
        assert engaged_lot.status == "reservation_engagee"
        assert engaged_lot.current_reservation_id == reservation_id
        assert await _count(db_session, LotStatusHistoryModel) == history_before
        assert await _count(db_session, SaleModel) == 0
        reservation = await db_session.get(ReservationModel, reservation_id)
        assert reservation is not None
        await db_session.refresh(reservation)
        assert reservation.status != "converted"

    async def test_solde_still_possible_after_full_payment(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        commercial: UserModel,
        auth_headers: Headers,
        engaged_lot: LotModel,
    ) -> None:
        headers = auth_headers(commercial)
        await db_session.refresh(engaged_lot)
        reservation_id = engaged_lot.current_reservation_id
        assert reservation_id is not None
        await _pay_all_installments(
            db_session,
            reservation_id,
            await _installment_ids(client, headers, reservation_id),
        )

        response = await client.post(
            f"/api/lots/{engaged_lot.id}/transitions/solde",
            headers=headers,
            json={"price": 500000},
        )

        assert response.status_code == 200, response.json()
        await db_session.refresh(engaged_lot)
        assert engaged_lot.status == "reservation_soldee"
        assert await _count(db_session, SaleModel) == 1


class TestLegacySaleEndpoint:
    async def test_post_sales_is_refused(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        auth_headers: Headers,
    ) -> None:
        project = await make_project(db_session, manager)
        lot = await make_lot(db_session, project, status="available")
        buyer = await make_client(db_session, manager)

        response = await client.post(
            "/api/sales",
            headers=auth_headers(manager),
            json={"lot_id": lot.id, "client_id": buyer.id, "price": 500000},
        )

        assert response.status_code == 400
        body = response.json()
        assert body["details"][0]["rule"] == "use_transition_endpoint"
        assert body["message"] == (
            "Les ventes se font via le workflow de statuts (Marquer soldé)."
        )
        await db_session.refresh(lot)
        assert lot.status == "available"
        assert await _count(db_session, SaleModel) == 0
