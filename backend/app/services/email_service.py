"""Email service — payment confirmation via Resend."""

import asyncio
from datetime import datetime

import resend

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def _format_amount(amount: float) -> str:
    """Format a float as a Moroccan Dirham amount."""
    return f"{amount:,.2f} DH".replace(",", " ")


def _format_date(dt: datetime | None) -> str:
    """Format a datetime to a readable French date string."""
    if dt is None:
        return "—"
    return dt.strftime("%d/%m/%Y")


def _build_deposit_confirmation_html(
    client_name: str,
    amount: float,
    paid_date: datetime | None,
    lot_numero: str,
    project_name: str,
    installment_number: int,
    total_deposit: float,
) -> str:
    """Build the HTML body for a deposit payment confirmation email."""
    amount_str = _format_amount(amount)
    total_str = _format_amount(total_deposit)
    date_str = _format_date(paid_date)

    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Confirmation de paiement</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f0;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:8px;overflow:hidden;
                      box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#090d16;padding:32px 40px;text-align:center;">
              <p style="margin:0;font-size:11px;letter-spacing:3px;text-transform:uppercase;
                        color:#d4973a;font-weight:600;">Pyramide Promotion</p>
              <h1 style="margin:8px 0 0;font-size:24px;color:#ecf0fa;font-weight:300;
                         letter-spacing:0.5px;">Confirmation de paiement</h1>
            </td>
          </tr>

          <!-- Green banner -->
          <tr>
            <td style="background:#1a4731;padding:16px 40px;text-align:center;">
              <p style="margin:0;color:#2ecc71;font-size:14px;font-weight:600;">
                ✓ &nbsp;Acompte versé avec succès
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 24px;color:#374151;font-size:15px;">
                Cher(e) <strong>{client_name}</strong>,
              </p>
              <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.6;">
                Nous accusons réception de votre versement d'acompte pour le lot
                <strong>{lot_numero}</strong> dans le projet <strong>{project_name}</strong>.
              </p>

              <!-- Payment detail card -->
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;
                            margin-bottom:28px;">
                <tr>
                  <td style="padding:24px 28px;">
                    <p style="margin:0 0 16px;font-size:11px;letter-spacing:2px;
                               text-transform:uppercase;color:#d4973a;font-weight:600;">
                      Détail du paiement
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:8px 0;color:#6b7280;font-size:14px;">Projet</td>
                        <td style="padding:8px 0;color:#111827;font-size:14px;
                                   font-weight:600;text-align:right;">{project_name}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;color:#6b7280;font-size:14px;
                                   border-top:1px solid #e5e7eb;">Lot</td>
                        <td style="padding:8px 0;color:#111827;font-size:14px;
                                   font-weight:600;text-align:right;
                                   border-top:1px solid #e5e7eb;">{lot_numero}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;color:#6b7280;font-size:14px;
                                   border-top:1px solid #e5e7eb;">Tranche</td>
                        <td style="padding:8px 0;color:#111827;font-size:14px;
                                   font-weight:600;text-align:right;
                                   border-top:1px solid #e5e7eb;">
                          Acompte n°{installment_number}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;color:#6b7280;font-size:14px;
                                   border-top:1px solid #e5e7eb;">Date de paiement</td>
                        <td style="padding:8px 0;color:#111827;font-size:14px;
                                   font-weight:600;text-align:right;
                                   border-top:1px solid #e5e7eb;">{date_str}</td>
                      </tr>
                      <tr>
                        <td style="padding:12px 0 8px;color:#374151;font-size:15px;
                                   font-weight:600;border-top:2px solid #d4973a;">
                          Montant versé
                        </td>
                        <td style="padding:12px 0 8px;color:#d4973a;font-size:18px;
                                   font-weight:700;text-align:right;
                                   border-top:2px solid #d4973a;">
                          {amount_str}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0 8px;color:#6b7280;font-size:13px;">
                          Total acompte prévu
                        </td>
                        <td style="padding:4px 0 8px;color:#6b7280;font-size:13px;
                                   text-align:right;">{total_str}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 12px;color:#374151;font-size:14px;line-height:1.6;">
                Conservez ce message comme justificatif de votre versement.
                Pour toute question, n'hésitez pas à contacter notre équipe commerciale.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#090d16;padding:24px 40px;text-align:center;">
              <p style="margin:0 0 4px;color:#6e7e9e;font-size:12px;">
                PYRAMIDE PROMOTION — Oujda, Maroc
              </p>
              <p style="margin:0;color:#6e7e9e;font-size:12px;">
                +212 0536 71 16 65 &nbsp;|&nbsp; +212 0696 62 91 25
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


class EmailService:
    """Email notification service powered by Resend."""

    def __init__(self) -> None:
        """Configure Resend API key if available."""
        if settings.RESEND_API_KEY:
            resend.api_key = settings.RESEND_API_KEY

    @property
    def _enabled(self) -> bool:
        return bool(settings.RESEND_API_KEY)

    async def send_deposit_payment_confirmation(
        self,
        client_name: str,
        client_email: str,
        amount: float,
        paid_date: datetime | None,
        lot_numero: str,
        project_name: str,
        installment_number: int,
        total_deposit: float,
    ) -> bool:
        """Send a deposit payment confirmation email to the client.

        Returns True if sent successfully, False otherwise.
        """
        if not self._enabled:
            logger.warning(
                "Email skipped — RESEND_API_KEY not configured",
                client_email=client_email,
            )
            return False

        html = _build_deposit_confirmation_html(
            client_name=client_name,
            amount=amount,
            paid_date=paid_date,
            lot_numero=lot_numero,
            project_name=project_name,
            installment_number=installment_number,
            total_deposit=total_deposit,
        )

        params: resend.Emails.SendParams = {
            "from": settings.EMAIL_FROM,
            "to": [client_email],
            "subject": f"Confirmation de paiement — Lot {lot_numero} · {project_name}",
            "html": html,
        }

        try:
            await asyncio.to_thread(resend.Emails.send, params)
            logger.info(
                "Deposit confirmation email sent",
                client_email=client_email,
                lot_numero=lot_numero,
                amount=amount,
            )
            return True
        except Exception:
            logger.exception(
                "Failed to send deposit confirmation email",
                client_email=client_email,
                lot_numero=lot_numero,
            )
            return False
