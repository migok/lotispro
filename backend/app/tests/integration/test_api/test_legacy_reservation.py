"""Reservations engaged before E4-T5 (« legacy »): no invented amounts.

A legacy reservation has no ``agreed_total_price``. Its financial summary is
flagged ``legacy`` with the new-model amounts set to ``null``, and recording a
payment or editing the engagement is refused before anything is written.
"""

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.reservation_amounts import is_legacy
from app.infrastructure.database.models import (
    PaymentInstallmentModel,
    PaymentScheduleModel,
    ReservationChangeModel,
    ReservationModel,
    ReservationPaymentModel,
    UserModel,
)
from app.services.email_service import EmailService
from app.tests.factories import make_client, make_lot, make_project

pytestmark = pytest.mark.integration

Headers = Callable[[UserModel], dict[str, str]]

LEGACY_MESSAGE = (
    "Réservation engagée avant la nouvelle gestion des montants : "
    "cette action n'est pas disponible."
)

REFERENCE = {
    "guarantee_amount": 100000,
    "payment_type": "transfer",
    "agreed_total_price": 500000,
    "sale_price": 450000,
    "gap_due_timing": "fin",
    "payment_plan": {
        "deposit_pct": 50,
        "deposit_count": 1,
        "balance_count": 2,
        "balance_periodicity": 1,
    },
}

NEW_MODEL_AMOUNTS = (
    "agreed_total_price",
    "acte_price",
    "gap_amount",
    "first_payment",
    "total_received",
    "remaining",
    "acte_threshold_amount",
)


@pytest.fixture(autouse=True)
def no_real_email(monkeypatch: pytest.MonkeyPatch) -> None:
    def _refuse(*_args: Any, **_kwargs: Any) -> None:
        raise AssertionError("Resend must not be called in tests")

    async def _sent(*_args: Any, **_kwargs: Any) -> bool:
        return True

    monkeypatch.setattr("resend.Emails.send", _refuse)
    monkeypatch.setattr(EmailService, "send_payment_confirmation", _sent)


async def _engaged(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    headers: dict[str, str],
) -> int:
    project = await make_project(db_session, manager)
    lot = await make_lot(db_session, project, status="available", price=500000)
    buyer = await make_client(db_session, manager, email="buyer@example.com")
    response = await client.post(
        f"/api/lots/{lot.id}/transitions/direct-engage",
        headers=headers,
        json={"client_id": buyer.id, **REFERENCE},
    )
    assert response.status_code == 200, response.text
    return response.json()["id"]


async def _make_legacy(db_session: AsyncSession, reservation_id: int) -> None:
    """What a reservation engaged before E4-T5 looks like in the database."""
    await db_session.execute(
        delete(ReservationPaymentModel).where(
            ReservationPaymentModel.reservation_id == reservation_id
        )
    )
    await db_session.execute(
        update(ReservationModel)
        .where(ReservationModel.id == reservation_id)
        .values(agreed_total_price=None, gap_due_timing=None, gap_due_date=None)
    )
    await db_session.commit()


async def _summary(
    client: AsyncClient, headers: dict[str, str], reservation_id: int
) -> dict[str, Any]:
    response = await client.get(
        f"/api/reservations/{reservation_id}/financial-summary", headers=headers
    )
    assert response.status_code == 200, response.text
    return response.json()


async def _count(db_session: AsyncSession, model: Any, reservation_id: int) -> int:
    return (
        await db_session.execute(
            select(func.count()).where(model.reservation_id == reservation_id)
        )
    ).scalar_one()


async def _reservation(db_session: AsyncSession, reservation_id: int) -> Any:
    return (
        await db_session.execute(
            select(ReservationModel)
            .where(ReservationModel.id == reservation_id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one()


async def _installment_statuses(
    db_session: AsyncSession, ids: list[int]
) -> list[tuple[int, str, Any]]:
    rows = await db_session.execute(
        select(
            PaymentInstallmentModel.id,
            PaymentInstallmentModel.status,
            PaymentInstallmentModel.amount,
        )
        .where(PaymentInstallmentModel.id.in_(ids))
        .order_by(PaymentInstallmentModel.id)
        .execution_options(populate_existing=True)
    )
    return [tuple(row) for row in rows.all()]


class TestIsLegacy:
    def test_predicate(self) -> None:
        assert is_legacy(None) is True
        assert is_legacy(500000.0) is False
        assert is_legacy(0.0) is False


class TestLegacySummary:
    async def test_new_reservation_is_not_legacy(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        reservation_id = await _engaged(client, db_session, manager, headers)

        summary = await _summary(client, headers, reservation_id)

        assert summary["legacy"] is False
        assert summary["agreed_total_price"] == 500000
        assert summary["remaining"] == 400000

    async def test_legacy_reservation_amounts_are_null(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        reservation_id = await _engaged(client, db_session, manager, headers)
        await _make_legacy(db_session, reservation_id)
        # Marked paid under the old model (no payment row).
        first = (
            (
                await db_session.execute(
                    select(PaymentInstallmentModel)
                    .join(
                        PaymentScheduleModel,
                        PaymentScheduleModel.id == PaymentInstallmentModel.schedule_id,
                    )
                    .where(
                        PaymentScheduleModel.reservation_id == reservation_id,
                        PaymentInstallmentModel.payment_type == "deposit",
                    )
                )
            )
            .scalars()
            .first()
        )
        first.status = "paid"
        await db_session.commit()

        summary = await _summary(client, headers, reservation_id)

        assert summary["legacy"] is True
        for field in NEW_MODEL_AMOUNTS:
            assert summary[field] is None, field
        # Same shape; what is really stored is still returned.
        assert summary["catalogue_price"] == 500000
        assert summary["gap_due_timing"] is None
        assert isinstance(summary["acte_available"], bool)
        assert summary["updated_at"]
        assert [i["payment_type"] for i in summary["installments"]] == [
            "deposit",
            "balance",
            "balance",
            "gap",
        ]
        assert summary["installments"][0]["amount"] == 150000
        assert summary["installments"][0]["status"] == "paid"
        assert summary["installments"][1]["status"] == "pending"


class TestLegacyWritesRefused:
    async def test_record_payment_400_nothing_written(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        reservation_id = await _engaged(client, db_session, manager, headers)
        await _make_legacy(db_session, reservation_id)
        summary = await _summary(client, headers, reservation_id)
        ids = [i["id"] for i in summary["installments"]]
        before = await _installment_statuses(db_session, ids)

        response = await client.post(
            f"/api/reservations/{reservation_id}/payments",
            headers=headers,
            data={
                "amount": "1000",
                "paid_on": str(datetime.now(UTC).date()),
                "method": "transfer",
                "installment_id": str(ids[0]),
            },
        )

        assert response.status_code == 400, response.text
        body = response.json()
        assert body["message"] == LEGACY_MESSAGE
        assert body["details"][0]["rule"] == "legacy_reservation"
        assert await _count(db_session, ReservationPaymentModel, reservation_id) == 0
        assert await _installment_statuses(db_session, ids) == before

    async def test_edit_engagement_400_nothing_written(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        reservation_id = await _engaged(client, db_session, manager, headers)
        await _make_legacy(db_session, reservation_id)
        summary = await _summary(client, headers, reservation_id)
        ids = [i["id"] for i in summary["installments"]]
        before_installments = await _installment_statuses(db_session, ids)
        before_updated_at = (await _reservation(db_session, reservation_id)).updated_at

        response = await client.put(
            f"/api/reservations/{reservation_id}/engagement",
            headers=headers,
            json={
                "agreed_total_price": 500000,
                "sale_price": 450000,
                "gap_due_timing": "fin",
                "gap_due_date": None,
                "notes": None,
                "installments": [
                    {
                        "id": i["id"],
                        "amount": i["amount"],
                        "due_date": i["due_date"][:10],
                    }
                    for i in summary["installments"]
                    if i["payment_type"] != "gap"
                ],
                "reason": "Mise à jour",
                "expected_updated_at": summary["updated_at"],
            },
        )

        assert response.status_code == 400, response.text
        body = response.json()
        assert body["message"] == LEGACY_MESSAGE
        assert body["details"][0]["rule"] == "legacy_reservation"
        reservation = await _reservation(db_session, reservation_id)
        assert reservation.agreed_total_price is None
        assert reservation.gap_due_timing is None
        assert reservation.updated_at == before_updated_at
        assert await _count(db_session, ReservationChangeModel, reservation_id) == 0
        assert await _installment_statuses(db_session, ids) == before_installments
