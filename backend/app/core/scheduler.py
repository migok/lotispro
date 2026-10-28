"""In-process scheduler (APScheduler) for the daily jobs.

Started by the application lifespan when ``SCHEDULER_ENABLED``. Each Gunicorn
worker runs its own scheduler: jobs must be safe to run concurrently (see
``reminder_service`` for the lock and idempotence of the reminders).
"""

from datetime import UTC, datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.core.config import settings
from app.core.logging import get_logger
from app.infrastructure.database import async_session_factory
from app.services.reminder_service import send_expiration_reminders

logger = get_logger(__name__)

REMINDERS_JOB_ID = "expiration_reminders"
# A run delayed by a busy event loop (or a slow startup) still happens.
_MISFIRE_GRACE_SECONDS = 3600


async def run_expiration_reminders() -> None:
    """The daily job: its own session, errors logged (never raised)."""
    try:
        async with async_session_factory() as session:
            reminded = await send_expiration_reminders(session, datetime.now(UTC))
    except Exception:
        logger.exception("Expiration reminders job failed")
        return
    logger.info("Expiration reminders job done", reminded=reminded)


def start_scheduler() -> AsyncIOScheduler:
    """Start the scheduler with the daily reminder job (08:00, local time)."""
    scheduler = AsyncIOScheduler(timezone=settings.REMINDER_TIMEZONE)
    scheduler.add_job(
        run_expiration_reminders,
        CronTrigger(hour=8, minute=0, timezone=settings.REMINDER_TIMEZONE),
        id=REMINDERS_JOB_ID,
        coalesce=True,
        max_instances=1,
        misfire_grace_time=_MISFIRE_GRACE_SECONDS,
        replace_existing=True,
    )
    scheduler.start()
    job = scheduler.get_job(REMINDERS_JOB_ID)
    logger.info(
        "Scheduler started",
        job=REMINDERS_JOB_ID,
        next_run=job.next_run_time.isoformat() if job else None,
    )
    return scheduler


def stop_scheduler(scheduler: AsyncIOScheduler) -> None:
    """Stop the scheduler without waiting for a running job."""
    scheduler.shutdown(wait=False)
    logger.info("Scheduler stopped")
