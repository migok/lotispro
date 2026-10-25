"""Client profile domain constants and helpers."""

import re

from app.core.exceptions import ValidationError

ACQUISITION_CHANNELS: tuple[str, ...] = (
    "smap",
    "bureau_vente",
    "reseaux_sociaux",
    "recommandation",
    "samsar",
)
ACTE_ADDRESS_CHOICES: tuple[str, ...] = ("morocco", "abroad")
NOTIFICATION_CHANNELS: tuple[str, ...] = ("email", "sms", "whatsapp")

CIN_PATTERN = re.compile(r"^[A-Z]{1,2}[0-9]{1,6}$")
PHONE_PATTERN = re.compile(r"^\+[1-9][0-9]{7,14}$")
CIN_ERROR = "Format CIN invalide (ex. AB123456)"
PHONE_ERROR = "Numéro invalide (format international, ex. +212612345678)"


def compose_client_name(first_name: str | None, last_name: str | None) -> str:
    """Build the display name ("Prénom Nom") from the name parts."""
    parts = [(first_name or "").strip(), (last_name or "").strip()]
    return " ".join(p for p in parts if p)


def normalize_cin(value: str | None) -> str | None:
    """Upper-case the CIN and strip spaces; None/empty gives None."""
    if value is None:
        return None
    cin = "".join(value.split()).upper()
    if not cin:
        return None
    if not CIN_PATTERN.match(cin):
        raise ValueError(CIN_ERROR)
    return cin


def normalize_phone(value: str | None) -> str | None:
    """Normalise a phone number to E.164; None/empty gives None."""
    if value is None:
        return None
    phone = re.sub(r"[\s.\-]", "", value)
    if not phone:
        return None
    if phone.startswith("00"):
        phone = "+" + phone[2:]
    elif re.fullmatch(r"0[0-9]{9}", phone):
        phone = "+212" + phone[1:]
    if not PHONE_PATTERN.match(phone):
        raise ValueError(PHONE_ERROR)
    return phone


def _filled(value: object) -> bool:
    return bool(value) and (not isinstance(value, str) or bool(value.strip()))


def validate_client_profile(state: dict) -> dict:
    """Check the full client state; return it with ``acte_address`` completed.

    Raises:
        ValidationError: on the first violated rule, carrying the faulty field.
    """
    for field in ("last_name", "first_name", "phone", "acquisition_channel"):
        if not _filled(state.get(field)):
            raise ValidationError("Champ obligatoire", field=field)

    channel = state["acquisition_channel"]
    if channel in ("recommandation", "samsar") and not _filled(
        state.get("acquisition_referrer")
    ):
        raise ValidationError("Indiquez qui", field="acquisition_referrer")
    if channel == "samsar" and not state.get("acquisition_date"):
        raise ValidationError("Indiquez quand", field="acquisition_date")

    has_morocco = _filled(state.get("address_morocco"))
    has_abroad = _filled(state.get("address_abroad"))
    if not (has_morocco or has_abroad):
        raise ValidationError(
            "Renseignez au moins une adresse (Maroc ou étranger)",
            field="address_morocco",
        )
    for has_address, city_field in (
        (has_morocco, "city_morocco"),
        (has_abroad, "city_abroad"),
    ):
        if has_address and not _filled(state.get(city_field)):
            raise ValidationError("Indiquez la ville", field=city_field)
    if has_abroad and not _filled(state.get("country_abroad")):
        raise ValidationError("Indiquez le pays", field="country_abroad")
    acte = state.get("acte_address")
    result = dict(state)
    if has_morocco and has_abroad and not acte:
        raise ValidationError(
            "Choisissez l'adresse utilisée pour les actes", field="acte_address"
        )
    if not acte and (has_morocco or has_abroad):
        result["acte_address"] = "morocco" if has_morocco else "abroad"
    elif (acte == "morocco" and not has_morocco) or (
        acte == "abroad" and not has_abroad
    ):
        raise ValidationError(
            "L'adresse d'acte choisie n'est pas renseignée", field="acte_address"
        )
    return result


def acte_address_of(client: object) -> str | None:
    """Address printed on legal documents (actes) for a client.

    The chosen address when ``acte_address`` is set and filled, otherwise the
    only filled address, otherwise None. The city (and, for the foreign address,
    the country) is appended ("<address>, <city>, <country>") when known;
    legacy records may have none.
    """
    morocco = getattr(client, "address_morocco", None)
    abroad = getattr(client, "address_abroad", None)
    choice = getattr(client, "acte_address", None)
    if choice == "abroad" and _filled(abroad):
        side = "abroad"
    elif (choice == "morocco" and _filled(morocco)) or (
        _filled(morocco) and not _filled(abroad)
    ):
        side = "morocco"
    elif _filled(abroad) and not _filled(morocco):
        side = "abroad"
    else:
        return None
    address = morocco if side == "morocco" else abroad
    parts = [address, getattr(client, f"city_{side}", None)]
    if side == "abroad":
        parts.append(getattr(client, "country_abroad", None))
    return ", ".join(part for part in parts if _filled(part))
