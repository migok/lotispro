"""E4-T2: notification service, ``POST /reservations/{id}/notify`` and history."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.infrastructure.database.models import (
    LotDocumentModel,
    LotModel,
    NotificationModel,
    UserModel,
)
from app.services.email_service import EmailService
from app.services.notifications.channels import Attachment, DeliveryResult
from app.tests.factories import make_client, make_lot, make_project

pytestmark = pytest.mark.integration

Headers = Callable[[UserModel], dict[str, str]]

NO_EMAIL = "Le client n'a pas d'adresse email."
KIND_MISMATCH = "Ce type de notification ne correspond pas au statut du lot."
FILTER_REQUIRED = "Indiquez client_id ou lot_id."

RESPONSE_KEYS = {
    "id",
    "client_id",
    "lot_id",
    "reservation_id",
    "recipient",
    "channel",
    "kind",
    "status",
    "error",
    "deadline_at",
    "sent_at",
    "sent_by_user_id",
    "sent_by_name",
}


class SentEmails:
    """Records the calls made to the patched ``EmailService.send_email``.

    An instance set on the class is not a descriptor: it gets no ``self``.
    """

    def __init__(self, result: DeliveryResult) -> None:
        self.result = result
        self.calls: list[dict[str, Any]] = []

    async def __call__(
        self,
        to: str,
        subject: str,
        html: str,
        attachments: list[Attachment] | None = None,
    ) -> DeliveryResult:
        self.calls.append(
            {"to": to, "subject": subject, "html": html, "attachments": attachments}
        )
        return self.result


@pytest.fixture(autouse=True)
def no_real_email(monkeypatch: pytest.MonkeyPatch) -> None:
    """Safety net: nothing in this module may reach Resend."""

    def _refuse(*_args: Any, **_kwargs: Any) -> None:
        raise AssertionError("Resend must not be called in tests")

    monkeypatch.setattr("resend.Emails.send", _refuse)


@pytest.fixture
def sent_emails(monkeypatch: pytest.MonkeyPatch) -> SentEmails:
    recorder = SentEmails(DeliveryResult(status="sent"))
    monkeypatch.setattr(EmailService, "send_email", recorder)
    return recorder


def _in_days(days: int) -> str:
    return (datetime.now(UTC) + timedelta(days=days)).isoformat()


async def _lot_in(
    status: str,
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    headers: dict[str, str],
    **client_fields: Any,
) -> tuple[LotModel, int]:
    """A lot brought to ``status`` through the API; returns (lot, reservation id)."""
    project = await make_project(db_session, manager)
    lot = await make_lot(db_session, project, status="available")
    buyer = await make_client(db_session, manager, **client_fields)
    name, payload = {
        "option": (
            "start-option",
            {
                "client_id": buyer.id,
                "expiration_date": _in_days(7),
                "deposit": 10000,
            },
        ),
        "reservation_a_finaliser": (
            "direct-reservation",
            {
                "client_id": buyer.id,
                "guarantee_amount": 20000,
                "payment_type": "cash",
                "finalization_date": _in_days(15),
            },
        ),
        "reservation_engagee": (
            "direct-engage",
            {"client_id": buyer.id, "guarantee_amount": 50000, "payment_type": "cash"},
        ),
    }[status]
    response = await client.post(
        f"/api/lots/{lot.id}/transitions/{name}", headers=headers, json=payload
    )
    assert response.status_code == 200, response.text
    await db_session.refresh(lot)
    assert lot.status == status
    assert lot.current_reservation_id is not None
    return lot, lot.current_reservation_id


async def _notify(
    client: AsyncClient,
    headers: dict[str, str],
    reservation_id: int,
    kind: str,
    channels: list[str],
) -> Any:
    return await client.post(
        f"/api/reservations/{reservation_id}/notify",
        headers=headers,
        json={"channels": channels, "kind": kind},
    )


async def _rows(db_session: AsyncSession) -> list[NotificationModel]:
    result = await db_session.execute(
        select(NotificationModel).order_by(NotificationModel.id)
    )
    return list(result.scalars().all())


async def test_notify_email_sent(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
    sent_emails: SentEmails,
) -> None:
    headers = auth_headers(manager)
    lot, reservation_id = await _lot_in(
        "option", client, db_session, manager, headers, email="fatima@example.com"
    )

    response = await _notify(
        client, headers, reservation_id, "option_confirmee", ["email"]
    )

    assert response.status_code == 200, response.text
    [item] = response.json()
    assert set(item) == RESPONSE_KEYS
    assert item["status"] == "sent"
    assert item["error"] is None
    assert item["channel"] == "email"
    assert item["kind"] == "option_confirmee"
    assert item["recipient"] == "client"
    assert item["reservation_id"] == reservation_id
    assert item["lot_id"] == lot.id
    assert item["sent_by_user_id"] == manager.id
    assert item["deadline_at"] is not None

    [call] = sent_emails.calls
    assert call["to"] == "fatima@example.com"
    assert call["subject"].startswith("Confirmation d'option — Lot ")
    assert lot.numero in call["html"]
    assert "10 000,00 DH" in call["html"]
    assert manager.email in call["html"]
    assert not call["attachments"]

    [row] = await _rows(db_session)
    assert row.status == "sent"
    assert row.client_id == item["client_id"]


async def test_notify_without_email_records_failure(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
    sent_emails: SentEmails,
) -> None:
    headers = auth_headers(manager)
    _, reservation_id = await _lot_in(
        "option", client, db_session, manager, headers, email=None
    )

    response = await _notify(
        client, headers, reservation_id, "option_confirmee", ["email"]
    )

    assert response.status_code == 200, response.text
    [item] = response.json()
    assert item["status"] == "failed"
    assert item["error"] == NO_EMAIL
    assert sent_emails.calls == []
    [row] = await _rows(db_session)
    assert (row.status, row.error) == ("failed", NO_EMAIL)


async def test_notify_without_resend_key_not_configured(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "RESEND_API_KEY", None)
    headers = auth_headers(manager)
    _, reservation_id = await _lot_in(
        "reservation_a_finaliser", client, db_session, manager, headers
    )

    response = await _notify(
        client, headers, reservation_id, "reservation_a_finaliser", ["email"]
    )

    assert response.status_code == 200, response.text
    [item] = response.json()
    assert item["status"] == "not_configured"
    assert item["error"]
    [row] = await _rows(db_session)
    assert row.status == "not_configured"


async def test_sms_and_whatsapp_not_configured(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
    sent_emails: SentEmails,
) -> None:
    headers = auth_headers(manager)
    _, reservation_id = await _lot_in("option", client, db_session, manager, headers)

    response = await _notify(
        client,
        headers,
        reservation_id,
        "option_confirmee",
        ["email", "sms", "whatsapp"],
    )

    assert response.status_code == 200, response.text
    statuses = {item["channel"]: item["status"] for item in response.json()}
    assert statuses == {
        "email": "sent",
        "sms": "not_configured",
        "whatsapp": "not_configured",
    }
    assert len(sent_emails.calls) == 1
    assert len(await _rows(db_session)) == 3


async def test_channel_exception_is_recorded_not_raised(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _boom(*_args: Any, **_kwargs: Any) -> DeliveryResult:
        raise RuntimeError("provider exploded")

    monkeypatch.setattr(EmailService, "send_email", _boom)
    headers = auth_headers(manager)
    _, reservation_id = await _lot_in("option", client, db_session, manager, headers)

    response = await _notify(
        client, headers, reservation_id, "option_confirmee", ["email", "sms"]
    )

    assert response.status_code == 200, response.text
    statuses = {item["channel"]: item["status"] for item in response.json()}
    assert statuses == {"email": "failed", "sms": "not_configured"}
    [email_row, _] = await _rows(db_session)
    assert email_row.error


async def test_engagee_email_attaches_acte(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
    sent_emails: SentEmails,
) -> None:
    headers = auth_headers(manager)
    # The engagement archives the deed in the (fake) document storage.
    _, reservation_id = await _lot_in(
        "reservation_engagee", client, db_session, manager, headers
    )

    response = await _notify(
        client, headers, reservation_id, "reservation_engagee", ["email"]
    )

    assert response.status_code == 200, response.text
    assert response.json()[0]["status"] == "sent"
    [call] = sent_emails.calls
    [attachment] = call["attachments"]
    assert attachment.filename.endswith(".pdf")
    assert attachment.content.startswith(b"%PDF")
    assert "acte de réservation" in call["html"].lower()


async def test_engagee_without_archived_acte_sends_without_attachment(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
    sent_emails: SentEmails,
) -> None:
    headers = auth_headers(manager)
    _, reservation_id = await _lot_in(
        "reservation_engagee", client, db_session, manager, headers
    )
    # No archived deed (e.g. promotion not received yet at engagement).
    await db_session.execute(delete(LotDocumentModel))
    await db_session.commit()

    response = await _notify(
        client, headers, reservation_id, "reservation_engagee", ["email"]
    )

    assert response.status_code == 200, response.text
    [call] = sent_emails.calls
    assert not call["attachments"]


@pytest.mark.parametrize(
    ("status", "kind"),
    [
        ("option", "reservation_engagee"),
        ("option", "reservation_a_finaliser"),
        ("reservation_a_finaliser", "option_confirmee"),
        ("reservation_engagee", "option_confirmee"),
    ],
)
async def test_kind_mismatch_400(
    status: str,
    kind: str,
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
    sent_emails: SentEmails,
) -> None:
    headers = auth_headers(manager)
    _, reservation_id = await _lot_in(status, client, db_session, manager, headers)

    response = await _notify(client, headers, reservation_id, kind, ["email"])

    assert response.status_code == 400, response.text
    body = response.json()
    assert body["message"] == KIND_MISMATCH
    assert body["details"] == [{"rule": "notification_kind_mismatch"}]
    assert await _rows(db_session) == []
    assert sent_emails.calls == []


async def test_notify_unknown_reservation_404(
    client: AsyncClient, manager: UserModel, auth_headers: Headers
) -> None:
    response = await _notify(
        client, auth_headers(manager), 999999, "option_confirmee", ["email"]
    )
    assert response.status_code == 404


@pytest.mark.parametrize(
    "payload",
    [
        {"channels": [], "kind": "option_confirmee"},
        {"channels": ["email", "email"], "kind": "option_confirmee"},
        {"channels": ["fax"], "kind": "option_confirmee"},
        {"channels": ["email"], "kind": "rappel_expiration"},
    ],
)
async def test_notify_request_validation_422(
    payload: dict[str, Any],
    client: AsyncClient,
    manager: UserModel,
    auth_headers: Headers,
) -> None:
    response = await client.post(
        "/api/reservations/1/notify", headers=auth_headers(manager), json=payload
    )
    assert response.status_code == 422, response.text


async def test_list_requires_filter_422(
    client: AsyncClient, manager: UserModel, auth_headers: Headers
) -> None:
    response = await client.get("/api/notifications", headers=auth_headers(manager))

    assert response.status_code == 422
    assert response.json()["message"] == FILTER_REQUIRED


async def test_list_by_client_and_lot(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
    sent_emails: SentEmails,
) -> None:
    headers = auth_headers(manager)
    lot_a, reservation_a = await _lot_in("option", client, db_session, manager, headers)
    lot_b, reservation_b = await _lot_in("option", client, db_session, manager, headers)
    first = await _notify(client, headers, reservation_a, "option_confirmee", ["email"])
    second = await _notify(client, headers, reservation_a, "option_confirmee", ["sms"])
    other = await _notify(client, headers, reservation_b, "option_confirmee", ["email"])
    client_a = first.json()[0]["client_id"]

    by_client = await client.get(
        "/api/notifications", headers=headers, params={"client_id": client_a}
    )
    by_lot = await client.get(
        "/api/notifications", headers=headers, params={"lot_id": lot_b.id}
    )
    both = await client.get(
        "/api/notifications",
        headers=headers,
        params={"client_id": client_a, "lot_id": lot_b.id},
    )

    assert by_client.status_code == 200, by_client.text
    # Most recent first.
    assert [n["id"] for n in by_client.json()] == [
        second.json()[0]["id"],
        first.json()[0]["id"],
    ]
    assert set(by_client.json()[0]) == RESPONSE_KEYS
    assert [n["id"] for n in by_lot.json()] == [other.json()[0]["id"]]
    assert both.json() == []
    assert lot_a.id != lot_b.id


async def test_list_returns_sender_name_or_null(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
    sent_emails: SentEmails,
) -> None:
    headers = auth_headers(manager)
    lot, reservation_id = await _lot_in("option", client, db_session, manager, headers)
    sent = (
        await _notify(client, headers, reservation_id, "option_confirmee", ["email"])
    ).json()[0]
    # A row without sender (e.g. a future automatic reminder).
    automatic = NotificationModel(
        client_id=sent["client_id"],
        lot_id=lot.id,
        reservation_id=reservation_id,
        recipient="client",
        channel="email",
        kind="rappel_expiration",
        status="sent",
        sent_at=datetime.now(UTC) + timedelta(minutes=1),
        sent_by_user_id=None,
    )
    db_session.add(automatic)
    await db_session.commit()

    response = await client.get(
        "/api/notifications", headers=headers, params={"lot_id": lot.id}
    )

    assert response.status_code == 200, response.text
    by_id = {n["id"]: n for n in response.json()}
    assert by_id[sent["id"]]["sent_by_name"] == manager.name
    assert by_id[automatic.id]["sent_by_name"] is None
    assert sent["sent_by_name"] == manager.name


async def test_commercial_phone_in_message(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
    sent_emails: SentEmails,
) -> None:
    manager.phone = "+212612345678"
    await db_session.commit()
    headers = auth_headers(manager)
    _, reservation_id = await _lot_in("option", client, db_session, manager, headers)

    await _notify(client, headers, reservation_id, "option_confirmee", ["email"])

    [call] = sent_emails.calls
    assert "+212612345678" in call["html"]
    assert manager.name in call["html"]


# --- users.phone ------------------------------------------------------------


async def test_invite_and_update_user_phone(
    client: AsyncClient,
    db_session: AsyncSession,
    manager: UserModel,
    auth_headers: Headers,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _no_invitation(*_args: Any, **_kwargs: Any) -> bool:
        return False

    monkeypatch.setattr(EmailService, "send_invitation_email", _no_invitation)
    headers = auth_headers(manager)

    invited = await client.post(
        "/api/users/invite",
        headers=headers,
        json={
            "email": "new.commercial@example.com",
            "first_name": "Karim",
            "last_name": "Idrissi",
            "role": "commercial",
            "phone": "06 12 34 56 78",
        },
    )
    assert invited.status_code == 201, invited.text
    assert invited.json()["phone"] == "+212612345678"
    user_id = invited.json()["id"]

    updated = await client.patch(
        f"/api/users/{user_id}", headers=headers, json={"phone": "+33 6 12 34 56 78"}
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["phone"] == "+33612345678"

    listed = await client.get("/api/users", headers=headers)
    [entry] = [u for u in listed.json() if u["id"] == user_id]
    assert entry["phone"] == "+33612345678"

    cleared = await client.patch(
        f"/api/users/{user_id}", headers=headers, json={"phone": None}
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["phone"] is None

    invalid = await client.patch(
        f"/api/users/{user_id}", headers=headers, json={"phone": "12"}
    )
    assert invalid.status_code == 422


async def test_update_user_phone_manager_only(
    client: AsyncClient,
    commercial: UserModel,
    auth_headers: Headers,
) -> None:
    response = await client.patch(
        f"/api/users/{commercial.id}",
        headers=auth_headers(commercial),
        json={"phone": "+212612345678"},
    )
    assert response.status_code == 403
