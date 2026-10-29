"""E4-T4: scheduler wiring (daily job, lifespan) — the job itself never runs here."""

import asyncio
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI

from app import main
from app.core import scheduler as scheduler_module
from app.core.config import settings
from app.core.scheduler import start_scheduler, stop_scheduler

pytestmark = pytest.mark.unit


def test_scheduler_disabled_in_tests() -> None:
    """pytest must never start the scheduler (``.env`` targets a real DB)."""
    assert settings.SCHEDULER_ENABLED is False


def test_reminder_settings_defaults() -> None:
    fields = type(settings).model_fields
    assert fields["REMINDER_DAYS_BEFORE"].default == 2
    assert fields["SCHEDULER_ENABLED"].default is True
    assert fields["REMINDER_TIMEZONE"].default == "Africa/Casablanca"


async def test_scheduler_job_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    job_ran = AsyncMock()
    monkeypatch.setattr(scheduler_module, "send_expiration_reminders", job_ran)

    scheduler = start_scheduler()
    try:
        job = scheduler.get_job("expiration_reminders")
        assert job is not None
        assert isinstance(job.trigger, CronTrigger)
        fields = {f.name: str(f) for f in job.trigger.fields}
        assert fields["hour"] == "8"
        assert fields["minute"] == "0"
        assert str(job.trigger.timezone) == "Africa/Casablanca"
        assert job.max_instances == 1
        assert job.coalesce is True
        assert job.next_run_time.hour == 8
        assert scheduler.running
    finally:
        stop_scheduler(scheduler)
    await asyncio.sleep(0)  # AsyncIOScheduler shuts down on the event loop
    assert not scheduler.running
    job_ran.assert_not_called()


async def test_job_opens_its_own_session(monkeypatch: pytest.MonkeyPatch) -> None:
    session = object()

    class _Factory:
        async def __aenter__(self) -> object:
            return session

        async def __aexit__(self, *_exc: object) -> None:
            return None

    calls: list[tuple[Any, datetime]] = []

    async def _send(s: Any, now: datetime) -> int:
        calls.append((s, now))
        return 3

    monkeypatch.setattr(scheduler_module, "async_session_factory", _Factory)
    monkeypatch.setattr(scheduler_module, "send_expiration_reminders", _send)

    await scheduler_module.run_expiration_reminders()

    [(used_session, now)] = calls
    assert used_session is session
    assert now.tzinfo is UTC


async def test_job_failure_is_logged_not_raised(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _Factory:
        async def __aenter__(self) -> object:
            raise ConnectionError("database down")

        async def __aexit__(self, *_exc: object) -> None:
            return None

    monkeypatch.setattr(scheduler_module, "async_session_factory", _Factory)

    await scheduler_module.run_expiration_reminders()  # does not raise


@pytest.fixture
def no_db(monkeypatch: pytest.MonkeyPatch) -> None:
    """The lifespan must not touch the (real) database configured in ``.env``."""
    monkeypatch.setattr(main, "init_db", AsyncMock())
    monkeypatch.setattr(main, "close_db", AsyncMock())


async def test_lifespan_skips_scheduler_when_disabled(
    monkeypatch: pytest.MonkeyPatch, no_db: None
) -> None:
    start = MagicMock()
    monkeypatch.setattr(main, "start_scheduler", start)
    monkeypatch.setattr(settings, "SCHEDULER_ENABLED", False)

    async with main.lifespan(FastAPI()):
        pass

    start.assert_not_called()


async def test_lifespan_starts_and_stops_scheduler_when_enabled(
    monkeypatch: pytest.MonkeyPatch, no_db: None
) -> None:
    scheduler = object()
    start = MagicMock(return_value=scheduler)
    stop = MagicMock()
    monkeypatch.setattr(main, "start_scheduler", start)
    monkeypatch.setattr(main, "stop_scheduler", stop)
    monkeypatch.setattr(settings, "SCHEDULER_ENABLED", True)

    async with main.lifespan(FastAPI()):
        start.assert_called_once_with()
        stop.assert_not_called()

    stop.assert_called_once_with(scheduler)


async def test_lifespan_survives_scheduler_start_failure(
    monkeypatch: pytest.MonkeyPatch, no_db: None
) -> None:
    stop = MagicMock()
    monkeypatch.setattr(main, "start_scheduler", MagicMock(side_effect=RuntimeError))
    monkeypatch.setattr(main, "stop_scheduler", stop)
    monkeypatch.setattr(settings, "SCHEDULER_ENABLED", True)

    async with main.lifespan(FastAPI()):
        pass

    stop.assert_not_called()
