"""E4-T5a: agreed total price, gap installment and first payment at engagement."""

from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.models import (
    LotModel,
    PaymentInstallmentModel,
    PaymentScheduleModel,
    ReservationModel,
    ReservationPaymentModel,
    SaleModel,
    UserModel,
)
from app.tests.factories import make_client, make_lot, make_project

pytestmark = pytest.mark.integration

Headers = Callable[[UserModel], dict[str, str]]

# Reference example of the spec: agreed 500 000, deed 450 000, gap 50 000 at
# the end, first payment 100 000, 50 % deposit plan.
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


def _today() -> date:
    return datetime.now(UTC).date()


def _as_date(value: datetime) -> date:
    return value.date()


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


async def _available_lot(
    db_session: AsyncSession, manager: UserModel, **project_fields: Any
) -> tuple[LotModel, int]:
    project = await make_project(db_session, manager, **project_fields)
    lot = await make_lot(db_session, project, status="available", price=500000)
    buyer = await make_client(db_session, manager, email=None)
    return lot, buyer.id


async def _direct_engage(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    headers: dict[str, str],
    **payload: Any,
) -> tuple[LotModel, int]:
    lot, buyer_id = await _available_lot(db_session, manager)
    response = await _transition(
        client, headers, lot.id, "direct-engage", {"client_id": buyer_id, **payload}
    )
    assert response.status_code == 200, response.text
    return lot, response.json()["id"]


async def _payments(
    db_session: AsyncSession, reservation_id: int
) -> list[ReservationPaymentModel]:
    result = await db_session.execute(
        select(ReservationPaymentModel)
        .where(ReservationPaymentModel.reservation_id == reservation_id)
        .order_by(ReservationPaymentModel.id)
    )
    return list(result.scalars().all())


async def _installments(
    db_session: AsyncSession, reservation_id: int
) -> list[PaymentInstallmentModel]:
    result = await db_session.execute(
        select(PaymentInstallmentModel)
        .join(PaymentScheduleModel)
        .where(PaymentScheduleModel.reservation_id == reservation_id)
        .order_by(PaymentInstallmentModel.id)
    )
    return list(result.scalars().all())


def _by_type(
    installments: list[PaymentInstallmentModel], payment_type: str
) -> list[PaymentInstallmentModel]:
    return [i for i in installments if i.payment_type == payment_type]


def _total(installments: list[PaymentInstallmentModel]) -> float:
    return round(sum(i.amount for i in installments), 2)


async def _pay(
    db_session: AsyncSession,
    reservation_id: int,
    installments: list[PaymentInstallmentModel],
) -> None:
    """Record one payment covering each installment (Task 6 adds the API)."""
    for installment in installments:
        db_session.add(
            ReservationPaymentModel(
                reservation_id=reservation_id,
                installment_id=installment.id,
                amount=installment.amount,
                paid_on=_today(),
                method="transfer",
            )
        )
    await db_session.commit()


class TestEngagementAmounts:
    async def test_direct_engage_records_first_payment_and_schedule(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        _, reservation_id = await _direct_engage(
            client, db_session, manager, auth_headers(commercial), **REFERENCE
        )

        reservation = await db_session.get(ReservationModel, reservation_id)
        assert reservation is not None
        await db_session.refresh(reservation)
        assert reservation.agreed_total_price == 500000
        assert reservation.sale_price == 450000
        assert reservation.gap_due_timing == "fin"
        assert reservation.gap_due_date is None
        assert reservation.promotion_amount is None

        payments = await _payments(db_session, reservation_id)
        assert len(payments) == 1
        first = payments[0]
        assert first.amount == 100000
        assert first.installment_id is None
        assert first.paid_on == _today()
        assert first.method == "transfer"
        assert first.recorded_by_user_id == commercial.id

        installments = await _installments(db_session, reservation_id)
        deposits = _by_type(installments, "deposit")
        balances = _by_type(installments, "balance")
        gaps = _by_type(installments, "gap")
        assert _total(deposits) == 150000
        assert _total(balances) == 200000
        assert len(balances) == 2
        assert _total(deposits + balances) == 350000
        assert len(gaps) == 1
        assert gaps[0].amount == 50000
        assert gaps[0].due_date == max(b.due_date for b in balances)
        assert all(i.status == "pending" for i in installments)
        assert _total(installments) == 400000

    async def test_response_exposes_amounts(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        lot, buyer_id = await _available_lot(db_session, manager)

        response = await _transition(
            client,
            auth_headers(commercial),
            lot.id,
            "direct-engage",
            {"client_id": buyer_id, **REFERENCE},
        )

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["agreed_total_price"] == 500000
        assert body["sale_price"] == 450000
        assert body["gap_amount"] == 50000
        assert body["gap_due_timing"] == "fin"
        assert body["gap_due_date"] is None

    async def test_engage_without_plan_creates_minimal_schedule(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        _, reservation_id = await _direct_engage(
            client,
            db_session,
            manager,
            auth_headers(commercial),
            guarantee_amount=100000,
            payment_type="cash",
            sale_price=450000,
        )

        reservation = await db_session.get(ReservationModel, reservation_id)
        assert reservation is not None
        await db_session.refresh(reservation)
        # Agreed total defaults to the catalogue price, the gap to the end.
        assert reservation.agreed_total_price == 500000
        assert reservation.gap_due_timing == "fin"
        installments = await _installments(db_session, reservation_id)
        assert [(i.payment_type, i.amount) for i in installments] == [
            ("balance", 350000),
            ("gap", 50000),
        ]
        balance, gap = installments
        assert _as_date(balance.due_date) == _today()
        assert gap.due_date == balance.due_date
        assert [p.amount for p in await _payments(db_session, reservation_id)] == [
            100000
        ]

    async def test_defaults_without_any_amount(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        """No pricing grid: deed price = agreed total = catalogue, no gap."""
        _, reservation_id = await _direct_engage(
            client,
            db_session,
            manager,
            auth_headers(commercial),
            guarantee_amount=50000,
            payment_type="cash",
        )

        reservation = await db_session.get(ReservationModel, reservation_id)
        assert reservation is not None
        await db_session.refresh(reservation)
        assert reservation.agreed_total_price == 500000
        assert reservation.sale_price == 500000
        installments = await _installments(db_session, reservation_id)
        assert [(i.payment_type, i.amount) for i in installments] == [
            ("balance", 450000)
        ]

    async def test_gap_at_start_and_at_a_date(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, at_start = await _direct_engage(
            client,
            db_session,
            manager,
            headers,
            **{**REFERENCE, "gap_due_timing": "debut"},
        )
        gap_date = _today() + timedelta(days=40)
        _, at_date = await _direct_engage(
            client,
            db_session,
            manager,
            headers,
            **{
                **REFERENCE,
                "gap_due_timing": "date",
                "gap_due_date": gap_date.isoformat(),
            },
        )

        start_installments = await _installments(db_session, at_start)
        (start_gap,) = _by_type(start_installments, "gap")
        assert _as_date(start_gap.due_date) == _today()
        assert _total(_by_type(start_installments, "deposit")) == 100000
        assert _total(_by_type(start_installments, "balance")) == 250000

        date_installments = await _installments(db_session, at_date)
        (date_gap,) = _by_type(date_installments, "gap")
        assert _as_date(date_gap.due_date) == gap_date
        reservation = await db_session.get(ReservationModel, at_date)
        assert reservation is not None
        await db_session.refresh(reservation)
        assert reservation.gap_due_date == gap_date

    async def test_gap_date_requires_date_422(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        lot, buyer_id = await _available_lot(db_session, manager)

        response = await _transition(
            client,
            auth_headers(commercial),
            lot.id,
            "direct-engage",
            {"client_id": buyer_id, **REFERENCE, "gap_due_timing": "date"},
        )

        assert response.status_code == 422
        messages = [d["message"] for d in response.json()["details"]]
        assert "Indiquez la date de l'écart." in messages
        await db_session.refresh(lot)
        assert lot.status == "available"

    async def test_acte_price_above_agreed_400(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        lot, buyer_id = await _available_lot(db_session, manager)

        response = await _transition(
            client,
            auth_headers(commercial),
            lot.id,
            "direct-engage",
            {**REFERENCE, "client_id": buyer_id, "agreed_total_price": 400000},
        )

        assert response.status_code == 400
        assert response.json()["message"] == (
            "Le prix figurant sur l'acte ne peut pas dépasser le prix total convenu."
        )
        assert response.json()["details"][0]["rule"] == "acte_price_above_agreed"
        await db_session.refresh(lot)
        assert lot.status == "available"
        reservations = (await db_session.execute(select(ReservationModel))).all()
        assert reservations == []

    async def test_first_payment_above_agreed_400(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        lot, buyer_id = await _available_lot(db_session, manager)

        response = await _transition(
            client,
            auth_headers(commercial),
            lot.id,
            "direct-engage",
            {**REFERENCE, "client_id": buyer_id, "guarantee_amount": 600000},
        )

        assert response.status_code == 400
        assert response.json()["details"][0]["rule"] == "first_payment_above_agreed"
        await db_session.refresh(lot)
        assert lot.status == "available"


class TestOtherEngagementPaths:
    async def test_finaliser_engage_deduct_uses_guarantee_as_first_payment(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        lot, buyer_id = await _available_lot(db_session, manager)
        prep = await _transition(
            client,
            headers,
            lot.id,
            "direct-reservation",
            {
                "client_id": buyer_id,
                "guarantee_amount": 100000,
                "payment_type": "check",
                "finalization_date": (
                    datetime.now(UTC) + timedelta(days=15)
                ).isoformat(),
            },
        )
        assert prep.status_code == 200, prep.text
        reservation_id = prep.json()["id"]

        response = await _transition(
            client,
            headers,
            lot.id,
            "engage",
            {
                "guarantee_action": "deduct",
                "agreed_total_price": 500000,
                "sale_price": 450000,
                "gap_due_timing": "fin",
                "payment_plan": REFERENCE["payment_plan"],
            },
        )

        assert response.status_code == 200, response.text
        payments = await _payments(db_session, reservation_id)
        assert [(p.amount, p.installment_id, p.method) for p in payments] == [
            (100000, None, "check")
        ]
        installments = await _installments(db_session, reservation_id)
        assert _total(_by_type(installments, "deposit")) == 150000
        assert _total(_by_type(installments, "balance")) == 200000
        assert _total(_by_type(installments, "gap")) == 50000

    async def test_finaliser_engage_refund_schedules_the_whole_agreed_price(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        lot, buyer_id = await _available_lot(db_session, manager)
        prep = await _transition(
            client,
            headers,
            lot.id,
            "direct-reservation",
            {
                "client_id": buyer_id,
                "guarantee_amount": 100000,
                "payment_type": "check",
                "finalization_date": (
                    datetime.now(UTC) + timedelta(days=15)
                ).isoformat(),
            },
        )
        reservation_id = prep.json()["id"]

        response = await _transition(
            client,
            headers,
            lot.id,
            "engage",
            {
                "guarantee_action": "refund",
                "refund_amount": 100000,
                "refund_date": _today().isoformat(),
                "sale_price": 450000,
            },
        )

        assert response.status_code == 200, response.text
        assert await _payments(db_session, reservation_id) == []
        installments = await _installments(db_session, reservation_id)
        assert [(i.payment_type, i.amount) for i in installments] == [
            ("balance", 450000),
            ("gap", 50000),
        ]

    async def test_option_engage_kept_option_deposit_is_recorded_as_received(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        lot, buyer_id = await _available_lot(
            db_session, manager, enabled_optional_statuses=["option"]
        )
        option = await _transition(
            client,
            headers,
            lot.id,
            "start-option",
            {
                "client_id": buyer_id,
                "expiration_date": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
                "deposit": 20000,
                "deposit_date": "2026-10-01",
            },
        )
        reservation_id = option.json()["id"]

        response = await _transition(
            client,
            headers,
            lot.id,
            "option-engage",
            {**REFERENCE, "deposit_action": "deduct"},
        )

        assert response.status_code == 200, response.text
        payments = await _payments(db_session, reservation_id)
        assert [(p.amount, p.installment_id, p.paid_on) for p in payments] == [
            (100000, None, _today()),
            (20000, None, date(2026, 10, 1)),
        ]
        installments = await _installments(db_session, reservation_id)
        # 500 000 x 50 % - 120 000 received at engagement.
        assert _total(_by_type(installments, "deposit")) == 130000
        assert _total(_by_type(installments, "balance")) == 200000
        assert _total(installments) == 380000


class TestSolde:
    async def test_solde_refused_while_amount_due(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        lot, reservation_id = await _direct_engage(
            client, db_session, manager, headers, **REFERENCE
        )

        refused = await _transition(client, headers, lot.id, "solde", {})

        assert refused.status_code == 400
        assert refused.json()["message"] == (
            "Reste à payer : 400 000 MAD — la réservation ne peut pas être soldée."
        )
        assert refused.json()["details"][0]["rule"] == "amount_still_due"

        installments = await _installments(db_session, reservation_id)
        await _pay(
            db_session,
            reservation_id,
            _by_type(installments, "deposit") + _by_type(installments, "balance"),
        )
        still_refused = await _transition(client, headers, lot.id, "solde", {})

        assert still_refused.status_code == 400
        assert still_refused.json()["message"] == (
            "Reste à payer : 50 000 MAD — la réservation ne peut pas être soldée."
        )
        await db_session.refresh(lot)
        assert lot.status == "reservation_engagee"

        await _pay(db_session, reservation_id, _by_type(installments, "gap"))
        accepted = await _transition(client, headers, lot.id, "solde", {})

        assert accepted.status_code == 200, accepted.text
        await db_session.refresh(lot)
        assert lot.status == "reservation_soldee"

    async def test_solde_sale_price_is_agreed_total(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        lot, _ = await _direct_engage(
            client,
            db_session,
            manager,
            headers,
            guarantee_amount=520000,
            payment_type="transfer",
            agreed_total_price=520000,
            sale_price=450000,
        )

        response = await _transition(client, headers, lot.id, "solde", {"price": 1})

        assert response.status_code == 200, response.text
        assert response.json()["price"] == 520000
        sale = (await db_session.execute(select(SaleModel))).scalar_one()
        assert sale.price == 520000


class TestInstallmentPatch:
    async def test_patch_installment_paid_rejected(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _direct_engage(
            client, db_session, manager, headers, **REFERENCE
        )
        first = _by_type(await _installments(db_session, reservation_id), "deposit")[0]

        response = await client.patch(
            f"/api/payments/installments/{first.id}",
            headers=headers,
            json={"status": "paid"},
        )

        assert response.status_code == 400
        assert response.json()["message"] == (
            "Enregistrez un encaissement pour cette échéance."
        )
        assert response.json()["details"][0]["rule"] == "use_payment_record"
        await db_session.refresh(first)
        assert first.status == "pending"
        assert first.paid_date is None

    async def test_patch_installment_notes_still_allowed(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _direct_engage(
            client, db_session, manager, headers, **REFERENCE
        )
        first = _by_type(await _installments(db_session, reservation_id), "deposit")[0]

        response = await client.patch(
            f"/api/payments/installments/{first.id}",
            headers=headers,
            json={"notes": "Relance envoyée"},
        )

        assert response.status_code == 200, response.text
        assert response.json()["notes"] == "Relance envoyée"
        assert response.json()["status"] == "pending"


class TestProjectActeThreshold:
    async def test_project_acte_min_paid_pct_default_and_update(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(manager)
        project = await make_project(db_session, manager)
        url = f"/api/projects/{project.id}"
        statuses = ["option", "reservation_a_finaliser"]

        default = await client.get(url, headers=headers)
        updated = await client.put(
            f"{url}/workflow",
            headers=headers,
            json={"enabled_optional_statuses": statuses, "acte_min_paid_pct": 25},
        )
        kept = await client.put(
            f"{url}/workflow",
            headers=headers,
            json={"enabled_optional_statuses": statuses},
        )
        too_high = await client.put(
            f"{url}/workflow",
            headers=headers,
            json={"enabled_optional_statuses": statuses, "acte_min_paid_pct": 101},
        )
        negative = await client.put(
            f"{url}/workflow",
            headers=headers,
            json={"enabled_optional_statuses": statuses, "acte_min_paid_pct": -1},
        )

        assert default.status_code == 200
        assert default.json()["acte_min_paid_pct"] == 10
        assert updated.status_code == 200, updated.text
        assert updated.json()["acte_min_paid_pct"] == 25
        assert kept.status_code == 200
        assert kept.json()["acte_min_paid_pct"] == 25
        assert too_high.status_code == 422
        assert negative.status_code == 422
        await db_session.refresh(project)
        assert project.acte_min_paid_pct == 25
