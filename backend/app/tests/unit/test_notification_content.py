"""E4-T2: notification message content (subject + HTML body)."""

import re
from dataclasses import replace
from datetime import UTC, datetime
from typing import get_args

import pytest
from sqlalchemy import CheckConstraint

from app.domain.client_profile import NOTIFICATION_CHANNELS
from app.domain.schemas.notification import (
    NotificationKind,
    NotificationRecipient,
    NotificationStatus,
)
from app.infrastructure.database.models import NotificationModel
from app.services.notifications.channels import CHANNELS, Channel
from app.services.notifications.content import NotificationContext, build_message

pytestmark = pytest.mark.unit

DEADLINE = datetime(2026, 11, 3, 18, 0, tzinfo=UTC)


def _ctx(kind: str, **overrides: object) -> NotificationContext:
    fields: dict[str, object] = {
        "kind": kind,
        "client_name": "Fatima Benali",
        "lot_numero": "A-12",
        "project_name": "Les Jardins",
        "amount": 10000.0,
        "deadline": DEADLINE,
        "commercial_name": "Karim Idrissi",
        "commercial_phone": "+212612345678",
        "commercial_email": "karim@lotispro.com",
    }
    return NotificationContext(**{**fields, **overrides})


@pytest.mark.parametrize(
    ("kind", "subject"),
    [
        ("option_confirmee", "Confirmation d'option — Lot A-12 · Les Jardins"),
        ("reservation_a_finaliser", "Réservation à finaliser — Lot A-12 · Les Jardins"),
        ("reservation_engagee", "Réservation engagée — Lot A-12 · Les Jardins"),
        (
            "rappel_expiration",
            "Rappel : échéance le 03/11/2026 — Lot A-12 · Les Jardins",
        ),
    ],
)
def test_subject_per_kind(kind: str, subject: str) -> None:
    assert build_message(_ctx(kind))[0] == subject


@pytest.mark.parametrize("kind", get_args(NotificationKind))
def test_body_contains_lot_project_amount_and_commercial(kind: str) -> None:
    _, html = build_message(_ctx(kind))

    assert "A-12" in html
    assert "Les Jardins" in html
    assert "Fatima Benali" in html
    assert "10 000 MAD" in html
    assert "Karim Idrissi" in html
    assert "karim@lotispro.com" in html
    assert "+212612345678" in html


@pytest.mark.parametrize(
    ("amount", "expected"),
    [(1234567.5, "1 234 567,50 MAD"), (500.0, "500 MAD"), (0.0, "0 MAD")],
)
def test_amount_is_formatted_in_french(amount: float, expected: str) -> None:
    _, html = build_message(_ctx("option_confirmee", amount=amount))
    assert expected in html


@pytest.mark.parametrize(
    ("kind", "label"),
    [
        ("option_confirmee", "Acompte"),
        ("reservation_a_finaliser", "Garantie versée"),
        ("reservation_engagee", "Prix total convenu"),
    ],
)
def test_amount_label_per_kind(kind: str, label: str) -> None:
    _, html = build_message(_ctx(kind))
    assert f"{label}</td>" in html
    assert "Prix de vente" not in html
    assert " DH" not in html


def test_amount_line_omitted_when_none() -> None:
    _, html = build_message(_ctx("option_confirmee", amount=None))
    assert " MAD" not in html


@pytest.mark.parametrize(
    "kind", ["option_confirmee", "reservation_a_finaliser", "rappel_expiration"]
)
def test_deadline_present(kind: str) -> None:
    _, html = build_message(_ctx(kind))
    assert "Date limite" in html
    assert "03/11/2026" in html


def test_deadline_absent_when_none() -> None:
    _, html = build_message(_ctx("reservation_engagee", deadline=None))
    assert "Date limite" not in html
    assert "03/11/2026" not in html


def test_commercial_phone_omitted_when_none() -> None:
    _, html = build_message(_ctx("option_confirmee", commercial_phone=None))
    assert "Téléphone" not in html
    assert "Karim Idrissi" in html
    assert "karim@lotispro.com" in html


def test_engagee_mentions_attached_acte_only_when_attached() -> None:
    ctx = _ctx("reservation_engagee", deadline=None)
    _, without = build_message(ctx)
    _, with_acte = build_message(replace(ctx, acte_attached=True))

    assert "acte de réservation" not in without.lower()
    assert "acte de réservation" in with_acte.lower()


def test_user_values_are_html_escaped() -> None:
    _, html = build_message(_ctx("option_confirmee", client_name="<b>Ali</b> & Co"))
    assert "<b>Ali</b>" not in html
    assert "&lt;b&gt;Ali&lt;/b&gt; &amp; Co" in html


# --- Enumerations stay in sync with the database constraints ----------------


def _check_values(name: str) -> tuple[str, ...]:
    [constraint] = [
        c
        for c in NotificationModel.__table__.constraints
        if isinstance(c, CheckConstraint) and c.name == name
    ]
    return tuple(re.findall(r"'([a-z_]+)'", str(constraint.sqltext)))


def test_channel_literal_matches_client_notification_channels() -> None:
    assert get_args(Channel) == NOTIFICATION_CHANNELS
    assert tuple(CHANNELS) == NOTIFICATION_CHANNELS
    assert _check_values("valid_notification_channel") == NOTIFICATION_CHANNELS


@pytest.mark.parametrize(
    ("constraint", "literal"),
    [
        ("valid_notification_kind", NotificationKind),
        ("valid_notification_status", NotificationStatus),
        ("valid_notification_recipient", NotificationRecipient),
    ],
)
def test_check_constraints_match_literals(constraint: str, literal: object) -> None:
    assert _check_values(constraint) == get_args(literal)
