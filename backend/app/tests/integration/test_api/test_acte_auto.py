"""E4-T1 / E4-T5b: the reservation deed is archived once the paid threshold is met.

E4-T1 archived the deed on every engagement; E4-T5 gates every issuance
(automatic, regeneration, manual download and email) on the project's
``acte_min_paid_pct`` and prints the advances of rule R4.
"""

from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.infrastructure.database.models import (
    LotDocumentModel,
    LotModel,
    PaymentInstallmentModel,
    PaymentScheduleModel,
    ReservationModel,
    ReservationPaymentModel,
    UserModel,
)
from app.services.certificate_service import CertificateService
from app.services.email_service import EmailService
from app.tests.conftest import FakeStorage
from app.tests.factories import make_client, make_lot, make_project

pytestmark = pytest.mark.integration

Headers = Callable[[UserModel], dict[str, str]]

BUCKET = settings.SUPABASE_DOCUMENTS_BUCKET
THRESHOLD_RULE = "acte_threshold_not_reached"
DEPOSIT_UNPAID_RECEIPT = (
    "Le premier versement d'acompte doit être effectué "
    "avant de générer le reçu de paiement."
)


def _threshold_message(pct: str, received: str, threshold: str) -> str:
    return (
        f"L'acte sera disponible quand {pct} % du prix total convenu aura été "
        f"encaissé ({received} MAD sur {threshold} MAD)."
    )


class FailingStorage(FakeStorage):
    def upload_bytes(self, *args: Any, **kwargs: Any) -> None:
        raise RuntimeError("storage down")


@pytest.fixture
def failing_storage(monkeypatch: pytest.MonkeyPatch) -> FailingStorage:
    storage = FailingStorage()
    monkeypatch.setattr(
        "app.services.document_service.get_storage_client", lambda: storage
    )
    return storage


@pytest.fixture(autouse=True)
def no_payment_email(monkeypatch: pytest.MonkeyPatch) -> None:
    """Recording a payment sends a confirmation: never a real one in tests."""

    async def _skip(*_args: Any, **_kwargs: Any) -> bool:
        return True

    monkeypatch.setattr(EmailService, "send_payment_confirmation", _skip)


def _today() -> date:
    return datetime.now(UTC).date()


def _in_days(days: int) -> str:
    return (datetime.now(UTC) + timedelta(days=days)).isoformat()


def _engage_payload(**extra: Any) -> dict[str, Any]:
    return {"guarantee_amount": 50000, "payment_type": "cash", **extra}


async def _transition(
    client: AsyncClient, headers: dict[str, str], lot_id: int, name: str, json: Any
) -> Any:
    return await client.post(
        f"/api/lots/{lot_id}/transitions/{name}", headers=headers, json=json
    )


async def _engage(
    route: str,
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    headers: dict[str, str],
    buyer_id: int | None = None,
    project_fields: dict[str, Any] | None = None,
    **engage_fields: Any,
) -> tuple[LotModel, int]:
    """Reach ``reservation_engagee`` through ``route``; return (lot, reservation id).

    Every route receives 50 000 at engagement: exactly the default threshold
    (10 % of 500 000).
    """
    fields = dict(project_fields or {})
    if route == "option-engage":
        fields["enabled_optional_statuses"] = ["option"]
    project = await make_project(db_session, manager, **fields)
    lot = await make_lot(db_session, project, status="available")
    if buyer_id is None:
        buyer_id = (await make_client(db_session, manager)).id

    if route == "direct-engage":
        response = await _transition(
            client,
            headers,
            lot.id,
            "direct-engage",
            _engage_payload(client_id=buyer_id, **engage_fields),
        )
    elif route == "engage":
        prep = await _transition(
            client,
            headers,
            lot.id,
            "direct-reservation",
            {
                "client_id": buyer_id,
                "guarantee_amount": 50000,
                "payment_type": "cash",
                "finalization_date": _in_days(15),
            },
        )
        assert prep.status_code == 200, prep.text
        response = await _transition(
            client,
            headers,
            lot.id,
            "engage",
            {"guarantee_action": "deduct", **engage_fields},
        )
    else:
        prep = await _transition(
            client,
            headers,
            lot.id,
            "start-option",
            {"client_id": buyer_id, "expiration_date": _in_days(7)},
        )
        assert prep.status_code == 200, prep.text
        response = await _transition(
            client, headers, lot.id, "option-engage", _engage_payload(**engage_fields)
        )

    assert response.status_code == 200, response.text
    await db_session.refresh(lot)
    assert lot.status == "reservation_engagee"
    assert lot.current_reservation_id is not None
    return lot, lot.current_reservation_id


async def _refunded_engagement(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    headers: dict[str, str],
    **project_fields: Any,
) -> tuple[LotModel, int]:
    """Engaged reservation whose guarantee was refunded: nothing received."""
    project = await make_project(db_session, manager, **project_fields)
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
    response = await _transition(
        client,
        headers,
        lot.id,
        "engage",
        {
            "guarantee_action": "refund",
            "refund_amount": 10000,
            "refund_date": _today().isoformat(),
        },
    )
    assert response.status_code == 200, response.text
    assert lot.id is not None
    return lot, response.json()["current_reservation_id"]


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


async def _installments(
    db_session: AsyncSession, reservation_id: int, payment_type: str
) -> list[PaymentInstallmentModel]:
    result = await db_session.execute(
        select(PaymentInstallmentModel)
        .join(PaymentScheduleModel)
        .where(
            PaymentScheduleModel.reservation_id == reservation_id,
            PaymentInstallmentModel.payment_type == payment_type,
        )
        .order_by(PaymentInstallmentModel.installment_number)
    )
    return list(result.scalars().all())


async def _pay(
    client: AsyncClient,
    headers: dict[str, str],
    reservation_id: int,
    installment_id: int,
    amount: float,
    paid_on: date | None = None,
) -> Response:
    response = await client.post(
        f"/api/reservations/{reservation_id}/payments",
        headers=headers,
        data={
            "amount": str(amount),
            "paid_on": (paid_on or _today()).isoformat(),
            "method": "transfer",
            "installment_id": str(installment_id),
        },
    )
    assert response.status_code == 201, response.text
    return response


ROUTES = ["direct-engage", "engage", "option-engage"]


@pytest.mark.parametrize("route", ROUTES)
async def test_engagement_stores_acte(
    route: str,
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    commercial: UserModel,
    auth_headers: Headers,
    fake_storage: FakeStorage,
) -> None:
    lot, reservation_id = await _engage(
        route, client, db_session, manager, auth_headers(commercial)
    )

    docs = await _actes(db_session, reservation_id)
    assert len(docs) == 1
    doc = docs[0]
    assert doc.category == "acte_reservation"
    assert doc.lot_id == lot.id
    assert doc.reservation_id == reservation_id
    assert doc.content_type == "application/pdf"
    assert doc.uploaded_by_user_id == commercial.id
    assert doc.filename == f"acte_reservation_{reservation_id}_lot{lot.numero}.pdf"
    assert doc.file_path == f"{lot.id}/{doc.id}_{doc.filename}"
    assert fake_storage.files[(BUCKET, doc.file_path)].startswith(b"%PDF")


async def test_archived_acte_is_listed_with_its_category(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    commercial: UserModel,
    auth_headers: Headers,
) -> None:
    headers = auth_headers(commercial)
    lot, _ = await _engage("direct-engage", client, db_session, manager, headers)

    response = await client.get(f"/api/lots/{lot.id}/documents", headers=headers)

    assert response.status_code == 200
    assert [d["category"] for d in response.json()] == ["acte_reservation"]


async def test_acte_uses_acte_address(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    commercial: UserModel,
    auth_headers: Headers,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def fake_certificate(self: CertificateService, **kwargs: Any) -> bytes:
        captured.update(kwargs)
        return b"%PDF-fake"

    monkeypatch.setattr(
        CertificateService, "generate_reservation_certificate", fake_certificate
    )
    buyer = await make_client(
        db_session,
        manager,
        address_morocco="5 avenue Hassan II",
        city_morocco="Rabat",
        address_abroad="12 rue de l’Église",
        city_abroad="Abidjan",
        country_abroad="Côte d’Ivoire",
        acte_address="abroad",
    )

    _, reservation_id = await _engage(
        "direct-engage",
        client,
        db_session,
        manager,
        auth_headers(commercial),
        buyer_id=buyer.id,
    )

    assert captured["client_address"] == "12 rue de l’Église, Abidjan, Côte d’Ivoire"
    assert len(await _actes(db_session, reservation_id)) == 1


@pytest.mark.parametrize("route", ROUTES)
async def test_engage_succeeds_when_storage_fails(
    route: str,
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    commercial: UserModel,
    auth_headers: Headers,
    failing_storage: FailingStorage,
) -> None:
    _, reservation_id = await _engage(
        route, client, db_session, manager, auth_headers(commercial)
    )

    assert await _actes(db_session, reservation_id) == []
    all_docs = (await db_session.execute(select(LotDocumentModel))).scalars().all()
    assert all_docs == []


async def test_engage_succeeds_when_pdf_generation_fails(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    commercial: UserModel,
    auth_headers: Headers,
    monkeypatch: pytest.MonkeyPatch,
    fake_storage: FakeStorage,
) -> None:
    def broken(self: CertificateService, **kwargs: Any) -> bytes:
        raise ValueError("fpdf exploded")

    monkeypatch.setattr(CertificateService, "generate_reservation_certificate", broken)

    _, reservation_id = await _engage(
        "direct-engage", client, db_session, manager, auth_headers(commercial)
    )

    assert await _actes(db_session, reservation_id) == []
    assert fake_storage.files == {}


async def test_sale_price_below_catalogue_stores_acte(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    commercial: UserModel,
    auth_headers: Headers,
) -> None:
    """The gap (agreed - deed price) is an installment, not a pending promotion."""
    _, reservation_id = await _engage(
        "direct-engage",
        client,
        db_session,
        manager,
        auth_headers(commercial),
        sale_price=450000,
    )

    reservation = await db_session.get(ReservationModel, reservation_id)
    assert reservation is not None
    await db_session.refresh(reservation)
    assert reservation.promotion_amount is None
    assert len(await _actes(db_session, reservation_id)) == 1


async def test_regenerate_creates_new_version(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    commercial: UserModel,
    auth_headers: Headers,
    monkeypatch: pytest.MonkeyPatch,
    failing_storage: FailingStorage,
) -> None:
    headers = auth_headers(commercial)
    lot, reservation_id = await _engage(
        "direct-engage", client, db_session, manager, headers
    )
    assert await _actes(db_session, reservation_id) == []

    storage = FakeStorage()
    monkeypatch.setattr(
        "app.services.document_service.get_storage_client", lambda: storage
    )
    versions = iter([b"%PDF-version-1", b"%PDF-version-2"])
    monkeypatch.setattr(
        CertificateService,
        "generate_reservation_certificate",
        lambda self, **kwargs: next(versions),
    )

    first = await client.post(
        f"/api/reservations/{reservation_id}/acte", headers=headers
    )
    second = await client.post(
        f"/api/reservations/{reservation_id}/acte", headers=headers
    )

    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    body = second.json()
    assert body["category"] == "acte_reservation"
    assert body["lot_id"] == lot.id
    assert body["reservation_id"] == reservation_id
    assert body["id"] != first.json()["id"]
    assert len(await _actes(db_session, reservation_id)) == 2

    latest = await client.get(
        f"/api/reservations/{reservation_id}/acte", headers=headers
    )
    assert latest.status_code == 200
    assert latest.headers["content-type"] == "application/pdf"
    assert latest.content == b"%PDF-version-2"
    assert (
        f'filename="acte_reservation_{reservation_id}_lot{lot.numero}.pdf"'
        in latest.headers["content-disposition"]
    )


async def test_regenerate_returns_502_when_storage_fails(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    commercial: UserModel,
    auth_headers: Headers,
    failing_storage: FailingStorage,
) -> None:
    headers = auth_headers(commercial)
    _, reservation_id = await _engage(
        "direct-engage", client, db_session, manager, headers
    )

    response = await client.post(
        f"/api/reservations/{reservation_id}/acte", headers=headers
    )

    assert response.status_code == 502
    assert response.json() == {"detail": "La génération de l'acte a échoué. Réessayez."}
    assert await _actes(db_session, reservation_id) == []


async def test_get_acte_404_when_none(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    commercial: UserModel,
    auth_headers: Headers,
    failing_storage: FailingStorage,
) -> None:
    headers = auth_headers(commercial)
    _, reservation_id = await _engage(
        "direct-engage", client, db_session, manager, headers
    )

    response = await client.get(
        f"/api/reservations/{reservation_id}/acte", headers=headers
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Aucun acte archivé pour cette réservation."}


async def test_acte_endpoints_unknown_reservation(
    client: AsyncClient,
    commercial: UserModel,
    auth_headers: Headers,
) -> None:
    headers = auth_headers(commercial)

    get = await client.get("/api/reservations/9999/acte", headers=headers)
    post = await client.post("/api/reservations/9999/acte", headers=headers)

    assert get.status_code == 404
    assert post.status_code == 404


async def test_mark_promotion_received_endpoint_is_removed(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    commercial: UserModel,
    auth_headers: Headers,
) -> None:
    headers = auth_headers(commercial)
    _, reservation_id = await _engage(
        "direct-engage", client, db_session, manager, headers
    )

    response = await client.post(
        f"/api/reservations/{reservation_id}/mark-promotion-received",
        headers=headers,
        json={},
    )

    assert response.status_code == 404


class TestActeThreshold:
    """Spec E4-T5: the deed needs > 0 and >= acte_min_paid_pct % of the agreed."""

    async def test_below_threshold_no_deed_then_crossing_payment_archives_once(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engage(
            "direct-engage",
            client,
            db_session,
            manager,
            headers,
            project_fields={"acte_min_paid_pct": 30},
            guarantee_amount=100000,
            payment_plan={"deposit_pct": 50, "deposit_count": 1, "balance_count": 1},
        )
        assert await _actes(db_session, reservation_id) == []
        message = _threshold_message("30", "100 000", "150 000")

        base = f"/api/reservations/{reservation_id}"
        for method, url in [
            ("get", f"{base}/certificate"),
            ("post", f"{base}/certificate/email"),
            ("post", f"{base}/acte"),
        ]:
            refused = await getattr(client, method)(url, headers=headers)
            assert refused.status_code == 400, url
            assert refused.json()["message"] == message, url
            assert refused.json()["details"][0]["rule"] == THRESHOLD_RULE, url
        assert await _actes(db_session, reservation_id) == []

        summary = (
            await client.get(f"{base}/financial-summary", headers=headers)
        ).json()
        assert summary["acte_available"] is False
        assert summary["acte_threshold_amount"] == 150000

        [deposit] = await _installments(db_session, reservation_id, "deposit")
        await _pay(client, headers, reservation_id, deposit.id, 40000)
        assert await _actes(db_session, reservation_id) == []

        await _pay(client, headers, reservation_id, deposit.id, 10000)
        archived = await _actes(db_session, reservation_id)
        assert len(archived) == 1
        assert archived[0].uploaded_by_user_id == commercial.id

        await _pay(client, headers, reservation_id, deposit.id, 5000)
        assert [d.id for d in await _actes(db_session, reservation_id)] == [
            archived[0].id
        ]
        certificate = await client.get(f"{base}/certificate", headers=headers)
        assert certificate.status_code == 200
        summary = (
            await client.get(f"{base}/financial-summary", headers=headers)
        ).json()
        assert summary["acte_available"] is True

    async def test_threshold_is_compared_to_the_cent(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engage(
            "direct-engage",
            client,
            db_session,
            manager,
            headers,
            guarantee_amount=49999.99,
        )

        assert await _actes(db_session, reservation_id) == []
        response = await client.get(
            f"/api/reservations/{reservation_id}/certificate", headers=headers
        )
        assert response.status_code == 400
        assert response.json()["message"] == _threshold_message(
            "10", "49 999,99", "50 000"
        )

    async def test_decimal_percentage_in_the_message(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engage(
            "direct-engage",
            client,
            db_session,
            manager,
            headers,
            project_fields={"acte_min_paid_pct": 12.5},
        )

        response = await client.get(
            f"/api/reservations/{reservation_id}/certificate", headers=headers
        )

        assert response.status_code == 400
        assert response.json()["message"] == _threshold_message(
            "12,5", "50 000", "62 500"
        )

    async def test_nothing_received_never_reaches_a_zero_threshold(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _refunded_engagement(
            client, db_session, manager, headers, acte_min_paid_pct=0
        )

        assert await _actes(db_session, reservation_id) == []
        response = await client.get(
            f"/api/reservations/{reservation_id}/certificate", headers=headers
        )
        assert response.status_code == 400
        assert response.json()["message"] == _threshold_message("0", "0", "0")

        [balance] = await _installments(db_session, reservation_id, "balance")
        await _pay(client, headers, reservation_id, balance.id, 1)
        assert len(await _actes(db_session, reservation_id)) == 1

    async def test_crossing_payment_succeeds_when_the_deed_fails(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engage(
            "direct-engage",
            client,
            db_session,
            manager,
            headers,
            project_fields={"acte_min_paid_pct": 30},
            guarantee_amount=100000,
        )
        storage = FailingStorage()
        monkeypatch.setattr(
            "app.services.document_service.get_storage_client", lambda: storage
        )
        [balance] = await _installments(db_session, reservation_id, "balance")

        response = await _pay(client, headers, reservation_id, balance.id, 50000)

        assert response.json()["amount"] == 50000
        assert await _actes(db_session, reservation_id) == []
        payments = await db_session.execute(
            select(ReservationPaymentModel).where(
                ReservationPaymentModel.reservation_id == reservation_id
            )
        )
        assert len(payments.scalars().all()) == 2

    async def test_manual_download_with_a_pending_deposit_installment(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        """The E4-T1 « premier versement payé » rule is gone: only the threshold."""
        headers = auth_headers(commercial)
        _, reservation_id = await _engage(
            "direct-engage",
            client,
            db_session,
            manager,
            headers,
            payment_plan={"deposit_count": 1, "balance_count": 1},
        )
        [deposit] = await _installments(db_session, reservation_id, "deposit")
        assert deposit.status == "pending"

        response = await client.get(
            f"/api/reservations/{reservation_id}/certificate", headers=headers
        )

        assert response.status_code == 200
        assert len(await _actes(db_session, reservation_id)) == 1

    async def test_receipt_available_below_threshold(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engage(
            "direct-engage",
            client,
            db_session,
            manager,
            headers,
            project_fields={"acte_min_paid_pct": 50},
            payment_plan={"deposit_count": 1, "balance_count": 1},
        )

        certificate = await client.get(
            f"/api/reservations/{reservation_id}/certificate", headers=headers
        )
        receipt = await client.get(
            f"/api/reservations/{reservation_id}/receipt", headers=headers
        )

        assert certificate.status_code == 400
        assert receipt.status_code == 200
        assert receipt.content.startswith(b"%PDF")


@pytest.fixture
def certificate_calls(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    """Keyword arguments of every ``generate_reservation_certificate`` call."""
    calls: list[dict[str, Any]] = []

    def capture(self: CertificateService, **kwargs: Any) -> bytes:
        calls.append(kwargs)
        return b"%PDF-fake"

    monkeypatch.setattr(CertificateService, "generate_reservation_certificate", capture)
    return calls


async def _manual(
    client: AsyncClient,
    headers: dict[str, str],
    reservation_id: int,
    certificate_calls: list[dict[str, Any]],
) -> dict[str, Any]:
    response = await client.get(
        f"/api/reservations/{reservation_id}/certificate", headers=headers
    )
    assert response.status_code == 200, response.text
    return certificate_calls[-1]


def _printed(call: dict[str, Any]) -> tuple[Any, Any, Any]:
    return call["deposit"], call["deposit_date"], call["lot_price"]


class TestDeedAdvances:
    """R4: advances = first payment + deposit/balance payments (gap excluded),
    capped at the deed price; date = the last of those payments. The archived
    and the downloaded deed print the same figures."""

    async def test_cash_engagement_prints_first_payment_and_its_date(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
        certificate_calls: list[dict[str, Any]],
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engage(
            "direct-engage", client, db_session, manager, headers
        )

        archived = certificate_calls[-1]
        assert _printed(archived) == (50000, _today(), 500000)
        manual = await _manual(client, headers, reservation_id, certificate_calls)
        assert _printed(manual) == (50000, _today(), 500000)

    async def test_pending_first_installment_is_not_printed(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
        certificate_calls: list[dict[str, Any]],
    ) -> None:
        _, reservation_id = await _engage(
            "direct-engage",
            client,
            db_session,
            manager,
            auth_headers(commercial),
            payment_plan={"deposit_count": 1, "balance_count": 1},
        )

        [first] = await _installments(db_session, reservation_id, "deposit")
        assert first.status == "pending"
        assert first.amount != 50000
        archived = certificate_calls[-1]
        assert archived["deposit"] == 50000
        assert archived["deposit_date"] == _today()

    async def test_deposit_and_balance_payments_are_added_gap_excluded(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
        certificate_calls: list[dict[str, Any]],
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engage(
            "direct-engage",
            client,
            db_session,
            manager,
            headers,
            guarantee_amount=100000,
            agreed_total_price=500000,
            sale_price=450000,
            gap_due_timing="fin",
            payment_plan={"deposit_pct": 50, "deposit_count": 1, "balance_count": 2},
        )
        # Engaged ten days ago, so the payments below are the latest ones.
        result = await db_session.execute(
            select(ReservationPaymentModel).where(
                ReservationPaymentModel.reservation_id == reservation_id
            )
        )
        result.scalar_one().paid_on = _today() - timedelta(days=10)
        await db_session.commit()
        [deposit] = await _installments(db_session, reservation_id, "deposit")
        balance = (await _installments(db_session, reservation_id, "balance"))[0]
        [gap] = await _installments(db_session, reservation_id, "gap")
        await _pay(
            client,
            headers,
            reservation_id,
            deposit.id,
            150000,
            _today() - timedelta(days=5),
        )
        await _pay(
            client,
            headers,
            reservation_id,
            balance.id,
            30000,
            _today() - timedelta(days=3),
        )
        # The gap is not on the deed: neither its amount nor its date.
        await _pay(client, headers, reservation_id, gap.id, 20000, _today())

        regenerated = await client.post(
            f"/api/reservations/{reservation_id}/acte", headers=headers
        )
        assert regenerated.status_code == 201, regenerated.text
        expected = (280000, _today() - timedelta(days=3), 450000)
        assert _printed(certificate_calls[-1]) == expected
        manual = await _manual(client, headers, reservation_id, certificate_calls)
        assert _printed(manual) == expected

    async def test_plan_without_deposit_part_prints_received_amounts(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
        certificate_calls: list[dict[str, Any]],
    ) -> None:
        """20 % plan fully covered by the first payment: no deposit installment."""
        headers = auth_headers(commercial)
        _, reservation_id = await _engage(
            "direct-engage",
            client,
            db_session,
            manager,
            headers,
            guarantee_amount=100000,
            payment_plan={"deposit_pct": 20, "deposit_count": 1, "balance_count": 1},
        )
        assert await _installments(db_session, reservation_id, "deposit") == []
        assert certificate_calls[-1]["deposit"] == 100000

        manual = await _manual(client, headers, reservation_id, certificate_calls)
        assert _printed(manual) == (100000, _today(), 500000)

        [balance] = await _installments(db_session, reservation_id, "balance")
        await _pay(client, headers, reservation_id, balance.id, 50000)
        manual = await _manual(client, headers, reservation_id, certificate_calls)
        assert _printed(manual) == (150000, _today(), 500000)

    async def test_advances_are_capped_at_the_deed_price(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
        certificate_calls: list[dict[str, Any]],
    ) -> None:
        _, reservation_id = await _engage(
            "direct-engage",
            client,
            db_session,
            manager,
            auth_headers(commercial),
            guarantee_amount=150000,
            agreed_total_price=500000,
            sale_price=100000,
        )

        assert len(await _actes(db_session, reservation_id)) == 1
        assert _printed(certificate_calls[-1]) == (100000, _today(), 100000)

    async def test_engage_from_reservation_a_finaliser_shows_stored_guarantee(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
        certificate_calls: list[dict[str, Any]],
    ) -> None:
        _, reservation_id = await _engage(
            "engage", client, db_session, manager, auth_headers(commercial)
        )

        reservation = await db_session.get(ReservationModel, reservation_id)
        assert reservation is not None
        assert reservation.guarantee_amount == 50000
        archived = certificate_calls[-1]
        assert archived["deposit"] == 50000
        assert archived["deposit_date"] == _today()

    async def test_refunded_guarantee_is_never_printed(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
        certificate_calls: list[dict[str, Any]],
    ) -> None:
        """Nothing received: no deed; the first payment then prints alone."""
        headers = auth_headers(commercial)
        _, reservation_id = await _refunded_engagement(
            client, db_session, manager, headers
        )
        assert certificate_calls == []
        assert await _actes(db_session, reservation_id) == []

        [balance] = await _installments(db_session, reservation_id, "balance")
        await _pay(client, headers, reservation_id, balance.id, 60000)

        assert len(await _actes(db_session, reservation_id)) == 1
        assert certificate_calls[-1]["deposit"] == 60000

    async def test_option_deposit_kept_is_printed_with_the_first_payment(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
        certificate_calls: list[dict[str, Any]],
    ) -> None:
        headers = auth_headers(commercial)
        project = await make_project(
            db_session, manager, enabled_optional_statuses=["option"]
        )
        lot = await make_lot(db_session, project, status="available")
        buyer = await make_client(db_session, manager)
        option = await _transition(
            client,
            headers,
            lot.id,
            "start-option",
            {"client_id": buyer.id, "expiration_date": _in_days(7), "deposit": 20000},
        )
        assert option.status_code == 200, option.text

        response = await _transition(
            client,
            headers,
            lot.id,
            "option-engage",
            {
                "guarantee_amount": 100000,
                "payment_type": "cash",
                "deposit_action": "deduct",
            },
        )

        assert response.status_code == 200, response.text
        assert certificate_calls[-1]["deposit"] == 120000


class TestCertificateEndpoints:
    """Errors of the PDF endpoints once the E4-T1 rules are replaced."""

    async def test_not_ready_and_unknown_reservation_errors(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, refunded_id = await _refunded_engagement(
            client, db_session, manager, headers
        )
        base = "/api/reservations"
        message = _threshold_message("10", "0", "50 000")

        for method, suffix in [("get", "certificate"), ("post", "certificate/email")]:
            response = await getattr(client, method)(
                f"{base}/{refunded_id}/{suffix}", headers=headers
            )
            assert response.status_code == 400, suffix
            assert response.json()["message"] == message, suffix
            assert response.json()["details"][0]["rule"] == THRESHOLD_RULE

        # The receipt is about the first payment: none was kept.
        receipt = await client.get(f"{base}/{refunded_id}/receipt", headers=headers)
        assert receipt.status_code == 422
        assert receipt.json() == {"detail": DEPOSIT_UNPAID_RECEIPT}

        for method, suffix in [
            ("get", "certificate"),
            ("post", "certificate/email"),
            ("get", "receipt"),
        ]:
            response = await getattr(client, method)(
                f"{base}/9999/{suffix}", headers=headers
            )
            assert response.status_code == 404, suffix
            assert response.json() == {"detail": "Reservation 9999 not found"}

    async def test_email_without_client_email_unchanged(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        buyer = await make_client(db_session, manager, email=None)
        _, reservation_id = await _engage(
            "direct-engage", client, db_session, manager, headers, buyer_id=buyer.id
        )

        response = await client.post(
            f"/api/reservations/{reservation_id}/certificate/email", headers=headers
        )

        assert response.status_code == 422
        assert response.json() == {
            "detail": "Le client n'a pas d'adresse email enregistrée."
        }

    async def test_receipt_prints_the_first_payment(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        captured: dict[str, Any] = {}

        def fake_receipt(self: CertificateService, **kwargs: Any) -> bytes:
            captured.update(kwargs)
            return b"%PDF-receipt"

        monkeypatch.setattr(
            CertificateService, "generate_payment_receipt", fake_receipt
        )
        headers = auth_headers(commercial)
        _, reservation_id = await _engage(
            "direct-engage",
            client,
            db_session,
            manager,
            headers,
            payment_plan={"deposit_count": 1, "balance_count": 1},
        )

        response = await client.get(
            f"/api/reservations/{reservation_id}/receipt", headers=headers
        )

        assert response.status_code == 200
        assert (captured["deposit_amount"], captured["deposit_date"]) == (
            50000,
            _today(),
        )
