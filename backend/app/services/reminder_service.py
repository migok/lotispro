"""Daily expiration reminders (E4-T4): once per reservation and deadline.

Gunicorn runs several workers and each one starts its own scheduler, so the
daily job runs once per worker. Two guards make that safe:

- a PostgreSQL advisory lock held for the whole run: the workers that do not
  get it return immediately;
- idempotence on the ``notifications`` history: a recipient already reminded
  of a reservation's current deadline is not reminded again (same-day re-run,
  restart). A new deadline (extension) gives a new reminder.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Literal

from sqlalchemy import select, text
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.domain.schemas.notification import Channel
from app.infrastructure.database.models import (
    ClientModel,
    LotModel,
    NotificationModel,
    ReservationModel,
)
from app.services.email_service import EmailService
from app.services.notifications.channels import CHANNELS
from app.services.notifications.service import NotificationService

logger = get_logger(__name__)

# Fixed key of the advisory lock taken by the reminder run.
REMINDER_LOCK_ID = 7_340_042
REMINDER_KIND = "rappel_expiration"
# Lot statuses with a deadline stored in ``reservations.expiration_date``
# (option end, or the finalisation date of a reservation à finaliser).
REMINDED_LOT_STATUSES = ("option", "reservation_a_finaliser")
_DEFAULT_CLIENT_CHANNELS: list[Channel] = ["email"]


def _lock_connection(session: AsyncSession) -> AsyncConnection:
    """A connection of its own for the lock, separate from the session's."""
    return session.bind.connect()


@asynccontextmanager
async def _run_lock(session: AsyncSession) -> AsyncIterator[bool]:
    """Yield whether this run holds the reminder lock (always True on SQLite).

    ``pg_try_advisory_xact_lock`` is taken in a transaction on a dedicated
    connection that stays open until the run ends, so the lock is held for the
    whole run although the session commits after each reservation. It is
    released when that transaction ends — including if the worker dies, since
    the connection then closes. Transaction-scoped, it also stays correct
    behind a transaction-mode pooler (Supabase), unlike a session-level lock.
    """
    if session.bind.dialect.name != "postgresql":
        yield True
        return
    async with _lock_connection(session) as connection, connection.begin():
        acquired = await connection.scalar(
            text("SELECT pg_try_advisory_xact_lock(:id)"), {"id": REMINDER_LOCK_ID}
        )
        yield bool(acquired)


def _client_channels(preferred: list[str] | None) -> list[Channel]:
    """The client's preferred channels (known ones, no duplicates), else email."""
    channels: list[Channel] = []
    for name in preferred or []:
        if name in CHANNELS and name not in channels:
            channels.append(name)  # type: ignore[arg-type]
    return channels or list(_DEFAULT_CLIENT_CHANNELS)


async def _targets(session: AsyncSession, now: datetime) -> list[Row]:
    """Current reservations of lots whose deadline falls in the window."""
    until = now + timedelta(days=settings.REMINDER_DAYS_BEFORE)
    result = await session.execute(
        select(
            ReservationModel.id,
            ReservationModel.expiration_date,
            ClientModel.notification_channels,
        )
        .join(
            LotModel,
            (LotModel.current_reservation_id == ReservationModel.id)
            & (LotModel.id == ReservationModel.lot_id),
        )
        .join(ClientModel, ClientModel.id == ReservationModel.client_id)
        .where(
            LotModel.status.in_(REMINDED_LOT_STATUSES),
            ReservationModel.expiration_date >= now,
            ReservationModel.expiration_date <= until,
        )
        .order_by(ReservationModel.expiration_date, ReservationModel.id)
    )
    return list(result.all())


async def _already_reminded(
    session: AsyncSession, reservation_id: int, deadline: datetime
) -> set[str]:
    """Recipients already reminded of this deadline (any delivery status)."""
    result = await session.execute(
        select(NotificationModel.recipient)
        .where(
            NotificationModel.reservation_id == reservation_id,
            NotificationModel.kind == REMINDER_KIND,
            NotificationModel.deadline_at == deadline,
        )
        .distinct()
    )
    return set(result.scalars().all())


async def _remind(
    session: AsyncSession, service: NotificationService, target: Row
) -> bool:
    """Remind the commercial (email) and the client; True if anyone was.

    ``notify`` commits its rows after each recipient, so a later failure
    never erases the record of a reminder already sent.
    """
    reservation_id, deadline, preferred = target
    done = await _already_reminded(session, reservation_id, deadline)
    pending: list[tuple[Literal["client", "commercial"], list[Channel]]] = []
    if "commercial" not in done:
        pending.append(("commercial", ["email"]))
    if "client" not in done:
        pending.append(("client", _client_channels(preferred)))
    for recipient, channels in pending:
        await service.notify(
            reservation_id,
            channels,
            REMINDER_KIND,
            None,  # sent by the system: shown as « Automatique »
            recipient=recipient,
            deadline_at=deadline,
        )
    return bool(pending)


async def send_expiration_reminders(session: AsyncSession, now: datetime) -> int:
    """Remind deadlines due within ``REMINDER_DAYS_BEFORE`` days of ``now``.

    Targets the current reservation of lots in ``option`` (option end) or
    ``reservation_a_finaliser`` (finalisation date), both stored in
    ``reservations.expiration_date``. A failure on one reservation is logged
    and rolled back; the others are still reminded.

    Returns:
        The number of reservations reminded during this run; ``0`` when
        another worker holds the lock.
    """
    async with _run_lock(session) as acquired:
        if not acquired:
            logger.info("Expiration reminders skipped — lock held by another run")
            return 0
        targets = await _targets(session, now)
        service = NotificationService(session, EmailService())
        reminded = 0
        for target in targets:
            try:
                if await _remind(session, service, target):
                    reminded += 1
            except Exception:
                await session.rollback()
                logger.exception("Expiration reminder failed", reservation_id=target.id)
        logger.info(
            "Expiration reminders sent", reminded=reminded, candidates=len(targets)
        )
        return reminded
