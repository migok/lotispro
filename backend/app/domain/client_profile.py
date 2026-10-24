"""Client profile domain constants and helpers."""

ACQUISITION_CHANNELS: tuple[str, ...] = (
    "smap",
    "bureau_vente",
    "reseaux_sociaux",
    "recommandation",
    "samsar",
)
ACTE_ADDRESS_CHOICES: tuple[str, ...] = ("morocco", "abroad")
NOTIFICATION_CHANNELS: tuple[str, ...] = ("email", "sms", "whatsapp")


def compose_client_name(first_name: str | None, last_name: str | None) -> str:
    """Build the display name ("Prénom Nom") from the name parts."""
    parts = [(first_name or "").strip(), (last_name or "").strip()]
    return " ".join(p for p in parts if p)
