"""Unit tests for the reservation deed and payment receipt PDFs."""

import logging
import re
from datetime import UTC, date, datetime
from typing import Any

import pytest
from fpdf import FPDF

from app.services.certificate_service import CertificateService

UNICODE_CASES = [
    "Côte d’Ivoire",  # typographic apostrophe
    "“Les Palmiers”",  # curly quotes
    "وجدة",  # Arabic
    "Aït Ben Haddou — l’Oasis",  # em dash + apostrophe
]


def _page_count(pdf: bytes) -> int:
    """Number of ``/Type /Page`` objects (``/Pages`` excluded)."""
    return len(re.findall(rb"/Type\s*/Page[^s]", pdf))


def _certificate(**overrides: Any) -> bytes:
    params: dict[str, Any] = {
        "reservation_id": 7,
        "reservation_date": datetime(2026, 10, 27, tzinfo=UTC),
        "deposit": 10000.0,
        "deposit_date": date(2026, 10, 27),
        "lot_numero": "A-12",
        "lot_surface": 200.0,
        "lot_price": 500000.0,
        "project_name": "Les Jardins",
        "client_name": "Ahmed Benali",
        "client_cin": "F123456",
        "client_address": "12 rue Ibn Rochd, Oujda",
    }
    return CertificateService().generate_reservation_certificate(
        **{**params, **overrides}
    )


def _receipt(**overrides: Any) -> bytes:
    params: dict[str, Any] = {
        "reservation_id": 7,
        "receipt_date": datetime(2026, 10, 27, tzinfo=UTC),
        "deposit_amount": 10000.0,
        "deposit_date": date(2026, 10, 27),
        "lot_numero": "A-12",
        "lot_surface": 200.0,
        "sale_price": 500000.0,
        "promotion_amount": 50000.0,
        "project_name": "Les Jardins",
        "client_name": "Ahmed Benali",
        "client_cin": "F123456",
        "client_address": "12 rue Ibn Rochd, Oujda",
    }
    return CertificateService().generate_payment_receipt(**{**params, **overrides})


@pytest.mark.parametrize("text", UNICODE_CASES)
def test_certificate_accepts_unicode(text: str) -> None:
    pdf = _certificate(client_name=text, client_address=text, project_name=text)

    assert pdf.startswith(b"%PDF")


@pytest.mark.parametrize("text", UNICODE_CASES)
def test_receipt_accepts_unicode(text: str) -> None:
    pdf = _receipt(client_name=text, client_address=text, project_name=text)

    assert pdf.startswith(b"%PDF")


def test_page_count_unchanged() -> None:
    assert _page_count(_certificate()) == 2
    assert _page_count(_receipt()) == 1


@pytest.fixture
def unshaped_text(monkeypatch: pytest.MonkeyPatch) -> None:
    """Turn text shaping off so fpdf2 can report glyphs the font lacks.

    With shaping on, HarfBuzz silently maps unknown characters to ``.notdef`` and
    fpdf2 logs nothing. Glyph coverage is a property of the font, not of shaping,
    so the check is done on the unshaped path.
    """
    monkeypatch.setattr(FPDF, "set_text_shaping", lambda *_args, **_kwargs: None)


def _missing_glyph_records(caplog: pytest.LogCaptureFixture) -> list[logging.LogRecord]:
    return [r for r in caplog.records if "missing" in r.getMessage().lower()]


@pytest.mark.parametrize("text", ["وجدة", "Côte d’Ivoire"])
@pytest.mark.usefixtures("unshaped_text")
def test_pdf_has_no_missing_glyphs(text: str, caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.WARNING)

    _certificate(client_name=text, client_address=text, project_name=text)
    _receipt(client_name=text, client_address=text, project_name=text)

    assert not _missing_glyph_records(caplog)


@pytest.mark.usefixtures("unshaped_text")
def test_missing_glyph_detection_works(caplog: pytest.LogCaptureFixture) -> None:
    """Guard for the test above: a glyph absent from DejaVu is reported by fpdf."""
    caplog.set_level(logging.WARNING)

    _certificate(client_name="漢")

    assert _missing_glyph_records(caplog)
