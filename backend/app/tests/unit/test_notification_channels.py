"""Email channel and ``EmailService.send_email`` error messages (E4-T2 follow-ups)."""

from typing import Any

import pytest

from app.core.config import settings
from app.services.email_service import EmailService
from app.services.notifications.channels import EmailChannel, Recipient

pytestmark = pytest.mark.unit


class _NeverCalled:
    async def send_email(self, *_args: Any, **_kwargs: Any) -> None:
        raise AssertionError("no address: nothing must be sent")


@pytest.mark.parametrize(
    ("role", "message"),
    [
        ("client", "Le client n'a pas d'adresse email."),
        ("commercial", "Le commercial n'a pas d'adresse email."),
    ],
)
async def test_missing_address_message_names_the_recipient(
    role: str, message: str
) -> None:
    channel = EmailChannel(_NeverCalled())  # type: ignore[arg-type]

    result = await channel.send(
        Recipient("Someone", None, None, role=role), "Subject", "<p>Hi</p>", []
    )

    assert result.status == "failed"
    assert result.error == message


async def test_provider_error_is_not_shown_to_users(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _refuse(_params: Any) -> None:
        raise RuntimeError("422 invalid api key re_secret_internal_detail")

    monkeypatch.setattr(settings, "RESEND_API_KEY", "re_test_key")
    monkeypatch.setattr("resend.api_key", None)  # restored after the test
    monkeypatch.setattr("resend.Emails.send", _refuse)

    result = await EmailService().send_email("a@example.com", "Subject", "<p>Hi</p>")

    assert result.status == "failed"
    assert result.error == "Échec de l'envoi de l'email."
