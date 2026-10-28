"""E4-T4: daily expiration reminders, sent once per reservation and deadline."""

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.models import (
    NotificationModel,
    ReservationModel,
    UserModel,
)
from app.services import reminder_service
from app.services.email_service import EmailService
from app.services.notifications.channels import Attachment, DeliveryResult
from app.services.notifications.service import NotificationService
from app.services.reminder_service import REMINDER_LOCK_ID, send_expiration_reminders
from app.tests.factories import make_client, make_lot, make_project

pytestmark = pytest.mark.integration

NOW = datetime(2026, 11, 2, 7, 0, tzinfo=UTC)
NO_COMMERCIAL_EMAIL = "Le commercial n'a pas d'adresse email."


class SentEmails:
    """Records the calls made to the patched ``EmailService.send_email``."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    async def __call__(
        self,
        to: str,
        subject: str,
        html: str,
        attachments: list[Attachment] | None = None,
    ) -> DeliveryResult:
        self.calls.append({"to": to, "subject": subject, "html": html})
        return DeliveryResult(status="sent")


@pytest.fixture(autouse=True)
def no_real_email(monkeypatch: pytest.MonkeyPatch) -> None:
    """Safety net: nothing in this module may reach Resend."""

    def _refuse(*_args: Any, **_kwargs: Any) -> None:
        raise AssertionError("Resend must not be called in tests")

    monkeypatch.setattr("resend.Emails.send", _refuse)


@pytest.fixture
def sent_emails(monkeypatch: pytest.MonkeyPatch) -> SentEmails:
    recorder = SentEmails()
    monkeypatch.setattr(EmailService, "send_email", recorder)
    return recorder


async def _reservation(
    db_session: AsyncSession,
    manager: UserModel,
    expires_in: timedelta,
    *,
    status: str = "option",
    reserved_by: UserModel | None = None,
    no_commercial: bool = False,
    **client_fields: Any,
) -> ReservationModel:
    """A lot in ``status`` whose current reservation expires at NOW + expires_in."""
    project = await make_project(db_session, manager)
    lot = await make_lot(db_session, project, status=status)
    buyer = await make_client(db_session, manager, **client_fields)
    reservation = ReservationModel(
        project_id=project.id,
        lot_id=lot.id,
        client_id=buyer.id,
        reserved_by_user_id=None if no_commercial else (reserved_by or manager).id,
        expiration_date=NOW + expires_in,
        deposit=10000,
        guarantee_amount=20000 if status == "reservation_a_finaliser" else None,
    )
    db_session.add(reservation)
    await db_session.commit()
    lot.current_reservation_id = reservation.id
    await db_session.commit()
    await db_session.refresh(reservation)
    return reservation


async def _rows(db_session: AsyncSession) -> list[NotificationModel]:
    result = await db_session.execute(
        select(NotificationModel).order_by(NotificationModel.id)
    )
    return list(result.scalars().all())


def _naive(value: datetime) -> datetime:
    """SQLite returns naive UTC datetimes."""
    return value.replace(tzinfo=None)


async def test_reminds_option_expiring_in_window(
    db_session: AsyncSession,
    manager: UserModel,
    commercial: UserModel,
    sent_emails: SentEmails,
) -> None:
    reservation = await _reservation(
        db_session,
        manager,
        timedelta(days=1),
        reserved_by=commercial,
        email="fatima@example.com",
    )

    assert await send_expiration_reminders(db_session, NOW) == 1

    rows = await _rows(db_session)
    assert {row.recipient for row in rows} == {"commercial", "client"}
    assert len(rows) == 2
    for row in rows:
        assert row.kind == "rappel_expiration"
        assert row.channel == "email"
        assert row.status == "sent"
        assert row.reservation_id == reservation.id
        assert row.sent_by_user_id is None
        assert _naive(row.deadline_at) == _naive(reservation.expiration_date)
    assert {call["to"] for call in sent_emails.calls} == {
        commercial.email,
        "fatima@example.com",
    }
    for call in sent_emails.calls:
        assert call["subject"].startswith("Rappel : échéance le 03/11/2026 — Lot ")


async def test_ignores_outside_window(
    db_session: AsyncSession,
    manager: UserModel,
    sent_emails: SentEmails,
) -> None:
    await _reservation(db_session, manager, timedelta(days=3))
    await _reservation(db_session, manager, timedelta(days=-1))
    await _reservation(db_session, manager, -timedelta(minutes=1))
    # Engaged lots have no deadline to remind, even with a date in the window.
    await _reservation(
        db_session, manager, timedelta(days=1), status="reservation_engagee"
    )

    assert await send_expiration_reminders(db_session, NOW) == 0

    assert await _rows(db_session) == []
    assert sent_emails.calls == []


async def test_reminds_finalisation_deadline(
    db_session: AsyncSession,
    manager: UserModel,
    sent_emails: SentEmails,
) -> None:
    # Window bound is inclusive: exactly REMINDER_DAYS_BEFORE (2) days ahead.
    reservation = await _reservation(
        db_session, manager, timedelta(days=2), status="reservation_a_finaliser"
    )

    assert await send_expiration_reminders(db_session, NOW) == 1

    rows = await _rows(db_session)
    assert {row.recipient for row in rows} == {"commercial", "client"}
    assert all(
        _naive(row.deadline_at) == _naive(reservation.expiration_date) for row in rows
    )
    assert all("20 000,00 DH" in call["html"] for call in sent_emails.calls)
    assert all("04/11/2026" in call["subject"] for call in sent_emails.calls)


async def test_reminders_idempotent(
    db_session: AsyncSession,
    manager: UserModel,
    sent_emails: SentEmails,
) -> None:
    await _reservation(db_session, manager, timedelta(days=1))

    assert await send_expiration_reminders(db_session, NOW) == 1
    # Same day re-run (second worker after the first one finished, restart…).
    assert await send_expiration_reminders(db_session, NOW + timedelta(hours=1)) == 0

    assert len(await _rows(db_session)) == 2
    assert len(sent_emails.calls) == 2


async def test_new_deadline_after_extension_reminds_again(
    db_session: AsyncSession,
    manager: UserModel,
    sent_emails: SentEmails,
) -> None:
    reservation = await _reservation(db_session, manager, timedelta(days=1))
    assert await send_expiration_reminders(db_session, NOW) == 1

    reservation.expiration_date = NOW + timedelta(days=2)
    await db_session.commit()

    assert await send_expiration_reminders(db_session, NOW) == 1
    rows = await _rows(db_session)
    assert len(rows) == 4
    assert {_naive(row.deadline_at) for row in rows} == {
        _naive(NOW + timedelta(days=1)),
        _naive(NOW + timedelta(days=2)),
    }
    assert len(sent_emails.calls) == 4


async def test_client_reminded_on_preferred_channels(
    db_session: AsyncSession,
    manager: UserModel,
    sent_emails: SentEmails,
) -> None:
    await _reservation(
        db_session, manager, timedelta(days=1), notification_channels=["email", "sms"]
    )

    assert await send_expiration_reminders(db_session, NOW) == 1

    rows = await _rows(db_session)
    channels = {(row.recipient, row.channel): row.status for row in rows}
    assert channels == {
        ("commercial", "email"): "sent",
        ("client", "email"): "sent",
        ("client", "sms"): "not_configured",
    }


async def test_commercial_without_email_gets_commercial_message(
    db_session: AsyncSession,
    manager: UserModel,
    sent_emails: SentEmails,
) -> None:
    await _reservation(db_session, manager, timedelta(days=1), no_commercial=True)

    assert await send_expiration_reminders(db_session, NOW) == 1

    rows = {row.recipient: row for row in await _rows(db_session)}
    assert rows["commercial"].status == "failed"
    assert rows["commercial"].error == NO_COMMERCIAL_EMAIL
    assert rows["client"].status == "sent"


async def test_only_missing_recipient_after_partial_run(
    db_session: AsyncSession,
    manager: UserModel,
    sent_emails: SentEmails,
) -> None:
    reservation = await _reservation(
        db_session, manager, timedelta(days=1), email="fatima@example.com"
    )
    # A previous run reminded the commercial, then failed before the client.
    db_session.add(
        NotificationModel(
            client_id=reservation.client_id,
            lot_id=reservation.lot_id,
            reservation_id=reservation.id,
            recipient="commercial",
            channel="email",
            kind="rappel_expiration",
            status="sent",
            deadline_at=reservation.expiration_date,
        )
    )
    await db_session.commit()

    assert await send_expiration_reminders(db_session, NOW) == 1

    assert [call["to"] for call in sent_emails.calls] == ["fatima@example.com"]
    assert len(await _rows(db_session)) == 2


async def test_failing_reservation_does_not_stop_the_others(
    db_session: AsyncSession,
    manager: UserModel,
    sent_emails: SentEmails,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    first = await _reservation(db_session, manager, timedelta(hours=1))
    bad = await _reservation(db_session, manager, timedelta(hours=2))
    last = await _reservation(db_session, manager, timedelta(hours=3))
    # Plain values: the run's rollback expires the ORM instances.
    first_id, last_id = first.id, last.id
    bad_id, bad_client_id, bad_lot_id = bad.id, bad.client_id, bad.lot_id
    bad_deadline = bad.expiration_date
    original = NotificationService.notify

    async def _notify(
        self: NotificationService, reservation_id: int, *args: Any, **kw: Any
    ) -> list[NotificationModel]:
        if reservation_id == bad_id:
            # Leave an uncommitted row behind, as a failure mid-way would.
            self.session.add(
                NotificationModel(
                    client_id=bad_client_id,
                    lot_id=bad_lot_id,
                    reservation_id=bad_id,
                    recipient="client",
                    channel="email",
                    kind="rappel_expiration",
                    status="sent",
                    deadline_at=bad_deadline,
                )
            )
            raise ValueError("boom")
        return await original(self, reservation_id, *args, **kw)

    monkeypatch.setattr(NotificationService, "notify", _notify)

    assert await send_expiration_reminders(db_session, NOW) == 2

    rows = await _rows(db_session)
    # The first reservation's rows were committed before the failure and
    # survive its rollback; the failing one leaves nothing behind.
    assert {row.reservation_id for row in rows} == {first_id, last_id}
    assert len(rows) == 4


class _FakeTransaction:
    def __init__(self, events: list[str]) -> None:
        self.events = events

    async def __aenter__(self) -> "_FakeTransaction":
        self.events.append("transaction_begun")
        return self

    async def __aexit__(self, *_exc: object) -> None:
        self.events.append("lock_released")


class _FakeLockConnection:
    """Stands in for the dedicated PostgreSQL connection holding the lock."""

    def __init__(self, acquired: bool, events: list[str]) -> None:
        self.acquired = acquired
        self.events = events
        self.statements: list[tuple[str, dict]] = []

    async def __aenter__(self) -> "_FakeLockConnection":
        return self

    async def __aexit__(self, *_exc: object) -> None:
        self.events.append("connection_closed")

    def begin(self) -> _FakeTransaction:
        return _FakeTransaction(self.events)

    async def scalar(self, statement: Any, params: dict | None = None) -> bool:
        self.statements.append((str(statement), params or {}))
        self.events.append("lock_requested")
        return self.acquired


def _force_postgres(
    monkeypatch: pytest.MonkeyPatch,
    db_session: AsyncSession,
    connection: _FakeLockConnection,
) -> None:
    monkeypatch.setattr(db_session.bind.dialect, "name", "postgresql")
    monkeypatch.setattr(
        reminder_service, "_lock_connection", lambda _session: connection
    )


async def test_lock_not_acquired_returns_zero(
    db_session: AsyncSession,
    manager: UserModel,
    sent_emails: SentEmails,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _reservation(db_session, manager, timedelta(days=1))
    events: list[str] = []
    connection = _FakeLockConnection(acquired=False, events=events)
    _force_postgres(monkeypatch, db_session, connection)

    assert await send_expiration_reminders(db_session, NOW) == 0

    [(sql, params)] = connection.statements
    assert "pg_try_advisory_xact_lock" in sql
    assert params == {"id": REMINDER_LOCK_ID}
    assert REMINDER_LOCK_ID == 7_340_042
    assert sent_emails.calls == []
    assert await _rows(db_session) == []


async def test_lock_held_for_the_whole_run(
    db_session: AsyncSession,
    manager: UserModel,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _reservation(db_session, manager, timedelta(hours=1))
    await _reservation(db_session, manager, timedelta(hours=2))
    events: list[str] = []
    connection = _FakeLockConnection(acquired=True, events=events)
    _force_postgres(monkeypatch, db_session, connection)

    async def _send(*_args: Any, **_kwargs: Any) -> DeliveryResult:
        events.append("email_sent")
        return DeliveryResult(status="sent")

    monkeypatch.setattr(EmailService, "send_email", _send)

    assert await send_expiration_reminders(db_session, NOW) == 2

    assert events == [
        "transaction_begun",
        "lock_requested",
        *["email_sent"] * 4,
        "lock_released",
        "connection_closed",
    ]
    assert len(await _rows(db_session)) == 4
