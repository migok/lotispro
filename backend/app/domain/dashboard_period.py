"""Period handling for the dashboard: resolution, bounds, buckets, variation.

All functions are pure (no DB). Periods are inclusive calendar-day ranges in the
business time zone (``REMINDER_TIMEZONE``, Morocco).
"""

from calendar import monthrange
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta, tzinfo
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.core.config import settings
from app.core.exceptions import ValidationError

MAX_PERIOD_DAYS = 3660

SINGLE_BOUND_MESSAGE = "Indiquez la date de début et la date de fin."
INVERTED_MESSAGE = "La date de début doit être antérieure ou égale à la date de fin."
TOO_LONG_MESSAGE = "La période ne peut pas dépasser 10 ans."

Granularity = Literal["day", "week", "month"]


@dataclass(frozen=True)
class Period:
    """Inclusive range of business days."""

    date_from: date
    date_to: date

    @property
    def days(self) -> int:
        return (self.date_to - self.date_from).days + 1


def business_tz() -> tzinfo:
    """Business time zone, read from settings at call time; UTC if unavailable."""
    try:
        return ZoneInfo(settings.REMINDER_TIMEZONE)
    except ZoneInfoNotFoundError:
        return UTC


def business_today() -> date:
    """Today in the business time zone (falls back to UTC)."""
    return datetime.now(business_tz()).date()


def resolve_period(date_from: date | None, date_to: date | None, today: date) -> Period:
    """Validate the requested bounds; default to the calendar month of ``today``."""
    if date_from is None and date_to is None:
        last_day = monthrange(today.year, today.month)[1]
        return Period(today.replace(day=1), today.replace(day=last_day))
    if date_from is None or date_to is None:
        raise ValidationError(SINGLE_BOUND_MESSAGE, field="date_from")
    if date_from > date_to:
        raise ValidationError(INVERTED_MESSAGE, field="date_from")
    period = Period(date_from, date_to)
    if period.days > MAX_PERIOD_DAYS:
        raise ValidationError(TOO_LONG_MESSAGE, field="date_from")
    return period


def previous_period(period: Period) -> Period:
    """Period of the same length ending the day before ``period`` starts."""
    date_to = period.date_from - timedelta(days=1)
    return Period(date_to - timedelta(days=period.days - 1), date_to)


def utc_bounds(period: Period) -> tuple[datetime, datetime]:
    """Aware UTC ``[start, end)`` covering the period's business days."""
    tz = business_tz()
    start = datetime.combine(period.date_from, time.min, tzinfo=tz)
    end = datetime.combine(period.date_to + timedelta(days=1), time.min, tzinfo=tz)
    return start.astimezone(UTC), end.astimezone(UTC)


def to_business_date(moment: datetime) -> date:
    """Business-day of a moment; naive values are treated as UTC."""
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return moment.astimezone(business_tz()).date()


def variation(current: float, previous: float) -> float | None:
    """Percent change versus ``previous`` (1 decimal); ``None`` if previous is 0."""
    if previous == 0:
        return None
    return round((current - previous) / previous * 100, 1)


def granularity_for(period: Period) -> Granularity:
    if period.days <= 31:
        return "day"
    if period.days <= 92:
        return "week"
    return "month"


def bucket_key(day: date, granularity: Granularity) -> str:
    if granularity == "day":
        return day.isoformat()
    if granularity == "week":
        iso = day.isocalendar()
        return f"{iso.year}-W{iso.week:02d}"
    return f"{day.year}-{day.month:02d}"


def bucket_keys(period: Period, granularity: Granularity) -> list[str]:
    """Every bucket key covering the period, in order, without duplicates."""
    keys: list[str] = []
    day = period.date_from
    while day <= period.date_to:
        key = bucket_key(day, granularity)
        if not keys or keys[-1] != key:
            keys.append(key)
        day += timedelta(days=1)
    return keys
