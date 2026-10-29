"""E4-T5b: payments per installment (encaissements) and the financial summary."""

from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.infrastructure.database.models import (
    LotDocumentModel,
    LotModel,
    PaymentInstallmentModel,
    PaymentScheduleModel,
    ReservationPaymentModel,
    UserModel,
)
from app.services.email_service import EmailService
from app.tests.conftest import FakeStorage
from app.tests.factories import make_client, make_lot, make_project

pytestmark = pytest.mark.integration

Headers = Callable[[UserModel], dict[str, str]]

BUCKET = settings.SUPABASE_DOCUMENTS_BUCKET

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

PREVIOUS_DEPOSIT_UNPAID = (
    "Les versements précédents de l'échéancier acompte doivent être validés "
    "avant celui-ci."
)
DEPOSIT_BEFORE_BALANCE = (
    "Tous les versements de l'échéancier acompte doivent être validés avant "
    "de commencer l'échéancier solde."
)
PREVIOUS_BALANCE_UNPAID = (
    "Les versements précédents de l'échéancier solde doivent être validés "
    "avant celui-ci."
)

PAYMENT_KEYS = {
    "id",
    "amount",
    "paid_on",
    "method",
    "reference",
    "installment_id",
    "document_id",
    "recorded_by_user_id",
    "recorded_by_name",
    "created_at",
}
SUMMARY_KEYS = {
    "catalogue_price",
    "agreed_total_price",
    "acte_price",
    "gap_amount",
    "gap_due_timing",
    "gap_due_date",
    "first_payment",
    "total_received",
    "remaining",
    "acte_min_paid_pct",
    "acte_threshold_amount",
    "acte_available",
    "installments",
    "updated_at",
}
INSTALLMENT_KEYS = {
    "id",
    "payment_type",
    "installment_number",
    "amount",
    "due_date",
    "received",
    "remaining",
    "status",
}


class SentConfirmations:
    """Records the calls made to the patched ``send_payment_confirmation``."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.error: Exception | None = None

    async def __call__(self, **kwargs: Any) -> bool:
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        return True


@pytest.fixture(autouse=True)
def no_real_email(monkeypatch: pytest.MonkeyPatch) -> None:
    """Safety net: nothing in this module may reach Resend."""

    def _refuse(*_args: Any, **_kwargs: Any) -> None:
        raise AssertionError("Resend must not be called in tests")

    monkeypatch.setattr("resend.Emails.send", _refuse)


@pytest.fixture(autouse=True)
def confirmations(monkeypatch: pytest.MonkeyPatch) -> SentConfirmations:
    recorder = SentConfirmations()
    monkeypatch.setattr(EmailService, "send_payment_confirmation", recorder)
    return recorder


def _today() -> date:
    return datetime.now(UTC).date()


def _in_days(days: int) -> str:
    return (datetime.now(UTC) + timedelta(days=days)).isoformat()


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


async def _engaged(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    headers: dict[str, str],
    payload: dict[str, Any] | None = None,
    **project_fields: Any,
) -> tuple[LotModel, int]:
    """Direct-engage a 500 000 lot (reference example by default)."""
    project = await make_project(db_session, manager, **project_fields)
    lot = await make_lot(db_session, project, status="available", price=500000)
    buyer = await make_client(db_session, manager, email="buyer@example.com")
    response = await _transition(
        client,
        headers,
        lot.id,
        "direct-engage",
        {"client_id": buyer.id, **(payload or REFERENCE)},
    )
    assert response.status_code == 200, response.text
    return lot, response.json()["id"]


async def _pay(
    client: AsyncClient,
    headers: dict[str, str],
    reservation_id: int,
    installment_id: int | None,
    amount: Any,
    *,
    paid_on: date | str | None = None,
    method: str = "transfer",
    reference: str | None = None,
    file: tuple[str, bytes, str] | None = None,
) -> Response:
    data: dict[str, str] = {
        "amount": str(amount),
        "paid_on": str(paid_on or _today()),
        "method": method,
    }
    if reference is not None:
        data["reference"] = reference
    if installment_id is not None:
        data["installment_id"] = str(installment_id)
    return await client.post(
        f"/api/reservations/{reservation_id}/payments",
        headers=headers,
        data=data,
        files={"file": file} if file else None,
    )


async def _summary(
    client: AsyncClient, headers: dict[str, str], reservation_id: int
) -> dict[str, Any]:
    response = await client.get(
        f"/api/reservations/{reservation_id}/financial-summary", headers=headers
    )
    assert response.status_code == 200, response.text
    return response.json()


def _inst(summary: dict[str, Any], payment_type: str, number: int = 1) -> dict:
    return next(
        i
        for i in summary["installments"]
        if i["payment_type"] == payment_type and i["installment_number"] == number
    )


async def _installment_row(
    db_session: AsyncSession, installment_id: int
) -> PaymentInstallmentModel:
    result = await db_session.execute(
        select(PaymentInstallmentModel)
        .where(PaymentInstallmentModel.id == installment_id)
        .execution_options(populate_existing=True)
    )
    return result.scalar_one()


async def _payment_rows(
    db_session: AsyncSession, reservation_id: int
) -> list[ReservationPaymentModel]:
    result = await db_session.execute(
        select(ReservationPaymentModel)
        .where(ReservationPaymentModel.reservation_id == reservation_id)
        .order_by(ReservationPaymentModel.id)
    )
    return list(result.scalars().all())


def _rule(response: Response) -> str:
    return response.json()["details"][0]["rule"]


class TestReferenceScenario:
    async def test_reference_example_end_to_end(
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
        assert set(summary) == SUMMARY_KEYS
        assert summary["catalogue_price"] == 500000
        assert summary["agreed_total_price"] == 500000
        assert summary["acte_price"] == 450000
        assert summary["gap_amount"] == 50000
        assert summary["gap_due_timing"] == "fin"
        assert summary["gap_due_date"] is None
        assert summary["first_payment"] == 100000
        assert summary["total_received"] == 100000
        assert summary["remaining"] == 400000
        assert summary["acte_min_paid_pct"] == 10
        assert summary["acte_threshold_amount"] == 50000
        assert summary["acte_available"] is True
        assert summary["updated_at"] is not None
        assert all(set(i) == INSTALLMENT_KEYS for i in summary["installments"])
        assert [
            (i["payment_type"], i["amount"], i["received"], i["remaining"], i["status"])
            for i in summary["installments"]
        ] == [
            ("deposit", 150000, 0, 150000, "pending"),
            ("balance", 100000, 0, 100000, "pending"),
            ("balance", 100000, 0, 100000, "pending"),
            ("gap", 50000, 0, 50000, "pending"),
        ]

        deposit = _inst(summary, "deposit")
        balance_1 = _inst(summary, "balance", 1)
        balance_2 = _inst(summary, "balance", 2)
        gap = _inst(summary, "gap")
        for installment, amount in [
            (deposit, 150000),
            (balance_1, 100000),
            (balance_2, 100000),
        ]:
            response = await _pay(
                client, headers, reservation_id, installment["id"], amount
            )
            assert response.status_code == 201, response.text

        summary = await _summary(client, headers, reservation_id)
        assert summary["total_received"] == 450000
        assert summary["remaining"] == 50000
        refused = await _transition(client, headers, lot.id, "solde", {})
        assert refused.status_code == 400
        assert refused.json()["message"] == (
            "Reste à payer : 50 000 MAD — la réservation ne peut pas être soldée."
        )

        partial = await _pay(client, headers, reservation_id, gap["id"], 20000)
        assert partial.status_code == 201, partial.text
        summary = await _summary(client, headers, reservation_id)
        assert _inst(summary, "gap")["status"] == "partial"
        assert _inst(summary, "gap")["received"] == 20000
        assert _inst(summary, "gap")["remaining"] == 30000
        assert summary["remaining"] == 30000
        assert (await _installment_row(db_session, gap["id"])).status == "partial"

        paid = await _pay(client, headers, reservation_id, gap["id"], "30000.00")
        assert paid.status_code == 201, paid.text
        summary = await _summary(client, headers, reservation_id)
        assert _inst(summary, "gap")["status"] == "paid"
        assert summary["remaining"] == 0
        gap_row = await _installment_row(db_session, gap["id"])
        assert gap_row.status == "paid"
        assert gap_row.paid_date is not None

        accepted = await _transition(client, headers, lot.id, "solde", {})
        assert accepted.status_code == 200, accepted.text


class TestRecordPayment:
    async def test_response_and_persisted_row(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        deposit = _inst(await _summary(client, headers, reservation_id), "deposit")
        paid_on = _today() - timedelta(days=2)

        response = await _pay(
            client,
            headers,
            reservation_id,
            deposit["id"],
            "75000.50",
            paid_on=paid_on,
            method="check",
            reference="CHQ 123",
        )

        assert response.status_code == 201, response.text
        body = response.json()
        assert set(body) == PAYMENT_KEYS
        assert body["amount"] == 75000.5
        assert body["paid_on"] == paid_on.isoformat()
        assert body["method"] == "check"
        assert body["reference"] == "CHQ 123"
        assert body["installment_id"] == deposit["id"]
        assert body["document_id"] is None
        assert body["recorded_by_user_id"] == commercial.id
        assert body["recorded_by_name"] == commercial.name
        row = (await _payment_rows(db_session, reservation_id))[-1]
        assert (row.id, row.amount, row.paid_on) == (body["id"], 75000.5, paid_on)
        installment = await _installment_row(db_session, deposit["id"])
        assert installment.status == "partial"
        assert installment.paid_date is None

    async def test_amount_above_installment_remaining_400(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        deposit = _inst(await _summary(client, headers, reservation_id), "deposit")

        above = await _pay(client, headers, reservation_id, deposit["id"], 150000.01)
        assert above.status_code == 400
        assert above.json()["message"] == (
            "Le montant dépasse le restant dû de cette échéance (150 000 MAD)."
        )
        assert _rule(above) == "amount_above_installment_remaining"

        ok = await _pay(client, headers, reservation_id, deposit["id"], 100000)
        assert ok.status_code == 201, ok.text
        still_above = await _pay(client, headers, reservation_id, deposit["id"], 60000)
        assert still_above.status_code == 400
        assert still_above.json()["message"] == (
            "Le montant dépasse le restant dû de cette échéance (50 000 MAD)."
        )
        done = await _pay(client, headers, reservation_id, deposit["id"], 50000)
        assert done.status_code == 201, done.text
        nothing_left = await _pay(client, headers, reservation_id, deposit["id"], 1)
        assert nothing_left.status_code == 400
        assert nothing_left.json()["message"] == (
            "Le montant dépasse le restant dû de cette échéance (0 MAD)."
        )
        # First payment + 100 000 + 50 000: refused attempts wrote nothing.
        assert len(await _payment_rows(db_session, reservation_id)) == 3

    async def test_payment_order_deposit_before_balance(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        payload = {
            **REFERENCE,
            "payment_plan": {**REFERENCE["payment_plan"], "deposit_count": 2},
        }
        _, reservation_id = await _engaged(
            client, db_session, manager, headers, payload
        )
        summary = await _summary(client, headers, reservation_id)
        deposit_1 = _inst(summary, "deposit", 1)
        deposit_2 = _inst(summary, "deposit", 2)
        balance_1 = _inst(summary, "balance", 1)
        balance_2 = _inst(summary, "balance", 2)

        cases = [
            (deposit_2, PREVIOUS_DEPOSIT_UNPAID),
            (balance_1, DEPOSIT_BEFORE_BALANCE),
        ]
        for installment, message in cases:
            response = await _pay(
                client, headers, reservation_id, installment["id"], 1000
            )
            assert response.status_code == 400, installment
            assert response.json()["message"] == message
            assert _rule(response) == "installment_order_violation"

        # A partial deposit does not open the balance.
        await _pay(client, headers, reservation_id, deposit_1["id"], 1000)
        response = await _pay(client, headers, reservation_id, balance_1["id"], 1000)
        assert response.json()["message"] == DEPOSIT_BEFORE_BALANCE

        for installment in (deposit_1, deposit_2):
            left = _inst(
                await _summary(client, headers, reservation_id),
                "deposit",
                installment["installment_number"],
            )["remaining"]
            ok = await _pay(client, headers, reservation_id, installment["id"], left)
            assert ok.status_code == 201, ok.text

        response = await _pay(client, headers, reservation_id, balance_2["id"], 1000)
        assert response.status_code == 400
        assert response.json()["message"] == PREVIOUS_BALANCE_UNPAID
        ok = await _pay(client, headers, reservation_id, balance_1["id"], 1000)
        assert ok.status_code == 201, ok.text

    async def test_gap_is_not_subject_to_the_order(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        gap = _inst(await _summary(client, headers, reservation_id), "gap")

        response = await _pay(client, headers, reservation_id, gap["id"], 50000)

        assert response.status_code == 201, response.text

    async def test_installment_required_and_of_this_reservation(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        _, other_id = await _engaged(client, db_session, manager, headers)
        foreign = _inst(await _summary(client, headers, other_id), "deposit")

        missing = await _pay(client, headers, reservation_id, None, 1000)
        assert missing.status_code == 400
        assert missing.json()["message"] == "Choisissez l'échéance de cet encaissement."
        assert _rule(missing) == "installment_required"

        for installment_id in (foreign["id"], 999999):
            response = await _pay(client, headers, reservation_id, installment_id, 1000)
            assert response.status_code == 400
            assert response.json()["message"] == (
                "Cette échéance n'appartient pas à cette réservation."
            )
            assert _rule(response) == "installment_not_in_reservation"
        assert len(await _payment_rows(db_session, reservation_id)) == 1
        assert len(await _payment_rows(db_session, other_id)) == 1

    async def test_reservation_must_be_engaged(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        project = await make_project(db_session, manager)
        lot = await make_lot(db_session, project, status="available")
        buyer = await make_client(db_session, manager)
        prep = await _transition(
            client,
            headers,
            lot.id,
            "direct-reservation",
            {
                "client_id": buyer.id,
                "guarantee_amount": 10000,
                "payment_type": "cash",
                "finalization_date": _in_days(15),
            },
        )
        assert prep.status_code == 200, prep.text
        reservation_id = prep.json()["id"]

        response = await _pay(client, headers, reservation_id, 1, 1000)

        assert response.status_code == 400
        assert response.json()["message"] == (
            "Un encaissement ne peut être enregistré que sur une réservation engagée."
        )
        assert _rule(response) == "reservation_not_engaged"

    async def test_payment_refused_once_soldee(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        lot, reservation_id = await _engaged(
            client,
            db_session,
            manager,
            headers,
            {"guarantee_amount": 500000, "payment_type": "cash"},
        )
        assert (
            await _transition(client, headers, lot.id, "solde", {})
        ).status_code == 200

        response = await _pay(client, headers, reservation_id, 1, 1000)

        assert response.status_code == 400
        assert _rule(response) == "reservation_not_engaged"

    async def test_permissions(
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
        deposit = _inst(
            await _summary(client, auth_headers(commercial), reservation_id), "deposit"
        )

        refused = await _pay(
            client, auth_headers(other_commercial), reservation_id, deposit["id"], 1000
        )
        assert refused.status_code == 403
        assert refused.json()["message"] == (
            "Seuls le commercial auteur de la réservation et les managers peuvent "
            "enregistrer un encaissement."
        )
        by_manager = await _pay(
            client, auth_headers(manager), reservation_id, deposit["id"], 1000
        )
        assert by_manager.status_code == 201, by_manager.text
        assert by_manager.json()["recorded_by_name"] == manager.name

    async def test_unknown_reservation_404(
        self,
        client: AsyncClient,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)

        post = await _pay(client, headers, 9999, 1, 1000)
        listing = await client.get("/api/reservations/9999/payments", headers=headers)
        summary = await client.get(
            "/api/reservations/9999/financial-summary", headers=headers
        )

        assert (post.status_code, listing.status_code, summary.status_code) == (
            404,
            404,
            404,
        )


class TestValidation:
    @pytest.mark.parametrize(
        ("field", "value"),
        [
            ("amount", "0"),
            ("amount", "-5"),
            ("amount", "abc"),
            ("amount", "nan"),
            ("amount", "1000.123"),
            ("method", "bitcoin"),
            ("paid_on", "pas-une-date"),
        ],
    )
    async def test_invalid_fields_422(
        self,
        field: str,
        value: str,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        deposit = _inst(await _summary(client, headers, reservation_id), "deposit")
        data = {
            "amount": "1000",
            "paid_on": _today().isoformat(),
            "method": "cash",
            "installment_id": str(deposit["id"]),
            field: value,
        }

        response = await client.post(
            f"/api/reservations/{reservation_id}/payments", headers=headers, data=data
        )

        assert response.status_code == 422, response.text
        assert [d["field"].split(".")[-1] for d in response.json()["details"]] == [
            field
        ]
        assert len(await _payment_rows(db_session, reservation_id)) == 1

    async def test_future_date_422(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        deposit = _inst(await _summary(client, headers, reservation_id), "deposit")

        response = await _pay(
            client,
            headers,
            reservation_id,
            deposit["id"],
            1000,
            paid_on=_today() + timedelta(days=2),
        )

        assert response.status_code == 422
        [detail] = response.json()["details"]
        assert detail["message"] == (
            "La date d'encaissement ne peut pas être dans le futur."
        )

    async def test_decimal_comma_amount_accepted(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        deposit = _inst(await _summary(client, headers, reservation_id), "deposit")

        response = await _pay(client, headers, reservation_id, deposit["id"], "1500,25")

        assert response.status_code == 201, response.text
        assert response.json()["amount"] == 1500.25


class TestProof:
    async def test_with_and_without_proof(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
        fake_storage: FakeStorage,
    ) -> None:
        headers = auth_headers(commercial)
        lot, reservation_id = await _engaged(client, db_session, manager, headers)
        deposit = _inst(await _summary(client, headers, reservation_id), "deposit")

        without = await _pay(client, headers, reservation_id, deposit["id"], 1000)
        with_proof = await _pay(
            client,
            headers,
            reservation_id,
            deposit["id"],
            2000,
            file=("virement.pdf", b"%PDF-1.4 proof", "application/pdf"),
        )

        assert without.status_code == 201, without.text
        assert without.json()["document_id"] is None
        assert with_proof.status_code == 201, with_proof.text
        document_id = with_proof.json()["document_id"]
        doc = await db_session.get(LotDocumentModel, document_id)
        assert doc is not None
        assert doc.category == "justificatif_paiement"
        assert doc.lot_id == lot.id
        assert doc.reservation_id == reservation_id
        assert doc.filename == "virement.pdf"
        assert doc.uploaded_by_user_id == commercial.id
        assert fake_storage.files[(BUCKET, doc.file_path)] == b"%PDF-1.4 proof"
        listed = await client.get(f"/api/lots/{lot.id}/documents", headers=headers)
        assert "justificatif_paiement" in [d["category"] for d in listed.json()]

    async def test_proof_of_a_forbidden_type_writes_nothing(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
        fake_storage: FakeStorage,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        deposit = _inst(await _summary(client, headers, reservation_id), "deposit")
        stored_before = dict(fake_storage.files)

        response = await _pay(
            client,
            headers,
            reservation_id,
            deposit["id"],
            1000,
            file=("script.sh", b"echo", "text/x-sh"),
        )

        assert response.status_code == 400
        assert _rule(response) == "invalid_document_type"
        assert len(await _payment_rows(db_session, reservation_id)) == 1
        assert fake_storage.files == stored_before

    async def test_proof_storage_failure_is_a_502_and_writes_nothing(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
        monkeypatch: pytest.MonkeyPatch,
        confirmations: SentConfirmations,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        deposit = _inst(await _summary(client, headers, reservation_id), "deposit")

        class _DownStorage(FakeStorage):
            def upload_bytes(self, *args: Any, **kwargs: Any) -> None:
                raise RuntimeError("storage down")

        monkeypatch.setattr(
            "app.services.document_service.get_storage_client", _DownStorage
        )

        response = await _pay(
            client,
            headers,
            reservation_id,
            deposit["id"],
            1000,
            file=("virement.pdf", b"%PDF-1.4 proof", "application/pdf"),
        )

        assert response.status_code == 502, response.text
        assert response.json() == {
            "detail": "Le justificatif n'a pas pu être enregistré. Réessayez."
        }
        assert len(await _payment_rows(db_session, reservation_id)) == 1
        proofs = await db_session.execute(
            select(LotDocumentModel).where(
                LotDocumentModel.category == "justificatif_paiement"
            )
        )
        assert proofs.scalars().all() == []
        assert confirmations.calls == []

    @pytest.mark.parametrize("category", ["justificatif_paiement", "acte_reservation"])
    async def test_locked_documents_cannot_be_deleted(
        self,
        category: str,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(manager)
        lot, reservation_id = await _engaged(client, db_session, manager, headers)
        deposit = _inst(await _summary(client, headers, reservation_id), "deposit")
        await _pay(
            client,
            headers,
            reservation_id,
            deposit["id"],
            1000,
            file=("recu.pdf", b"%PDF-1.4", "application/pdf"),
        )
        result = await db_session.execute(
            select(LotDocumentModel).where(
                LotDocumentModel.lot_id == lot.id,
                LotDocumentModel.category == category,
            )
        )
        doc = result.scalars().first()
        assert doc is not None

        response = await client.delete(
            f"/api/lots/{lot.id}/documents/{doc.id}", headers=headers
        )

        assert response.status_code == 400
        assert response.json()["message"] == (
            "Ce document est rattaché à un encaissement ou à un acte et ne peut "
            "pas être supprimé."
        )
        assert _rule(response) == "document_locked"
        assert await db_session.get(LotDocumentModel, doc.id) is not None


class TestListAndImmutability:
    async def test_list_sorted_by_paid_on_then_id(
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
        deposit, gap = _inst(summary, "deposit"), _inst(summary, "gap")
        yesterday = _today() - timedelta(days=1)
        last_week = _today() - timedelta(days=7)
        await _pay(client, headers, reservation_id, deposit["id"], 1000)
        await _pay(client, headers, reservation_id, gap["id"], 2000, paid_on=last_week)
        await _pay(
            client, headers, reservation_id, deposit["id"], 3000, paid_on=yesterday
        )

        response = await client.get(
            f"/api/reservations/{reservation_id}/payments", headers=headers
        )

        assert response.status_code == 200
        rows = response.json()
        assert all(set(r) == PAYMENT_KEYS for r in rows)
        assert [(r["amount"], r["paid_on"]) for r in rows] == [
            (2000, last_week.isoformat()),
            (3000, yesterday.isoformat()),
            (100000, _today().isoformat()),
            (1000, _today().isoformat()),
        ]
        first = rows[2]
        assert first["installment_id"] is None
        assert first["recorded_by_name"] == commercial.name

    async def test_no_endpoint_updates_or_deletes_a_payment(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(manager)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        [payment] = await _payment_rows(db_session, reservation_id)
        base = f"/api/reservations/{reservation_id}/payments"

        for method in ("put", "patch", "delete"):
            collection = await client.request(method, base, headers=headers)
            assert collection.status_code == 405, method
            item = await client.request(method, f"{base}/{payment.id}", headers=headers)
            assert item.status_code in (404, 405), method

        [unchanged] = await _payment_rows(db_session, reservation_id)
        assert (unchanged.id, unchanged.amount) == (payment.id, 100000)


class TestConfirmationEmail:
    async def test_one_confirmation_per_payment(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
        confirmations: SentConfirmations,
    ) -> None:
        headers = auth_headers(commercial)
        lot, reservation_id = await _engaged(client, db_session, manager, headers)
        summary = await _summary(client, headers, reservation_id)

        await _pay(
            client, headers, reservation_id, _inst(summary, "deposit")["id"], 1000
        )
        await _pay(client, headers, reservation_id, _inst(summary, "gap")["id"], 2000)

        assert [
            (c["client_email"], c["amount"], c["payment_type"], c["lot_numero"])
            for c in confirmations.calls
        ] == [
            ("buyer@example.com", 1000, "deposit", lot.numero),
            ("buyer@example.com", 2000, "gap", lot.numero),
        ]
        assert confirmations.calls[1]["schedule_total"] == 50000

    async def test_email_failure_does_not_block_the_payment(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
        confirmations: SentConfirmations,
    ) -> None:
        confirmations.error = RuntimeError("resend down")
        headers = auth_headers(commercial)
        _, reservation_id = await _engaged(client, db_session, manager, headers)
        deposit = _inst(await _summary(client, headers, reservation_id), "deposit")

        response = await _pay(client, headers, reservation_id, deposit["id"], 1000)

        assert response.status_code == 201, response.text
        assert len(confirmations.calls) == 1
        assert len(await _payment_rows(db_session, reservation_id)) == 2


class TestConcurrency:
    def test_installment_is_locked_before_checking_the_remaining(self) -> None:
        """Two payments on one installment are serialised (PostgreSQL)."""
        from app.infrastructure.database.repositories.reservation_payment_repository import (
            installment_for_update,
        )

        sql = str(installment_for_update(42).compile(dialect=postgresql.dialect()))

        assert "FOR UPDATE" in sql
        assert "payment_installments" in sql


class TestDashboardsUseReceivedAmounts:
    async def test_dashboard_lots_counts_partial_payments_and_first_payment(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(manager)
        lot, reservation_id = await _engaged(client, db_session, manager, headers)
        summary = await _summary(client, headers, reservation_id)
        await _pay(
            client, headers, reservation_id, _inst(summary, "deposit")["id"], 75000
        )
        await _pay(client, headers, reservation_id, _inst(summary, "gap")["id"], 25000)

        response = await client.get(
            "/api/dashboard/lots",
            headers=headers,
            params={"project_id": lot.project_id},
        )

        assert response.status_code == 200, response.text
        [row] = [r for r in response.json() if r["id"] == lot.id]
        # Deposit phase: (first payment 100 000 + 75 000) / (100 000 + 150 000).
        assert row["deposit_paid_pct"] == 70
        # Balance phase, gap included: 25 000 / (200 000 + 50 000).
        assert row["balance_paid_pct"] == 10
        # The partially received deposit installment is still due.
        assert row["first_deposit_days"] is not None

    async def test_geojson_export_uses_received_amounts(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(manager)
        lot, reservation_id = await _engaged(client, db_session, manager, headers)
        summary = await _summary(client, headers, reservation_id)
        await _pay(
            client, headers, reservation_id, _inst(summary, "deposit")["id"], 150000
        )

        response = await client.get(
            f"/api/projects/{lot.project_id}/lots.geojson", headers=headers
        )

        assert response.status_code == 200, response.text
        [feature] = [
            f for f in response.json()["features"] if f["properties"]["id"] == lot.id
        ]
        assert feature["properties"]["deposit_paid_pct"] == 100
        assert feature["properties"]["balance_paid_pct"] == 0
        assert feature["properties"]["first_deposit_days"] is None


async def test_schedule_row_status_matches_summary(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    commercial: UserModel,
    auth_headers: Headers,
) -> None:
    """``GET /api/payments`` keeps reading the persisted (recomputed) status."""
    headers = auth_headers(commercial)
    _, reservation_id = await _engaged(client, db_session, manager, headers)
    deposit = _inst(await _summary(client, headers, reservation_id), "deposit")
    await _pay(client, headers, reservation_id, deposit["id"], 150000)

    result = await db_session.execute(
        select(PaymentInstallmentModel)
        .join(PaymentScheduleModel)
        .where(PaymentScheduleModel.reservation_id == reservation_id)
        .execution_options(populate_existing=True)
    )
    statuses = {i.id: i.status for i in result.scalars().all()}
    assert statuses[deposit["id"]] == "paid"
    assert sorted(statuses.values()) == ["paid", "pending", "pending", "pending"]
