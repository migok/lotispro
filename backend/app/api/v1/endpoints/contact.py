"""Contact form endpoint — no authentication required."""

import resend
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, field_validator

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)
router = APIRouter()


class ContactRequest(BaseModel):
    company: str
    name: str
    email: EmailStr
    phone: str
    scale: str
    message: str

    @field_validator("company", "name", "phone", "scale", "message")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Ce champ ne peut pas être vide.")
        return v.strip()


@router.post(
    "/contact",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soumettre un formulaire de contact",
    description="Envoie une demande de démonstration par email via Resend. Pas d'authentification requise.",
    tags=["Contact"],
)
async def submit_contact(payload: ContactRequest) -> None:
    """Send contact form submission to the team via Resend."""
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured — contact form dropped", email=payload.email)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Le service d'envoi d'email n'est pas configuré.",
        )

    resend.api_key = settings.RESEND_API_KEY

    html_body = f"""
    <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f1624; color: #ecf0fa; border-radius: 12px; overflow: hidden;">
      <div style="background: #182035; padding: 32px 40px; border-bottom: 2px solid #d4973a;">
        <h1 style="margin: 0; font-size: 22px; font-weight: 600; color: #ecf0fa; letter-spacing: 0.02em;">
          LotisPro — Nouvelle demande de démo
        </h1>
      </div>
      <div style="padding: 36px 40px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #1e2840; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #6e7e9e; width: 140px;">Entreprise</td>
            <td style="padding: 10px 0; border-bottom: 1px solid #1e2840; font-size: 15px; font-weight: 600; color: #ecf0fa;">{payload.company}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #1e2840; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #6e7e9e;">Nom</td>
            <td style="padding: 10px 0; border-bottom: 1px solid #1e2840; font-size: 15px; color: #ecf0fa;">{payload.name}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #1e2840; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #6e7e9e;">Email</td>
            <td style="padding: 10px 0; border-bottom: 1px solid #1e2840; font-size: 15px; color: #d4973a;">
              <a href="mailto:{payload.email}" style="color: #d4973a; text-decoration: none;">{payload.email}</a>
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #1e2840; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #6e7e9e;">Téléphone</td>
            <td style="padding: 10px 0; border-bottom: 1px solid #1e2840; font-size: 15px; color: #ecf0fa;">{payload.phone}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #1e2840; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #6e7e9e;">Volume</td>
            <td style="padding: 10px 0; border-bottom: 1px solid #1e2840; font-size: 15px; color: #ecf0fa;">{payload.scale}</td>
          </tr>
        </table>
        <div style="margin-top: 28px;">
          <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #6e7e9e; margin-bottom: 10px;">Message</div>
          <div style="background: #182035; border: 1px solid #1e2840; border-radius: 8px; padding: 20px; font-size: 15px; line-height: 1.7; color: #b8c4db; white-space: pre-wrap;">{payload.message}</div>
        </div>
        <div style="margin-top: 32px; text-align: center;">
          <a href="mailto:{payload.email}" style="display: inline-block; background: #d4973a; color: #111827; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 14px;">
            Répondre à {payload.name}
          </a>
        </div>
      </div>
      <div style="background: #182035; padding: 20px 40px; text-align: center; font-size: 12px; color: #6e7e9e;">
        LotisPro · Formulaire de contact · lotispro.com
      </div>
    </div>
    """

    try:
        resend.Emails.send({
            "from": settings.EMAIL_FROM,
            "to": [settings.CONTACT_EMAIL],
            "reply_to": payload.email,
            "subject": f"[LotisPro] Demande de démo — {payload.company} ({payload.name})",
            "html": html_body,
        })
        logger.info(
            "Contact form submitted",
            company=payload.company,
            email=payload.email,
            scale=payload.scale,
        )
    except Exception as exc:
        logger.error("Failed to send contact email", error=str(exc), email=payload.email)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="L'envoi de l'email a échoué. Veuillez réessayer ou nous contacter directement.",
        ) from exc
