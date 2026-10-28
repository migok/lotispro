"""E4-T5c: edit an engaged reservation, audit trail and deed new version."""

from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.models import (
    LotDocumentModel,
    LotModel,
    PaymentInstallmentModel,
    PaymentScheduleModel,
    ReservationChangeModel,
    ReservationModel,
    UserModel,
)
from app.services.email_service import EmailService
from app.tests.conftest import FakeStorage
from app.tests.factories import make_client, make_lot, make_project

pytestmark = pytest.mark.integration

Headers = Callable[[UserModel], dict[str, str]]

# Reference example of the spec: agreed 500 000, deed 450 000, gap 50 000 at
# the end, first payment 100 000, 50 % deposit plan → deposit 150 000,
# balance 100 000 × 2, gap 50 000.
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

STALE = "La réservation a été modifiée entre-temps. Rechargez la fiche."
NOT_ENGAGED = "Seule une réservation engagée peut être modifiée."
FORBIDDEN = (
    "Seuls le commercial auteur de la réservation et les managers peuvent "
    "modifier la réservation."
)
MISMATCH = "La liste des échéances ne correspond pas à l'échéancier."
NO_CHANGE = "Aucune modification à enregistrer."
ACTE_ABOVE = "Le prix figurant sur l'acte ne peut pas dépasser le prix total convenu."


class FailingStorage(FakeStorage):
    def upload_bytes(self, *args: Any, **kwargs: Any) -> None:
        raise RuntimeError("storage down")


@pytest.fixture(autouse=True)
def no_real_email(monkeypatch: pytest.MonkeyPatch) -> None:
    """Nothing in this module may reach Resend; payment emails are stubbed."""

    def _refuse(*_args: Any, **_kwargs: Any) -> None:
        raise AssertionError("Resend must not be called in tests")

    async def _sent(*_args: Any, **_kwargs: Any) -> bool:
        return True

    monkeypatch.setattr("resend.Emails.send", _refuse)
    monkeypatch.setattr(EmailService, "send_payment_confirmation", _sent)


def _today() -> date:
    return datetime.now(UTC).date()


async def _engaged(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    headers: dict[str, str],
    payload: dict[str, Any] | None = None,
) -> tuple[LotModel, int]:
    """Direct-engage a 500 000 lot (reference example by default)."""
    project = await make_project(db_session, manager)
    lot = await make_lot(db_session, project, status="available", price=500000)
    buyer = await make_client(db_session, manager, email="buyer@example.com")
    response = await client.post(
        f"/api/lots/{lot.id}/transitions/direct-engage",
        headers=headers,
        json={"client_id": buyer.id, **(payload or REFERENCE)},
    )
    assert response.status_code == 200, response.text
    return lot, response.json()["id"]


async def _summary(
    client: AsyncClient, headers: dict[str, str], reservation_id: int
) -> dict[str, Any]:
    response = await client.get(
        f"/api/reservations/{reservation_id}/financial-summary", headers=headers
    )
    assert response.status_code == 200, response.text
    return response.json()


async def _changes(
    client: AsyncClient, headers: dict[str, str], reservation_id: int
) -> list[dict[str, Any]]:
    response = await client.get(
        f"/api/reservations/{reservation_id}/changes", headers=headers
    )
    assert response.status_code == 200, response.text
    return response.json()


async def _payments(
    client: AsyncClient, headers: dict[str, str], reservation_id: int
) -> list[dict[str, Any]]:
    response = await client.get(
        f"/api/reservations/{reservation_id}/payments", headers=headers
    )
    assert response.status_code == 200, response.text
    return response.json()


async def _pay(
    client: AsyncClient,
    headers: dict[str, str],
    reservation_id: int,
    installment_id: int,
    amount: float,
) -> None:
    response = await client.post(
        f"/api/reservations/{reservation_id}/payments",
        headers=headers,
        data={
            "amount": str(amount),
            "paid_on": str(_today()),
            "method": "transfer",
            "installment_id": str(installment_id),
        },
    )
    assert response.status_code == 201, response.text


def _inst(summary: dict[str, Any], payment_type: str, number: int = 1) -> dict:
    return next(
        i
        for i in summary["installments"]
        if i["payment_type"] == payment_type and i["installment_number"] == number
    )


def _day(value: str) -> str:
    """ISO date part of an ISO datetime."""
    return value[:10]


def _body(summary: dict[str, Any], **overrides: Any) -> dict[str, Any]:
    """Edit body prefilled from the summary (what the form sends unchanged)."""
    body: dict[str, Any] = {
        "agreed_total_price": summary["agreed_total_price"],
        "sale_price": summary["acte_price"],
        "gap_due_timing": summary["gap_due_timing"],
        "gap_due_date": summary["gap_due_date"],
        "notes": None,
        "installments": [
            {"id": i["id"], "amount": i["amount"], "due_date": _day(i["due_date"])}
            for i in summary["installments"]
            if i["payment_type"] != "gap" and i["status"] != "paid"
        ],
        "reason": "Remise accordée par la direction",
        "expected_updated_at": summary["updated_at"],
    }
    body.update(overrides)
    return body


def _set_amount(body: dict[str, Any], installment_id: int, amount: float) -> None:
    next(i for i in body["installments"] if i["id"] == installment_id)["amount"] = (
        amount
    )


async def _edit(
    client: AsyncClient,
    headers: dict[str, str],
    reservation_id: int,
    body: dict[str, Any],
) -> Response:
    return await client.put(
        f"/api/reservations/{reservation_id}/engagement", headers=headers, json=body
    )


async def _actes(db_session: AsyncSession, reservation_id: int) -> list[Any]:
    result = await db_session.execute(
        select(LotDocumentModel)
        .where(
            LotDocumentModel.reservation_id == reservation_id,
            LotDocumentModel.category == "acte_reservation",
        )
        .order_by(LotDocumentModel.id)
    )
    return list(result.scalars().all())


async def _installment_row(
    db_session: AsyncSession, installment_id: int
) -> PaymentInstallmentModel | None:
    result = await db_session.execute(
        select(PaymentInstallmentModel)
        .where(PaymentInstallmentModel.id == installment_id)
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


def _rule(response: Response) -> str:
    return response.json()["details"][0]["rule"]


class TestValidEdit:
    async def test_edit_updates_amounts_schedule_and_journal(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        before = await _summary(client, headers, reservation_id)
        deposit = _inst(before, "deposit")
        balance_2 = _inst(before, "balance", 2)
        gap = _inst(before, "gap")
        new_b2_date = (date.fromisoformat(_day(balance_2["due_date"]))) + timedelta(
            days=30
        )

        # Agreed 520 000, deed 460 000 → gap 60 000; the schedule must cover
        # 420 000 = deposit 160 000 + 100 000 + 100 000 + gap 60 000.
        body = _body(
            before,
            agreed_total_price=520000,
            sale_price=460000,
            notes="  Client fidèle  ",
            reason="  Remise accordée par la direction  ",
        )
        _set_amount(body, deposit["id"], 160000)
        next(i for i in body["installments"] if i["id"] == balance_2["id"])[
            "due_date"
        ] = new_b2_date.isoformat()

        response = await _edit(client, headers, reservation_id, body)

        assert response.status_code == 200, response.text
        after = response.json()
        assert after["agreed_total_price"] == 520000
        assert after["acte_price"] == 460000
        assert after["gap_amount"] == 60000
        assert after["first_payment"] == 100000
        assert after["remaining"] == 420000
        assert after["updated_at"] != before["updated_at"]
        assert [
            (i["id"], i["payment_type"], i["amount"]) for i in after["installments"]
        ] == [
            (deposit["id"], "deposit", 160000),
            (_inst(before, "balance", 1)["id"], "balance", 100000),
            (balance_2["id"], "balance", 100000),
            (gap["id"], "gap", 60000),
        ]
        # R3, gap « fin »: due with the last balance installment.
        assert _day(_inst(after, "gap")["due_date"]) == new_b2_date.isoformat()
        assert _day(_inst(after, "balance", 2)["due_date"]) == new_b2_date.isoformat()
        assert after == await _summary(client, headers, reservation_id) | {
            "acte_status": after["acte_status"]
        }

        reservation = (
            await db_session.execute(
                select(ReservationModel)
                .where(ReservationModel.id == reservation_id)
                .execution_options(populate_existing=True)
            )
        ).scalar_one()
        assert reservation.notes == "Client fidèle"
        schedule = (
            await db_session.execute(
                select(PaymentScheduleModel)
                .where(PaymentScheduleModel.reservation_id == reservation_id)
                .execution_options(populate_existing=True)
            )
        ).scalar_one()
        assert schedule.lot_price == 420000
        assert schedule.deposit_total == 160000
        assert schedule.balance_total == 200000

        changes = await _changes(client, headers, reservation_id)
        assert len(changes) == 1
        change = changes[0]
        assert set(change) == {
            "id",
            "user_id",
            "user_name",
            "changed_at",
            "reason",
            "before",
            "after",
        }
        assert change["user_id"] == commercial.id
        assert change["user_name"] == commercial.name
        assert change["reason"] == "Remise accordée par la direction"
        old_b2_day = _day(balance_2["due_date"])
        assert change["before"] == {
            "agreed_total_price": 500000,
            "sale_price": 450000,
            "notes": None,
            "installments": [
                {
                    "id": deposit["id"],
                    "amount": 150000,
                    "due_date": _day(deposit["due_date"]),
                },
                {"id": balance_2["id"], "amount": 100000, "due_date": old_b2_day},
                {"id": gap["id"], "amount": 50000, "due_date": _day(gap["due_date"])},
            ],
        }
        assert change["after"] == {
            "agreed_total_price": 520000,
            "sale_price": 460000,
            "notes": "Client fidèle",
            "installments": [
                {
                    "id": deposit["id"],
                    "amount": 160000,
                    "due_date": _day(deposit["due_date"]),
                },
                {
                    "id": balance_2["id"],
                    "amount": 100000,
                    "due_date": new_b2_date.isoformat(),
                },
                {"id": gap["id"], "amount": 60000, "due_date": new_b2_date.isoformat()},
            ],
        }

    async def test_payments_are_unchanged(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        summary = await _summary(client, headers, reservation_id)
        await _pay(
            client, headers, reservation_id, _inst(summary, "deposit")["id"], 50000
        )
        summary = await _summary(client, headers, reservation_id)
        payments_before = await _payments(client, headers, reservation_id)

        body = _body(summary, agreed_total_price=510000, sale_price=460000)
        _set_amount(body, _inst(summary, "balance", 1)["id"], 110000)
        response = await _edit(client, headers, reservation_id, body)

        assert response.status_code == 200, response.text
        assert await _payments(client, headers, reservation_id) == payments_before
        assert response.json()["total_received"] == 150000
        assert response.json()["first_payment"] == 100000

    async def test_paid_installment_is_not_editable_and_kept(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        summary = await _summary(client, headers, reservation_id)
        deposit = _inst(summary, "deposit")
        await _pay(client, headers, reservation_id, deposit["id"], 150000)
        summary = await _summary(client, headers, reservation_id)

        # The paid deposit is not in the body; listing it is refused.
        body = _body(summary)
        assert deposit["id"] not in [i["id"] for i in body["installments"]]
        with_paid = _body(summary)
        with_paid["installments"].append(
            {
                "id": deposit["id"],
                "amount": 150000,
                "due_date": _day(deposit["due_date"]),
            }
        )
        refused = await _edit(client, headers, reservation_id, with_paid)
        assert refused.status_code == 400
        assert refused.json()["message"] == MISMATCH

        body = _body(summary, notes="Paiement acompte reçu")
        response = await _edit(client, headers, reservation_id, body)
        assert response.status_code == 200, response.text
        kept = _inst(response.json(), "deposit")
        assert (kept["amount"], kept["due_date"], kept["status"]) == (
            deposit["amount"],
            deposit["due_date"],
            "paid",
        )

    async def test_partial_installment_reduced_to_received_becomes_paid(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        summary = await _summary(client, headers, reservation_id)
        deposit = _inst(summary, "deposit")
        await _pay(client, headers, reservation_id, deposit["id"], 50000)
        summary = await _summary(client, headers, reservation_id)

        body = _body(summary)
        _set_amount(body, deposit["id"], 50000)
        _set_amount(body, _inst(summary, "balance", 1)["id"], 200000)
        response = await _edit(client, headers, reservation_id, body)

        assert response.status_code == 200, response.text
        assert _inst(response.json(), "deposit")["status"] == "paid"
        row = await _installment_row(db_session, deposit["id"])
        assert row is not None
        assert row.status == "paid"
        assert row.paid_date is not None


class TestGapInstallment:
    async def test_gap_follows_timing_date(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        summary = await _summary(client, headers, reservation_id)
        gap_day = (_today() + timedelta(days=200)).isoformat()

        response = await _edit(
            client,
            headers,
            reservation_id,
            _body(summary, gap_due_timing="date", gap_due_date=gap_day),
        )

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["gap_due_timing"] == "date"
        assert body["gap_due_date"] == gap_day
        assert _day(_inst(body, "gap")["due_date"]) == gap_day
        change = (await _changes(client, headers, reservation_id))[0]
        assert change["before"]["gap_due_timing"] == "fin"
        assert change["before"]["gap_due_date"] is None
        assert change["after"]["gap_due_timing"] == "date"
        assert change["after"]["gap_due_date"] == gap_day

    async def test_gap_becoming_zero_deletes_the_gap_installment(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        summary = await _summary(client, headers, reservation_id)
        gap = _inst(summary, "gap")

        body = _body(summary, sale_price=500000)
        _set_amount(body, _inst(summary, "deposit")["id"], 200000)
        response = await _edit(client, headers, reservation_id, body)

        assert response.status_code == 200, response.text
        assert response.json()["gap_amount"] == 0
        assert [i["payment_type"] for i in response.json()["installments"]] == [
            "deposit",
            "balance",
            "balance",
        ]
        assert await _installment_row(db_session, gap["id"]) is None

    async def test_gap_with_received_payment_cannot_go_below_it(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        summary = await _summary(client, headers, reservation_id)
        await _pay(client, headers, reservation_id, _inst(summary, "gap")["id"], 20000)
        summary = await _summary(client, headers, reservation_id)

        body = _body(summary, sale_price=500000)
        _set_amount(body, _inst(summary, "deposit")["id"], 200000)
        response = await _edit(client, headers, reservation_id, body)

        assert response.status_code == 400
        assert _rule(response) == "installment_below_received"
        assert response.json()["message"] == "L'échéance n° 4 a déjà reçu 20 000 MAD."
        assert (
            _inst(await _summary(client, headers, reservation_id), "gap")["amount"]
            == 50000
        )

    async def test_received_gap_cannot_change(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        summary = await _summary(client, headers, reservation_id)
        gap = _inst(summary, "gap")
        await _pay(client, headers, reservation_id, gap["id"], 50000)
        summary = await _summary(client, headers, reservation_id)

        body = _body(summary, sale_price=440000)
        _set_amount(body, _inst(summary, "deposit")["id"], 140000)
        refused = await _edit(client, headers, reservation_id, body)
        assert refused.status_code == 400
        assert _rule(refused) == "installment_already_received"
        assert refused.json()["message"] == (
            "L'échéance n° 4 est déjà reçue : son montant ne peut plus changer."
        )

        # Moving the last balance date keeps the received gap's date (R3 skipped).
        balance_2 = _inst(summary, "balance", 2)
        moved = _body(summary)
        next(i for i in moved["installments"] if i["id"] == balance_2["id"])[
            "due_date"
        ] = (_today() + timedelta(days=400)).isoformat()
        accepted = await _edit(client, headers, reservation_id, moved)
        assert accepted.status_code == 200, accepted.text
        kept = _inst(accepted.json(), "gap")
        assert (kept["amount"], kept["due_date"], kept["status"]) == (
            50000,
            gap["due_date"],
            "paid",
        )

    async def test_gap_installment_created_when_a_gap_appears(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(
            client,
            db_session,
            manager,
            headers,
            {**REFERENCE, "sale_price": 500000},
        )
        summary = await _summary(client, headers, reservation_id)
        assert all(i["payment_type"] != "gap" for i in summary["installments"])

        body = _body(summary, sale_price=480000, gap_due_timing="debut")
        _set_amount(body, _inst(summary, "balance", 2)["id"], 105000)
        response = await _edit(client, headers, reservation_id, body)

        assert response.status_code == 200, response.text
        gap = _inst(response.json(), "gap")
        assert gap["amount"] == 20000
        assert gap["status"] == "pending"
        change = (await _changes(client, headers, reservation_id))[0]
        assert {
            "id": gap["id"],
            "amount": 20000,
            "due_date": _day(gap["due_date"]),
        } in (change["after"]["installments"])
        assert gap["id"] not in [i["id"] for i in change["before"]["installments"]]


class TestPermissionsAndState:
    async def test_other_commercial_403_manager_allowed(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        other_commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        _, reservation_id = await _engaged(
            client, db_session, manager, auth_headers(commercial)
        )
        summary = await _summary(client, auth_headers(commercial), reservation_id)
        body = _body(summary, notes="Note du manager")

        refused = await _edit(
            client, auth_headers(other_commercial), reservation_id, body
        )
        assert refused.status_code == 403
        assert refused.json()["message"] == FORBIDDEN

        accepted = await _edit(client, auth_headers(manager), reservation_id, body)
        assert accepted.status_code == 200, accepted.text
        change = (await _changes(client, auth_headers(commercial), reservation_id))[0]
        assert change["user_id"] == manager.id
        assert change["user_name"] == manager.name

    async def test_not_engaged_400(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        lot, reservation_id = await _engaged(client, db_session, manager, headers)
        summary = await _summary(client, headers, reservation_id)
        db_lot = await db_session.get(LotModel, lot.id)
        assert db_lot is not None
        db_lot.status = "reservation_soldee"
        await db_session.commit()

        response = await _edit(
            client, headers, reservation_id, _body(summary, notes="x")
        )

        assert response.status_code == 400
        assert response.json()["message"] == NOT_ENGAGED
        assert _rule(response) == "reservation_not_engaged"
        assert await _changes(client, headers, reservation_id) == []

    async def test_stale_expected_updated_at_409(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        summary = await _summary(client, headers, reservation_id)

        first = await _edit(client, headers, reservation_id, _body(summary, notes="A"))
        assert first.status_code == 200, first.text
        stale = await _edit(client, headers, reservation_id, _body(summary, notes="B"))

        assert stale.status_code == 409
        assert stale.json()["message"] == STALE
        assert stale.json()["error"] == "CONFLICT"
        assert len(await _changes(client, headers, reservation_id)) == 1

        # The value returned by the edit is accepted for the next one.
        fresh = _body(first.json(), notes="B")
        again = await _edit(client, headers, reservation_id, fresh)
        assert again.status_code == 200, again.text

    async def test_unknown_reservation_404(
        self,
        client: AsyncClient,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        body = {
            "agreed_total_price": 1,
            "sale_price": 1,
            "gap_due_timing": "fin",
            "installments": [],
            "reason": "x",
            "expected_updated_at": datetime.now(UTC).isoformat(),
        }
        put = await _edit(client, headers, 9999, body)
        changes = await client.get("/api/reservations/9999/changes", headers=headers)
        assert put.status_code == 404
        assert changes.status_code == 404


class TestBusinessRules:
    """Each refused edit: exact message, and nothing changed (atomicity)."""

    async def _assert_refused(
        self,
        client: AsyncClient,
        headers: dict[str, str],
        reservation_id: int,
        body: dict[str, Any],
        message: str,
        rule: str,
    ) -> None:
        before = await _summary(client, headers, reservation_id)
        payments = await _payments(client, headers, reservation_id)
        response = await _edit(client, headers, reservation_id, body)
        assert response.status_code == 400, response.text
        assert response.json()["message"] == message
        assert _rule(response) == rule
        assert await _summary(client, headers, reservation_id) == before
        assert await _payments(client, headers, reservation_id) == payments
        assert await _changes(client, headers, reservation_id) == []

    async def test_agreed_below_received(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        summary = await _summary(client, headers, reservation_id)
        await _pay(
            client, headers, reservation_id, _inst(summary, "deposit")["id"], 150000
        )
        summary = await _summary(client, headers, reservation_id)

        await self._assert_refused(
            client,
            headers,
            reservation_id,
            _body(summary, agreed_total_price=240000.5, sale_price=200000),
            "Le prix total convenu ne peut pas être inférieur au total déjà "
            "encaissé (250 000 MAD).",
            "agreed_below_received",
        )

    async def test_acte_price_above_agreed(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        summary = await _summary(client, headers, reservation_id)

        await self._assert_refused(
            client,
            headers,
            reservation_id,
            _body(summary, sale_price=500000.01),
            ACTE_ABOVE,
            "acte_price_above_agreed",
        )

    async def test_installments_total_mismatch(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        summary = await _summary(client, headers, reservation_id)
        body = _body(summary)
        _set_amount(body, _inst(summary, "deposit")["id"], 151000.5)

        await self._assert_refused(
            client,
            headers,
            reservation_id,
            body,
            "Les échéances doivent totaliser 400 000 MAD (actuellement "
            "401 000,50 MAD).",
            "installments_total_mismatch",
        )

    async def test_installment_below_received(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        summary = await _summary(client, headers, reservation_id)
        deposit = _inst(summary, "deposit")
        await _pay(client, headers, reservation_id, deposit["id"], 50000)
        summary = await _summary(client, headers, reservation_id)
        body = _body(summary)
        _set_amount(body, deposit["id"], 40000)
        _set_amount(body, _inst(summary, "balance", 1)["id"], 210000)

        await self._assert_refused(
            client,
            headers,
            reservation_id,
            body,
            "L'échéance n° 1 a déjà reçu 50 000 MAD.",
            "installment_below_received",
        )

    @pytest.mark.parametrize("variant", ["missing", "unknown", "gap", "duplicate"])
    async def test_installments_list_mismatch(
        self,
        variant: str,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        summary = await _summary(client, headers, reservation_id)
        body = _body(summary)
        gap = _inst(summary, "gap")
        if variant == "missing":
            body["installments"].pop()
        elif variant == "unknown":
            body["installments"][0]["id"] = 9999
        elif variant == "gap":
            body["installments"].append(
                {"id": gap["id"], "amount": 50000, "due_date": _day(gap["due_date"])}
            )
        else:
            body["installments"].append(dict(body["installments"][0]))

        await self._assert_refused(
            client, headers, reservation_id, body, MISMATCH, "installments_mismatch"
        )

    async def test_no_change(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        summary = await _summary(client, headers, reservation_id)

        await self._assert_refused(
            client, headers, reservation_id, _body(summary), NO_CHANGE, "no_change"
        )

    @pytest.mark.parametrize(
        "overrides",
        [
            {"reason": "   "},
            {"reason": "x" * 501},
            {"gap_due_timing": "date", "gap_due_date": None},
            {"agreed_total_price": 0},
            {"expected_updated_at": None},
            {"agreed_total_price": 0.004},
            {"sale_price": 0.004},
        ],
    )
    async def test_validation_422(
        self,
        overrides: dict[str, Any],
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        summary = await _summary(client, headers, reservation_id)

        response = await _edit(
            client, headers, reservation_id, _body(summary, notes="x", **overrides)
        )

        assert response.status_code == 422, response.text
        assert await _changes(client, headers, reservation_id) == []

    async def test_sub_cent_installment_amount_422(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        summary = await _summary(client, headers, reservation_id)
        body = _body(summary, notes="x")
        body["installments"][0]["amount"] = 0.004

        response = await _edit(client, headers, reservation_id, body)

        assert response.status_code == 422, response.text
        assert "Le montant doit être d'au moins 0,01 MAD." in response.text
        assert await _changes(client, headers, reservation_id) == []

    async def test_received_gap_timing_cannot_change(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        summary = await _summary(client, headers, reservation_id)
        await _pay(client, headers, reservation_id, _inst(summary, "gap")["id"], 50000)
        summary = await _summary(client, headers, reservation_id)
        message = "L'écart est déjà entièrement reçu : sa date ne peut plus changer."

        await self._assert_refused(
            client,
            headers,
            reservation_id,
            _body(
                summary,
                gap_due_timing="date",
                gap_due_date=(_today() + timedelta(days=90)).isoformat(),
            ),
            message,
            "gap_already_received",
        )
        await self._assert_refused(
            client,
            headers,
            reservation_id,
            _body(summary, gap_due_timing="debut"),
            message,
            "gap_already_received",
        )

    async def test_gap_date_message(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        summary = await _summary(client, headers, reservation_id)

        response = await _edit(
            client, headers, reservation_id, _body(summary, gap_due_timing="date")
        )

        assert response.status_code == 422
        assert "Indiquez la date de l'écart." in response.text


class TestActeNewVersion:
    async def test_new_version_when_deed_price_changes(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        summary = await _summary(client, headers, reservation_id)
        assert len(await _actes(db_session, reservation_id)) == 1

        body = _body(summary, sale_price=440000)
        _set_amount(body, _inst(summary, "deposit")["id"], 140000)
        response = await _edit(client, headers, reservation_id, body)

        assert response.status_code == 200, response.text
        assert response.json()["acte_status"] == "stored"
        actes = await _actes(db_session, reservation_id)
        assert len(actes) == 2  # the previous version stays

    async def test_no_new_version_when_deed_price_unchanged(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        summary = await _summary(client, headers, reservation_id)

        # Agreed total up, deed price unchanged (the gap grows).
        body = _body(summary, agreed_total_price=510000, notes="Nouvelle note")
        response = await _edit(client, headers, reservation_id, body)

        assert response.status_code == 200, response.text
        assert response.json()["acte_status"] is None
        assert len(await _actes(db_session, reservation_id)) == 1

    async def test_deed_failure_does_not_fail_the_edit(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        summary = await _summary(client, headers, reservation_id)
        storage = FailingStorage()
        monkeypatch.setattr(
            "app.services.document_service.get_storage_client", lambda: storage
        )

        body = _body(summary, sale_price=440000)
        _set_amount(body, _inst(summary, "deposit")["id"], 140000)
        response = await _edit(client, headers, reservation_id, body)

        assert response.status_code == 200, response.text
        assert response.json()["acte_status"] == "failed"
        assert response.json()["acte_price"] == 440000
        assert len(await _actes(db_session, reservation_id)) == 1
        assert len(await _changes(client, headers, reservation_id)) == 1

    async def test_below_threshold_no_deed(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(
            client,
            db_session,
            manager,
            headers,
            {**REFERENCE, "guarantee_amount": 10000},
        )
        summary = await _summary(client, headers, reservation_id)
        assert await _actes(db_session, reservation_id) == []

        body = _body(summary, sale_price=440000)
        deposit = _inst(summary, "deposit")
        _set_amount(body, deposit["id"], deposit["amount"] - 10000)
        response = await _edit(client, headers, reservation_id, body)

        assert response.status_code == 200, response.text
        assert response.json()["acte_status"] == "not_ready"
        assert await _actes(db_session, reservation_id) == []


class TestActeThresholdCrossing:
    async def test_edit_crossing_the_threshold_archives_the_first_deed(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        # First payment 40 000 < 10 % of 500 000: no deed at engagement.
        # Deed 380 000 → gap 120 000; deposit 210 000, balance 65 000 × 2.
        _, reservation_id = await _engaged(
            client,
            db_session,
            manager,
            headers,
            {**REFERENCE, "guarantee_amount": 40000, "sale_price": 380000},
        )
        summary = await _summary(client, headers, reservation_id)
        assert summary["acte_available"] is False
        assert await _actes(db_session, reservation_id) == []

        # Agreed 400 000 → threshold 40 000 reached; deed price unchanged, the
        # gap drops to 20 000 so the other installments stay as they are.
        response = await _edit(
            client,
            headers,
            reservation_id,
            _body(summary, agreed_total_price=400000),
        )

        assert response.status_code == 200, response.text
        assert response.json()["acte_available"] is True
        assert response.json()["acte_status"] == "stored"
        assert len(await _actes(db_session, reservation_id)) == 1

        # Still available, a deed exists, deed price unchanged: no new deed.
        again = await _edit(
            client, headers, reservation_id, _body(response.json(), notes="Suite")
        )
        assert again.status_code == 200, again.text
        assert again.json()["acte_status"] is None
        assert len(await _actes(db_session, reservation_id)) == 1


class TestChangesHistory:
    async def test_history_newest_first(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        summary = await _summary(client, headers, reservation_id)
        first = await _edit(
            client, headers, reservation_id, _body(summary, notes="A", reason="Premier")
        )
        assert first.status_code == 200, first.text
        second = await _edit(
            client,
            headers,
            reservation_id,
            _body(first.json(), notes="B", reason="Second"),
        )
        assert second.status_code == 200, second.text

        changes = await _changes(client, headers, reservation_id)
        assert [c["reason"] for c in changes] == ["Second", "Premier"]
        assert changes[0]["before"] == {"notes": "A"}
        assert changes[0]["after"] == {"notes": "B"}
        rows = (
            (
                await db_session.execute(
                    select(ReservationChangeModel).where(
                        ReservationChangeModel.reservation_id == reservation_id
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 2


class TestLocks:
    """One lock order for payments, edit and solde: reservation → lot →
    installments."""

    def test_lock_queries_compile(self) -> None:
        from app.infrastructure.database.repositories.reservation_repository import (
            reservation_for_update as shared_reservation_for_update,
        )
        from app.services.engagement_edit_service import (
            installments_for_update,
            lot_for_update,
            reservation_for_update,
        )

        dialect = postgresql.dialect()

        def sql(query: Any) -> str:
            return str(query.compile(dialect=dialect))

        assert reservation_for_update is shared_reservation_for_update
        assert sql(reservation_for_update(1)).endswith("FOR UPDATE")
        assert sql(lot_for_update(1)).endswith("FOR NO KEY UPDATE")
        assert sql(installments_for_update(1)).endswith(
            "FOR UPDATE OF payment_installments"
        )

    async def test_edit_locks_reservation_then_lot_then_installments(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from app.services import engagement_edit_service as module

        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        summary = await _summary(client, headers, reservation_id)
        calls: list[str] = []
        for name in (
            "reservation_for_update",
            "lot_for_update",
            "installments_for_update",
        ):
            original = getattr(module, name)

            def spy(*args: Any, _name: str = name, _original: Any = original) -> Any:
                calls.append(_name)
                return _original(*args)

            monkeypatch.setattr(module, name, spy)

        response = await _edit(
            client, headers, reservation_id, _body(summary, notes="x")
        )

        assert response.status_code == 200, response.text
        assert calls == [
            "reservation_for_update",
            "lot_for_update",
            "installments_for_update",
        ]

    async def test_solde_locks_reservation_before_reading_payments(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from app.infrastructure.database.repositories import (
            ReservationPaymentRepository,
            ReservationRepository,
        )

        headers = auth_headers(commercial)
        paid_in_full = {**REFERENCE, "guarantee_amount": 500000, "sale_price": 500000}
        lot, reservation_id = await _engaged(
            client, db_session, manager, headers, paid_in_full
        )
        calls: list[tuple[str, int]] = []
        total = ReservationPaymentRepository.total_for_reservation

        async def spy_total(self: Any, rid: int, **kwargs: Any) -> float:
            calls.append(("total", rid))
            return await total(self, rid, **kwargs)

        lock = getattr(ReservationRepository, "get_for_update", None)
        assert lock is not None, "ReservationRepository.get_for_update is missing"

        async def spy_lock(self: Any, rid: int) -> Any:
            calls.append(("lock", rid))
            return await lock(self, rid)

        monkeypatch.setattr(ReservationRepository, "get_for_update", spy_lock)
        monkeypatch.setattr(
            ReservationPaymentRepository, "total_for_reservation", spy_total
        )

        response = await client.post(
            f"/api/lots/{lot.id}/transitions/solde", headers=headers, json={}
        )

        assert response.status_code == 200, response.text
        assert calls[:2] == [("lock", reservation_id), ("total", reservation_id)]
