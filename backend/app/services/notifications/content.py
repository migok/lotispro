"""Subject and HTML body of reservation notifications."""

from dataclasses import dataclass
from datetime import datetime
from html import escape


@dataclass(frozen=True)
class NotificationContext:
    """Everything a notification message shows.

    ``amount`` and ``deadline`` are already resolved for the kind (see
    ``NotificationService``); ``None`` omits the line.
    """

    kind: str
    client_name: str
    lot_numero: str
    project_name: str
    amount: float | None
    deadline: datetime | None
    commercial_name: str
    commercial_phone: str | None
    commercial_email: str
    acte_attached: bool = False


_TITLES = {
    "option_confirmee": "Confirmation d'option",
    "reservation_a_finaliser": "Réservation à finaliser",
    "reservation_engagee": "Réservation engagée",
}

_AMOUNT_LABELS = {
    "option_confirmee": "Acompte",
    "reservation_a_finaliser": "Garantie versée",
    "reservation_engagee": "Prix de vente",
}


def format_amount(amount: float) -> str:
    """French amount: ``10 000,00 DH``."""
    return f"{amount:,.2f}".replace(",", " ").replace(".", ",") + " DH"


def _format_date(value: datetime) -> str:
    return value.strftime("%d/%m/%Y")


def _subject(ctx: NotificationContext) -> str:
    suffix = f"Lot {ctx.lot_numero} · {ctx.project_name}"
    if ctx.kind == "rappel_expiration":
        if ctx.deadline is None:
            raise ValueError("rappel_expiration requires a deadline")
        return f"Rappel : échéance le {_format_date(ctx.deadline)} — {suffix}"
    return f"{_TITLES[ctx.kind]} — {suffix}"


def _intro(ctx: NotificationContext, lot: str, project: str) -> str:
    where = f"le lot <strong>{lot}</strong> du projet <strong>{project}</strong>"
    if ctx.kind == "option_confirmee":
        return f"Nous vous confirmons l'option posée sur {where}."
    if ctx.kind == "reservation_a_finaliser":
        return (
            f"Votre réservation sur {where} est enregistrée. "
            "Elle doit être finalisée avant la date limite indiquée ci-dessous."
        )
    if ctx.kind == "reservation_engagee":
        text = f"Votre réservation sur {where} est désormais engagée."
        if ctx.acte_attached:
            text += " Vous trouverez votre acte de réservation en pièce jointe."
        return text
    return f"Ceci est un rappel : l'échéance concernant {where} approche."


def _row(label: str, value: str) -> str:
    return (
        '<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">'
        f"{label}</td>"
        '<td style="padding:8px 0;color:#111827;font-size:14px;font-weight:600;'
        f'text-align:right;">{value}</td></tr>'
    )


def build_message(ctx: NotificationContext) -> tuple[str, str]:
    """Return ``(subject, html)`` for the notification."""
    subject = _subject(ctx)
    lot = escape(ctx.lot_numero, quote=False)
    project = escape(ctx.project_name, quote=False)

    rows = [
        _row("Projet", project),
        _row("Lot", lot),
        _row("Client", escape(ctx.client_name, quote=False)),
    ]
    if ctx.amount is not None:
        label = _AMOUNT_LABELS.get(ctx.kind, "Montant")
        rows.append(_row(label, format_amount(ctx.amount)))
    if ctx.deadline is not None:
        rows.append(_row("Date limite", _format_date(ctx.deadline)))

    contact = [f"<strong>{escape(ctx.commercial_name, quote=False)}</strong>"]
    if ctx.commercial_phone:
        contact.append(f"Téléphone : {escape(ctx.commercial_phone, quote=False)}")
    if ctx.commercial_email:
        contact.append(f"Email : {escape(ctx.commercial_email, quote=False)}")

    html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{escape(subject, quote=False)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f0;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background:#090d16;padding:32px 40px;text-align:center;">
              <p style="margin:0;font-size:11px;letter-spacing:3px;text-transform:uppercase;
                        color:#d4973a;font-weight:600;">LotisPro</p>
              <h1 style="margin:8px 0 0;font-size:22px;color:#ecf0fa;font-weight:300;">
                {escape(subject.split(" — ")[0], quote=False)}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 20px;color:#374151;font-size:15px;">Bonjour,</p>
              <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
                {_intro(ctx, lot, project)}
              </p>
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;
                            margin-bottom:24px;padding:16px 24px;">
                {"".join(rows)}
              </table>
              <p style="margin:0 0 6px;color:#374151;font-size:14px;">
                Votre contact commercial :
              </p>
              <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">
                {"<br />".join(contact)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#090d16;padding:24px 40px;text-align:center;">
              <p style="margin:0;color:#6e7e9e;font-size:12px;">LOTISPRO</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""
    return subject, html
