import re
from datetime import UTC, date, datetime, timedelta

import pytest

from app.core.config import settings
from app.core.exceptions import ValidationError
from app.domain.dashboard_period import (
    MAX_PERIOD_DAYS,
    Period,
    bucket_key,
    bucket_keys,
    business_today,
    granularity_for,
    previous_period,
    resolve_period,
    to_business_date,
    utc_bounds,
    variation,
)

TODAY = date(2026, 10, 30)


def test_default_period_is_month_of_today():
    assert resolve_period(None, None, TODAY) == Period(
        date(2026, 10, 1), date(2026, 10, 31)
    )


def test_default_period_february_leap_year():
    assert resolve_period(None, None, date(2028, 2, 10)) == Period(
        date(2028, 2, 1), date(2028, 2, 29)
    )


def test_explicit_period_kept():
    assert resolve_period(date(2026, 1, 5), date(2026, 3, 9), TODAY) == Period(
        date(2026, 1, 5), date(2026, 3, 9)
    )


def test_inverted_period_rejected():
    with pytest.raises(
        ValidationError,
        match=re.escape(
            "La date de début doit être antérieure ou égale à la date de fin."
        ),
    ) as exc:
        resolve_period(date(2026, 10, 2), date(2026, 10, 1), TODAY)
    assert exc.value.field == "date_from"


@pytest.mark.parametrize(
    "bounds", [(date(2026, 10, 1), None), (None, date(2026, 10, 1))]
)
def test_single_bound_rejected(bounds):
    with pytest.raises(
        ValidationError, match=re.escape("Indiquez la date de début et la date de fin.")
    ):
        resolve_period(bounds[0], bounds[1], TODAY)


def test_too_long_period_rejected_and_max_accepted():
    start = date(2010, 1, 1)
    ok = resolve_period(start, start + timedelta(days=MAX_PERIOD_DAYS - 1), TODAY)
    assert ok.days == MAX_PERIOD_DAYS
    with pytest.raises(
        ValidationError, match=re.escape("La période ne peut pas dépasser 10 ans.")
    ):
        resolve_period(start, start + timedelta(days=MAX_PERIOD_DAYS), TODAY)


def test_period_days_inclusive():
    assert Period(date(2026, 10, 1), date(2026, 10, 1)).days == 1
    assert Period(date(2026, 10, 1), date(2026, 10, 31)).days == 31


def test_previous_period_same_length():
    assert previous_period(Period(date(2026, 10, 1), date(2026, 10, 31))) == Period(
        date(2026, 8, 31), date(2026, 9, 30)
    )


def test_utc_bounds_casablanca():
    # Mid-June is UTC+1 in Morocco (outside Ramadan and the tzdata 2026 winter change)
    start, end = utc_bounds(Period(date(2026, 6, 15), date(2026, 6, 15)))
    assert start == datetime(2026, 6, 14, 23, 0, tzinfo=UTC)
    assert end == datetime(2026, 6, 15, 23, 0, tzinfo=UTC)
    assert start.utcoffset() == timedelta(0)


def test_utc_bounds_fallback_utc(monkeypatch):
    monkeypatch.setattr(settings, "REMINDER_TIMEZONE", "Invalid/Zone")
    start, end = utc_bounds(Period(date(2026, 10, 30), date(2026, 10, 30)))
    assert start == datetime(2026, 10, 30, 0, 0, tzinfo=UTC)
    assert end == datetime(2026, 10, 31, 0, 0, tzinfo=UTC)


def test_business_today_fallback_utc(monkeypatch):
    monkeypatch.setattr(settings, "REMINDER_TIMEZONE", "Invalid/Zone")
    assert business_today() == datetime.now(UTC).date()


def test_to_business_date_aware_and_naive():
    # 00:30 the next day in Casablanca (UTC+1 in June)
    late = datetime(2026, 6, 15, 23, 30, tzinfo=UTC)
    assert to_business_date(late) == date(2026, 6, 16)
    assert to_business_date(late.replace(tzinfo=None)) == date(2026, 6, 16)


def test_variation():
    assert variation(15, 10) == 50.0
    assert variation(5, 10) == -50.0
    assert variation(3, 0) is None
    assert variation(10.0, 3.0) == 233.3


@pytest.mark.parametrize(
    ("days", "expected"),
    [(1, "day"), (31, "day"), (32, "week"), (92, "week"), (93, "month")],
)
def test_granularity_thresholds(days, expected):
    start = date(2026, 1, 1)
    assert granularity_for(Period(start, start + timedelta(days=days - 1))) == expected


def test_bucket_key_formats():
    assert bucket_key(date(2026, 10, 5), "day") == "2026-10-05"
    assert bucket_key(date(2026, 10, 5), "week") == "2026-W41"
    assert bucket_key(date(2026, 10, 5), "month") == "2026-10"


def test_bucket_key_week_uses_iso_year():
    assert bucket_key(date(2026, 1, 1), "week") == "2026-W01"
    assert bucket_key(date(2027, 1, 1), "week") == "2026-W53"


def test_bucket_keys_day():
    keys = bucket_keys(Period(date(2026, 10, 29), date(2026, 11, 1)), "day")
    assert keys == ["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]


def test_bucket_keys_week_and_month():
    october = Period(date(2026, 10, 1), date(2026, 10, 31))
    assert bucket_keys(october, "week") == [
        "2026-W40",
        "2026-W41",
        "2026-W42",
        "2026-W43",
        "2026-W44",
    ]
    year = Period(date(2026, 1, 1), date(2026, 12, 31))
    months = bucket_keys(year, "month")
    assert len(months) == 12
    assert months[0] == "2026-01"
    assert months[-1] == "2026-12"
    assert len(set(months)) == 12
