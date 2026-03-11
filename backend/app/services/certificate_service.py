"""Certificate generation service — PDF Acte de Réservation."""

from __future__ import annotations

from datetime import date, datetime

from fpdf import FPDF

# ── Static company data ──────────────────────────────────────────────────────
COMPANY_NAME = "PYRAMIDE PROMOTION"
COMPANY_MANAGER = "Abdelkhalek MIMOUNI"
COMPANY_MANAGER_CIN = "F414624"
COMPANY_CAPITAL = "1 000 000 DH"
COMPANY_PATENTE = "10104772"
COMPANY_IF = "66196676"
COMPANY_RC = "OUJDA 43777"
COMPANY_ICE = "003651491000058"
COMPANY_TEL = "+212 0536 71 16 65"
COMPANY_MOBILE = "+212 0696 62 91 25"
COMPANY_ADDRESS = (
    "Appartement n°263ème Etage Immeuble MOUHANDISSINE "
    "Angle Rue Istiqlal et Rue Ibn Rochd - 60000 Oujda"
)
COMPANY_CITY = "Oujda"
ABANDONMENT_FEES = "10 000DH"


def _fmt_date(d: date | datetime | None) -> str:
    if d is None:
        return "_______________"
    if isinstance(d, datetime):
        d = d.date()
    return d.strftime("%d-%m-%Y")


def _fmt_price(amount: float | None) -> str:
    if amount is None:
        return "_______________"
    formatted = f"{amount:,.2f}".replace(",", " ").replace(".", ",")
    return f"{formatted} DH"


class CertificateService:
    """Generate reservation certificates as PDF bytes."""

    def generate_reservation_certificate(
        self,
        reservation_id: int,
        reservation_date: datetime,
        deposit: float,
        deposit_date: date | None,
        lot_numero: str,
        lot_surface: float | None,
        lot_price: float | None,
        project_name: str,
        client_name: str,
        client_cin: str | None,
        client_address: str | None,
    ) -> bytes:
        """Generate PDF Acte de Réservation and return as bytes."""
        pdf = FPDF(orientation="P", unit="mm", format="A4")
        pdf.set_margins(left=20, top=20, right=20)
        pdf.set_auto_page_break(auto=True, margin=20)
        pdf.add_page()

        balance = (lot_price or 0.0) - deposit
        price_per_m2 = (
            lot_price / lot_surface
            if lot_price and lot_surface and lot_surface > 0
            else None
        )
        w = pdf.epw  # effective page width

        # ── Header ─────────────────────────────────────────────────────────
        pdf.set_font("Helvetica", "B", 16)
        pdf.cell(0, 10, COMPANY_NAME, align="C", new_x="LMARGIN", new_y="NEXT")

        pdf.set_font("Helvetica", "BU", 13)
        pdf.cell(0, 8, "ACTE DE RESERVATION", align="C", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(6)

        # ── ENTRE LES SOUSSIGNÉS ────────────────────────────────────────────
        pdf.set_font("Helvetica", "BU", 10)
        pdf.cell(0, 6, "ENTRE LES SOUSSIGNES :", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

        # Company side
        pdf.set_font("Helvetica", "", 10)
        txt_company = (
            f"Société {COMPANY_NAME}, représentée par son gérant légal "
            f"Monsieur {COMPANY_MANAGER}, portant CIN N° {COMPANY_MANAGER_CIN},"
            f" ci-après désigné réservant"
        )
        pdf.multi_cell(w, 5.5, txt_company, align="J", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)
        pdf.cell(0, 5.5, "D'une part,", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

        # Client side
        cin_str = f"CIN N°  {client_cin}" if client_cin else "CIN N°  _______________"
        address_str = client_address if client_address else "_______________________________________________"
        txt_client = (
            f"Monsieur/Madame {client_name}, portant {cin_str},"
            f" demeurant à {address_str}, ci-après désigné réservataire"
        )
        pdf.multi_cell(w, 5.5, txt_client, align="J", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)
        pdf.cell(0, 5.5, "D'autre part,", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(6)

        # ── IL A ETE CONVENU ────────────────────────────────────────────────
        pdf.set_font("Helvetica", "BU", 10)
        pdf.cell(0, 6, "IL A ETE CONVENU CE QUI SUIT :", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

        pdf.set_font("Helvetica", "", 10)
        txt_convenu = (
            f"La société {COMPANY_NAME} déclare réserver en s'obligeant à toutes les "
            f"garanties ordinaires de fait et de droit à Monsieur/Madame {client_name}"
            f" qui accepte:"
        )
        pdf.multi_cell(w, 5.5, txt_convenu, align="J", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)

        # ── DESIGNATION ─────────────────────────────────────────────────────
        pdf.set_font("Helvetica", "BU", 10)
        pdf.cell(0, 6, "DESIGNATION:", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

        surface_str = f"{lot_surface} m²" if lot_surface else "___ m²"
        txt_desig = (
            f"Un lot de terrain N°{lot_numero} d'une superficie approximative avant "
            f"bornage de {surface_str}, provenant du lotissement en cours de réalisation"
            f" dénommé {project_name}."
        )
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(w, 5.5, txt_desig, align="J", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)

        # ── PRIX ────────────────────────────────────────────────────────────
        pdf.set_font("Helvetica", "BU", 10)
        pdf.cell(0, 6, "PRIX :", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

        pdf.set_font("Helvetica", "", 10)
        if price_per_m2:
            price_m2_fmt = f"{price_per_m2:,.0f}".replace(",", " ")
            txt_prix = (
                f"Cette réservation est conclue moyennant le prix de {price_m2_fmt} DH/m²"
                f" soit un total de {_fmt_price(lot_price)}, la société {COMPANY_NAME}"
                f" déclare avoir reçu du réservataire les avances suivantes :"
            )
        else:
            txt_prix = (
                f"Cette réservation est conclue moyennant le prix total de"
                f" {_fmt_price(lot_price)}, la société {COMPANY_NAME} déclare avoir reçu"
                f" du réservataire les avances suivantes :"
            )
        pdf.multi_cell(w, 5.5, txt_prix, align="J", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

        # Deposit line (bold)
        pdf.set_font("Helvetica", "B", 10)
        deposit_line = f"{_fmt_price(deposit)} Versé le {_fmt_date(deposit_date)}"
        pdf.cell(0, 6, deposit_line, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)

        pdf.set_font("Helvetica", "", 10)
        pdf.cell(0, 5.5, "Dont quittance,", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

        txt_balance = (
            f"Quant au solde soit {_fmt_price(balance)} sera versé au réservant"
            f" aux conditions suivantes :"
        )
        pdf.multi_cell(w, 5.5, txt_balance, align="J", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

        # Conditions (static)
        conditions = [
            (
                "Après achèvement des travaux du lotissement, le réservant avise le "
                "réservataire par tout moyen (Téléphone et ou lettre postale et ou "
                "huissier de justice) l'invitant à verser le solde et accomplir les "
                "formalités de cession du lot de terrain précité chez le notaire et "
                "ce dans un délai de 1 mois à partir de la date d'invitation à verser "
                "le solde."
            ),
            (
                f"Passé ce délai, la réservation sera annulée de plein droit et le "
                f"montant de l'avance de {_fmt_price(deposit)} sera restitué au "
                f"réservataire en déduisant un montant total de ({ABANDONMENT_FEES})"
                f" comme frais d'abondement."
            ),
            (
                "Le réservataire s'oblige à informer le réservant par lettre LRAR de "
                "tout changement concernant ses coordonnées téléphoniques et postales "
                "pour acter les éventuels envois de courrier concernant l'achèvement "
                "de travaux et notamment l'invitation à verser le solde."
            ),
        ]
        for cond in conditions:
            pdf.multi_cell(w, 5.5, f"- {cond}", align="J", new_x="LMARGIN", new_y="NEXT")
            pdf.ln(2)

        pdf.ln(4)

        # ── Fait à ──────────────────────────────────────────────────────────
        pdf.set_font("Helvetica", "", 10)
        pdf.cell(
            0, 6, f"Fait à {COMPANY_CITY}, le {_fmt_date(reservation_date)}",
            new_x="LMARGIN", new_y="NEXT",
        )
        pdf.ln(8)

        # ── Signature block ──────────────────────────────────────────────────
        col_w = w / 2
        pdf.cell(col_w, 5.5, f"Le réservataire ({client_name})", align="L")
        pdf.cell(col_w, 5.5, f"réservant ({COMPANY_NAME})", align="R", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)
        pdf.cell(col_w, 5.5, "Lu et accepté", align="L")
        pdf.cell(col_w, 5.5, "Lu et accepté", align="R", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(22)  # space for signatures

        # ── Footer ──────────────────────────────────────────────────────────
        pdf.set_font("Helvetica", "", 7.5)
        footer_lines = [
            f"Siège social : {COMPANY_ADDRESS}",
            (
                f"Capital social : {COMPANY_CAPITAL} - Patente : {COMPANY_PATENTE}"
                f" - Identifiant fiscal : {COMPANY_IF}"
                f" - R.C : {COMPANY_RC} - ICE : {COMPANY_ICE}"
            ),
            f"Téléphone : {COMPANY_TEL} - Portable : {COMPANY_MOBILE}",
        ]
        for line in footer_lines:
            pdf.cell(0, 4, line, align="C", new_x="LMARGIN", new_y="NEXT")

        return bytes(pdf.output())
