"""E4-T1: the reservation deed is generated and archived on every engagement."""

from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
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
from app.tests.conftest import FakeStorage
from app.tests.factories import make_client, make_lot, make_project

pytestmark = pytest.mark.integration

Headers = Callable[[UserModel], dict[str, str]]

BUCKET = settings.SUPABASE_DOCUMENTS_BUCKET
DEPOSIT_UNPAID_CERTIFICATE = (
    "Le premier versement d'acompte doit être effectué "
    "avant de générer l'acte de réservation."
)
PROMOTION_PENDING_CERTIFICATE = (
    "Le montant de la promotion n'a pas encore été reçu. "
    "Téléchargez le reçu de paiement en attendant la réception de la promotion."
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
    **engage_fields: Any,
) -> tuple[LotModel, int]:
    """Reach ``reservation_engagee`` through ``route``; return (lot, reservation id)."""
    statuses = ["option"] if route == "option-engage" else None
    project_fields = {"enabled_optional_statuses": statuses} if statuses else {}
    project = await make_project(db_session, manager, **project_fields)
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


async def _legacy_pending_promotion(
    db_session: AsyncSession, reservation_id: int
) -> None:
    """Turn the reservation into a pre-E4-T5 one whose promotion is pending.

    Engagements no longer write ``promotion_*`` (E4-T5); the deed's promotion
    gate is only reachable with such legacy data until it is removed.
    """
    reservation = await db_session.get(ReservationModel, reservation_id)
    assert reservation is not None
    reservation.promotion_amount = 50000
    reservation.promotion_paid_timing = "fin"
    reservation.promotion_received = False
    await db_session.commit()


async def _actes(db_session: AsyncSession, reservation_id: int) -> list[Any]:
    result = await db_session.execute(
        select(LotDocumentModel)
        .where(LotDocumentModel.reservation_id == reservation_id)
        .order_by(LotDocumentModel.id)
    )
    return list(result.scalars().all())


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


async def test_promotion_pending_skips_acte_then_generates_on_receipt(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    commercial: UserModel,
    auth_headers: Headers,
    monkeypatch: pytest.MonkeyPatch,
    failing_storage: FailingStorage,
) -> None:
    """Legacy reservation with a pending promotion and no archived deed."""
    headers = auth_headers(commercial)
    _, reservation_id = await _engage(
        "direct-engage", client, db_session, manager, headers, sale_price=450000
    )
    await _legacy_pending_promotion(db_session, reservation_id)
    storage = FakeStorage()
    monkeypatch.setattr(
        "app.services.document_service.get_storage_client", lambda: storage
    )
    refused = await client.post(
        f"/api/reservations/{reservation_id}/acte", headers=headers
    )
    assert refused.status_code == 400
    assert await _actes(db_session, reservation_id) == []

    response = await client.post(
        f"/api/reservations/{reservation_id}/mark-promotion-received",
        headers=headers,
        json={},
    )

    assert response.status_code == 200, response.text
    assert response.json()["promotion_received"] is True
    docs = await _actes(db_session, reservation_id)
    assert len(docs) == 1
    assert docs[0].category == "acte_reservation"


async def test_mark_promotion_received_keeps_single_acte_when_already_archived(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    commercial: UserModel,
    auth_headers: Headers,
) -> None:
    """No promotion on the deal: the deed exists since the engagement."""
    headers = auth_headers(commercial)
    _, reservation_id = await _engage(
        "direct-engage", client, db_session, manager, headers
    )

    response = await client.post(
        f"/api/reservations/{reservation_id}/mark-promotion-received",
        headers=headers,
        json={},
    )

    assert response.status_code == 200, response.text
    assert len(await _actes(db_session, reservation_id)) == 1


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


async def test_engagement_with_payment_plan_stores_acte_but_manual_download_waits(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    commercial: UserModel,
    auth_headers: Headers,
) -> None:
    """At engagement the first payment is by definition received (spec E4-T1)."""
    headers = auth_headers(commercial)
    _, reservation_id = await _engage(
        "direct-engage",
        client,
        db_session,
        manager,
        headers,
        payment_plan={"deposit_count": 1, "balance_count": 1},
    )

    assert len(await _actes(db_session, reservation_id)) == 1
    response = await client.get(
        f"/api/reservations/{reservation_id}/certificate", headers=headers
    )
    assert response.status_code == 422
    assert response.json() == {"detail": DEPOSIT_UNPAID_CERTIFICATE}


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


async def test_regenerate_refused_while_promotion_pending(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    commercial: UserModel,
    auth_headers: Headers,
) -> None:
    headers = auth_headers(commercial)
    _, reservation_id = await _engage(
        "direct-engage", client, db_session, manager, headers, sale_price=450000
    )
    assert len(await _actes(db_session, reservation_id)) == 1
    await _legacy_pending_promotion(db_session, reservation_id)

    response = await client.post(
        f"/api/reservations/{reservation_id}/acte", headers=headers
    )

    assert response.status_code == 400
    assert response.json()["message"] == PROMOTION_PENDING_CERTIFICATE
    assert len(await _actes(db_session, reservation_id)) == 1


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


@pytest.fixture
def certificate_calls(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    """Keyword arguments of every ``generate_reservation_certificate`` call."""
    calls: list[dict[str, Any]] = []

    def capture(self: CertificateService, **kwargs: Any) -> bytes:
        calls.append(kwargs)
        return b"%PDF-fake"

    monkeypatch.setattr(CertificateService, "generate_reservation_certificate", capture)
    return calls


async def _first_installment(
    db_session: AsyncSession, reservation_id: int
) -> PaymentInstallmentModel:
    result = await db_session.execute(
        select(PaymentInstallmentModel)
        .join(PaymentScheduleModel)
        .where(
            PaymentScheduleModel.reservation_id == reservation_id,
            PaymentInstallmentModel.payment_type == "deposit",
        )
        .order_by(PaymentInstallmentModel.installment_number)
    )
    return result.scalars().first()  # type: ignore[return-value]


class TestArchivedDeedDeposit:
    """The archived deed shows what was actually received at engagement."""

    async def test_cash_engagement_shows_guarantee_and_engagement_date(
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
        assert archived["deposit"] == 50000
        assert archived["deposit_date"] == datetime.now(UTC).date()
        assert archived["lot_price"] == 500000

        # Manual download keeps today's figures (reservations.deposit, no date).
        response = await client.get(
            f"/api/reservations/{reservation_id}/certificate", headers=headers
        )
        assert response.status_code == 200
        manual = certificate_calls[-1]
        assert (manual["deposit"], manual["deposit_date"]) == (0, None)

    async def test_pending_first_installment_shows_guarantee(
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

        first = await _first_installment(db_session, reservation_id)
        assert first.status == "pending"
        assert first.amount != 50000
        archived = certificate_calls[-1]
        assert archived["deposit"] == 50000
        assert archived["deposit_date"] == datetime.now(UTC).date()

    async def test_paid_first_installment_shows_installment_and_paid_date(
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
            payment_plan={"deposit_count": 1, "balance_count": 1},
        )
        first = await _first_installment(db_session, reservation_id)
        # What recording a payment on the installment persists (E4-T5b API).
        db_session.add(
            ReservationPaymentModel(
                reservation_id=reservation_id,
                installment_id=first.id,
                amount=first.amount,
                paid_on=date(2026, 10, 20),
                method="transfer",
            )
        )
        first.status = "paid"
        first.paid_date = datetime(2026, 10, 20, 10, tzinfo=UTC)
        await db_session.commit()

        regenerated = await client.post(
            f"/api/reservations/{reservation_id}/acte", headers=headers
        )

        assert regenerated.status_code == 201, regenerated.text
        archived = certificate_calls[-1]
        assert archived["deposit"] == first.amount
        assert archived["deposit_date"] == date(2026, 10, 20)

        # Manual path unchanged: installment amount, reservation deposit_date.
        response = await client.get(
            f"/api/reservations/{reservation_id}/certificate", headers=headers
        )
        assert response.status_code == 200
        manual = certificate_calls[-1]
        assert (manual["deposit"], manual["deposit_date"]) == (first.amount, None)

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
        assert reservation.guarantee_amount == 10000
        archived = certificate_calls[-1]
        assert archived["deposit"] == 10000
        assert archived["deposit_date"] == datetime.now(UTC).date()

    async def test_refunded_guarantee_is_not_printed_as_paid(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
        certificate_calls: list[dict[str, Any]],
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

        response = await _transition(
            client,
            headers,
            lot.id,
            "engage",
            {
                "guarantee_action": "refund",
                "refund_amount": 10000,
                "refund_date": datetime.now(UTC).date().isoformat(),
            },
        )

        assert response.status_code == 200, response.text
        archived = certificate_calls[-1]
        assert archived["deposit"] != 10000
        assert archived["deposit"] == 0

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


class TestCertificateEndpointsUnchanged:
    """Messages of the legacy PDF endpoints stay byte-identical after delegation."""

    async def test_certificate_endpoints_unchanged(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, unpaid_id = await _engage(
            "direct-engage",
            client,
            db_session,
            manager,
            headers,
            payment_plan={"deposit_count": 1, "balance_count": 1},
        )
        _, promo_id = await _engage(
            "direct-engage", client, db_session, manager, headers, sale_price=450000
        )
        await _legacy_pending_promotion(db_session, promo_id)
        base = "/api/reservations"

        cases = [
            ("get", f"{base}/{unpaid_id}/certificate", DEPOSIT_UNPAID_CERTIFICATE),
            (
                "post",
                f"{base}/{unpaid_id}/certificate/email",
                "Le premier versement d'acompte doit être effectué "
                "avant d'envoyer l'acte de réservation.",
            ),
            (
                "get",
                f"{base}/{unpaid_id}/receipt",
                "Le premier versement d'acompte doit être effectué "
                "avant de générer le reçu de paiement.",
            ),
            ("get", f"{base}/{promo_id}/certificate", PROMOTION_PENDING_CERTIFICATE),
            (
                "post",
                f"{base}/{promo_id}/certificate/email",
                "Le montant de la promotion n'a pas encore été reçu. "
                "L'acte de réservation ne peut être envoyé qu'après réception "
                "de la promotion.",
            ),
        ]
        for method, url, message in cases:
            response = await getattr(client, method)(url, headers=headers)
            assert response.status_code == 422, url
            assert response.json() == {"detail": message}, url

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

    async def test_receipt_still_available_while_promotion_pending(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        manager: UserModel,
        commercial: UserModel,
        auth_headers: Headers,
    ) -> None:
        headers = auth_headers(commercial)
        _, reservation_id = await _engage(
            "direct-engage", client, db_session, manager, headers, sale_price=450000
        )
        await _legacy_pending_promotion(db_session, reservation_id)

        response = await client.get(
            f"/api/reservations/{reservation_id}/receipt", headers=headers
        )

        assert response.status_code == 200
        assert response.content.startswith(b"%PDF")
