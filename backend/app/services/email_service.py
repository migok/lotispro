"""Email service — invitations and payment confirmations via Resend."""

import asyncio
from datetime import datetime

import resend

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def _build_invitation_html(first_name: str, last_name: str, role: str, set_password_url: str) -> str:
    """Build the HTML body for a staff invitation email."""
    role_label = "Manager" if role == "manager" else "Commercial"
    full_name = f"{first_name} {last_name}"
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invitation LotisPro</title>
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
                        color:#d4973a;font-weight:600;">LotisPro</p>
              <h1 style="margin:8px 0 0;font-size:24px;color:#ecf0fa;font-weight:300;
                         letter-spacing:0.5px;">Vous êtes invité(e)</h1>
            </td>
          </tr>

          <!-- Gold banner -->
          <tr>
            <td style="background:#2d1f05;padding:16px 40px;text-align:center;">
              <p style="margin:0;color:#d4973a;font-size:14px;font-weight:600;">
                Accès {role_label} — LotisPro
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 24px;color:#374151;font-size:15px;">
                Bonjour <strong>{full_name}</strong>,
              </p>
              <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.6;">
                Votre compte <strong>{role_label}</strong> a été créé sur la plateforme LotisPro.
                Cliquez sur le bouton ci-dessous pour définir votre mot de passe et activer votre accès.
              </p>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="{set_password_url}"
                       style="display:inline-block;padding:14px 36px;background:#d4973a;
                              color:#111827;font-size:15px;font-weight:600;text-decoration:none;
                              border-radius:4px;letter-spacing:0.3px;">
                      Créer mon mot de passe
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;color:#6b7280;font-size:13px;line-height:1.6;">
                Ce lien est valable <strong>48 heures</strong>.
                Si vous n'êtes pas à l'origine de cette invitation, ignorez cet email.
              </p>
              <p style="margin:0;color:#9ca3af;font-size:12px;word-break:break-all;">
                {set_password_url}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#090d16;padding:24px 40px;text-align:center;">
              <p style="margin:0;color:#6e7e9e;font-size:12px;">
                LOTISPRO
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _format_amount(amount: float) -> str:
    """Format a float as a Moroccan Dirham amount."""
    return f"{amount:,.2f} DH".replace(",", " ")


def _format_date(dt: datetime | None) -> str:
    """Format a datetime to a readable French date string."""
    if dt is None:
        return "—"
    return dt.strftime("%d/%m/%Y")


def _build_payment_confirmation_html(
    client_name: str,
    amount: float,
    paid_date: datetime | None,
    lot_numero: str,
    project_name: str,
    payment_type: str,
    installment_number: int,
    total_installments: int,
    schedule_total: float,
) -> str:
    """Build the HTML body for a payment confirmation email (deposit or balance)."""
    amount_str = _format_amount(amount)
    total_str = _format_amount(schedule_total)
    date_str = _format_date(paid_date)

    is_balance = payment_type == "balance"
    type_label = "Solde" if is_balance else "Acompte"
    banner_bg = "#1a3a4f" if is_balance else "#1a4731"
    banner_color = "#3b9edb" if is_balance else "#2ecc71"
    banner_text = f"Versement {type_label.lower()} confirmé"
    tranche_label = f"{type_label} n°{installment_number}/{total_installments}"
    total_label = f"Total {type_label.lower()} prévu"

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
                        color:#d4973a;font-weight:600;">LotisPro</p>
              <h1 style="margin:8px 0 0;font-size:24px;color:#ecf0fa;font-weight:300;
                         letter-spacing:0.5px;">Confirmation de paiement</h1>
            </td>
          </tr>

          <!-- Banner -->
          <tr>
            <td style="background:{banner_bg};padding:16px 40px;text-align:center;">
              <p style="margin:0;color:{banner_color};font-size:14px;font-weight:600;">
                &#10003; &nbsp;{banner_text}
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
                Nous accusons réception de votre versement pour le lot
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
                          {tranche_label}
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
                          {total_label}
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
              <p style="margin:0;color:#6e7e9e;font-size:12px;">
                LOTISPRO
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _build_certificate_email_html(
    client_name: str,
    lot_numero: str,
    project_name: str,
) -> str:
    """Build the HTML body for a certificate email."""
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Acte de réservation</title>
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
                        color:#d4973a;font-weight:600;">LotisPro</p>
              <h1 style="margin:8px 0 0;font-size:24px;color:#ecf0fa;font-weight:300;
                         letter-spacing:0.5px;">Acte de réservation</h1>
            </td>
          </tr>

          <!-- Gold banner -->
          <tr>
            <td style="background:#2d1f05;padding:16px 40px;text-align:center;">
              <p style="margin:0;color:#d4973a;font-size:14px;font-weight:600;">
                Lot {lot_numero} — {project_name}
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
                Veuillez trouver ci-joint votre acte de réservation pour le lot
                <strong>{lot_numero}</strong> dans le projet <strong>{project_name}</strong>.
              </p>
              <p style="margin:0 0 12px;color:#374151;font-size:14px;line-height:1.6;">
                Conservez ce document comme justificatif officiel de votre réservation.
                Pour toute question, n'hésitez pas à contacter notre équipe commerciale.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#090d16;padding:24px 40px;text-align:center;">
              <p style="margin:0;color:#6e7e9e;font-size:12px;">
                LOTISPRO
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

    async def send_invitation_email(
        self,
        first_name: str,
        last_name: str,
        email: str,
        role: str,
        invitation_token: str,
        frontend_url: str,
    ) -> bool:
        """Send an invitation email so the user can create their password.

        Returns True if sent successfully, False otherwise.
        """
        if not self._enabled:
            logger.warning(
                "Invitation email skipped — RESEND_API_KEY not configured",
                email=email,
            )
            return False

        set_password_url = f"{frontend_url.rstrip('/')}/set-password?token={invitation_token}"
        html = _build_invitation_html(
            first_name=first_name,
            last_name=last_name,
            role=role,
            set_password_url=set_password_url,
        )

        params: resend.Emails.SendParams = {
            "from": settings.EMAIL_FROM,
            "to": [email],
            "subject": "Votre invitation LotisPro — Créez votre mot de passe",
            "html": html,
        }

        try:
            await asyncio.to_thread(resend.Emails.send, params)
            logger.info("Invitation email sent", email=email, role=role)
            return True
        except Exception:
            logger.exception("Failed to send invitation email", email=email)
            return False

    async def send_payment_confirmation(
        self,
        client_name: str,
        client_email: str,
        amount: float,
        paid_date: datetime | None,
        lot_numero: str,
        project_name: str,
        payment_type: str,
        installment_number: int,
        total_installments: int,
        schedule_total: float,
    ) -> bool:
        """Send a payment confirmation email to the client (deposit or balance).

        Returns True if sent successfully, False otherwise.
        """
        if not self._enabled:
            logger.warning(
                "Email skipped — RESEND_API_KEY not configured",
                client_email=client_email,
            )
            return False

        type_label = "solde" if payment_type == "balance" else "acompte"
        html = _build_payment_confirmation_html(
            client_name=client_name,
            amount=amount,
            paid_date=paid_date,
            lot_numero=lot_numero,
            project_name=project_name,
            payment_type=payment_type,
            installment_number=installment_number,
            total_installments=total_installments,
            schedule_total=schedule_total,
        )

        params: resend.Emails.SendParams = {
            "from": settings.EMAIL_FROM,
            "to": [client_email],
            "subject": f"Confirmation de paiement {type_label} — Lot {lot_numero} · {project_name}",
            "html": html,
        }

        try:
            await asyncio.to_thread(resend.Emails.send, params)
            logger.info(
                "Payment confirmation email sent",
                client_email=client_email,
                lot_numero=lot_numero,
                payment_type=payment_type,
                installment_number=installment_number,
                amount=amount,
            )
            return True
        except Exception:
            logger.exception(
                "Failed to send payment confirmation email",
                client_email=client_email,
                lot_numero=lot_numero,
            )
            return False

    async def send_certificate_email(
        self,
        client_name: str,
        client_email: str,
        lot_numero: str,
        project_name: str,
        pdf_bytes: bytes,
        filename: str,
    ) -> bool:
        """Send the reservation certificate PDF as an email attachment.

        Returns True if sent successfully, False otherwise.
        """
        import base64

        if not self._enabled:
            logger.warning(
                "Certificate email skipped — RESEND_API_KEY not configured",
                client_email=client_email,
            )
            return False

        html = _build_certificate_email_html(
            client_name=client_name,
            lot_numero=lot_numero,
            project_name=project_name,
        )

        params: resend.Emails.SendParams = {
            "from": settings.EMAIL_FROM,
            "to": [client_email],
            "subject": f"Acte de réservation — Lot {lot_numero} · {project_name}",
            "html": html,
            "attachments": [
                {
                    "filename": filename,
                    "content": base64.b64encode(pdf_bytes).decode("utf-8"),
                }
            ],
        }

        try:
            await asyncio.to_thread(resend.Emails.send, params)
            logger.info(
                "Certificate email sent",
                client_email=client_email,
                lot_numero=lot_numero,
                filename=filename,
            )
            return True
        except Exception:
            logger.exception(
                "Failed to send certificate email",
                client_email=client_email,
                lot_numero=lot_numero,
            )
            return False
