"""Tests never reach Resend: ``backend/.env`` may hold a real API key."""

import pytest
import resend

pytestmark = pytest.mark.unit


def test_resend_send_is_refused_by_default() -> None:
    with pytest.raises(AssertionError, match="Resend must not be called in tests"):
        resend.Emails.send(
            {"from": "a@example.com", "to": ["b@example.com"], "subject": "x"}
        )


def test_a_module_can_still_patch_resend(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[dict] = []
    monkeypatch.setattr("resend.Emails.send", sent.append)

    resend.Emails.send({"subject": "x"})

    assert sent == [{"subject": "x"}]
