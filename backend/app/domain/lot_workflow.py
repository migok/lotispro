"""Lot workflow: statuses, status groups and the transition table.

Pure domain module (no database access). Services keep their own departure
status checks (and messages) and then call ``assert_transition_allowed``,
which enforces the project conditions (optional statuses enabled or not) and
acts as a safety net on the departure status.
"""

from collections.abc import Iterable
from dataclasses import dataclass

from app.core.exceptions import BusinessRuleError

# Pipeline order of the spec, ``blocked`` last.
ALL_STATUSES: tuple[str, ...] = (
    "creation",
    "available",
    "option",
    "reservation_a_finaliser",
    "reservation_engagee",
    "reservation_soldee",
    "edl_programme",
    "edl_realise",
    "edl_finalise",
    "chez_notaire",
    "chez_proprietaire",
    "blocked",
)

STATUS_LABELS: dict[str, str] = {
    "creation": "Création",
    "available": "Disponible",
    "option": "Option",
    "reservation_a_finaliser": "Réservation à finaliser",
    "reservation_engagee": "Réservation engagée",
    "reservation_soldee": "Réservation soldée",
    "edl_programme": "État des lieux programmé",
    "edl_realise": "État des lieux réalisé",
    "edl_finalise": "État des lieux finalisé",
    "chez_notaire": "Chez le notaire",
    "chez_proprietaire": "Chez le propriétaire",
    "blocked": "Bloqué",
}

# Keys a project can enable; "edl" covers the three EDL statuses.
OPTIONAL_KEYS: tuple[str, ...] = ("option", "reservation_a_finaliser", "edl")
EDL_STATUSES: tuple[str, ...] = ("edl_programme", "edl_realise", "edl_finalise")
SOLD_STATUSES: tuple[str, ...] = (
    "reservation_soldee",
    *EDL_STATUSES,
    "chez_notaire",
    "chez_proprietaire",
)
# Statuses where the lot's état des lieux is shown (a lot sent back to
# ``available`` keeps its current reservation, hence its old EDL).
EDL_VISIBLE_STATUSES: tuple[str, ...] = (
    *EDL_STATUSES,
    "chez_notaire",
    "chez_proprietaire",
)
MANDATORY_STATUSES: tuple[str, ...] = tuple(
    s
    for s in ALL_STATUSES
    if s not in ("option", "reservation_a_finaliser", *EDL_STATUSES)
)

DEFAULT_ENABLED_OPTIONAL: tuple[str, ...] = ("option", "reservation_a_finaliser")

# Statuses controlled by each optional key, and the label used in messages.
OPTIONAL_KEY_STATUSES: dict[str, tuple[str, ...]] = {
    "option": ("option",),
    "reservation_a_finaliser": ("reservation_a_finaliser",),
    "edl": EDL_STATUSES,
}
OPTIONAL_KEY_LABELS: dict[str, str] = {
    "option": STATUS_LABELS["option"],
    "reservation_a_finaliser": STATUS_LABELS["reservation_a_finaliser"],
    "edl": "État des lieux",
}


@dataclass(frozen=True)
class Transition:
    """One named transition of the lot workflow.

    ``to_status`` is ``None`` when the transition leaves the status unchanged;
    for ``direct_update`` the caller picks the target among
    ``DIRECT_UPDATE_STATUSES`` (validated by ``LotService.update_lot``).
    """

    name: str
    label: str  # French action label shown in error messages
    from_statuses: frozenset[str]
    to_status: str | None
    requires_enabled: str | None = None
    requires_disabled: str | None = None


DIRECT_UPDATE_STATUSES: tuple[str, ...] = ("creation", "available", "blocked")


def _t(
    name: str,
    label: str,
    from_statuses: Iterable[str],
    to_status: str | None,
    requires_enabled: str | None = None,
    requires_disabled: str | None = None,
) -> Transition:
    return Transition(
        name,
        label,
        frozenset(from_statuses),
        to_status,
        requires_enabled,
        requires_disabled,
    )


_TRANSITION_LIST = (
    _t("activate", "Activer le lot", ["creation"], "available"),
    _t(
        "start_option",
        "Démarrer une option",
        ["available"],
        "option",
        requires_enabled="option",
    ),
    _t("cancel_option", "Annuler l'option", ["option"], "available"),
    _t(
        "extend_option",
        "Prolonger l'option",
        ["option", "reservation_a_finaliser"],
        None,
    ),
    _t(
        "direct_reservation",
        "Réserver directement (à finaliser)",
        ["available"],
        "reservation_a_finaliser",
        requires_enabled="reservation_a_finaliser",
    ),
    _t(
        "to_reservation",
        "Passer en réservation à finaliser",
        ["option"],
        "reservation_a_finaliser",
        requires_enabled="reservation_a_finaliser",
    ),
    _t("refund", "Rembourser la garantie", ["reservation_a_finaliser"], "available"),
    _t(
        "direct_engage",
        "Engager directement la réservation",
        ["available"],
        "reservation_engagee",
    ),
    _t(
        "engage",
        "Engager la réservation",
        ["reservation_a_finaliser"],
        "reservation_engagee",
    ),
    _t(
        "option_engage",
        "Engager la réservation depuis l'option",
        ["option"],
        "reservation_engagee",
        requires_disabled="reservation_a_finaliser",
    ),
    _t("solde", "Marquer soldé", ["reservation_engagee"], "reservation_soldee"),
    _t(
        "set_notaire_intent",
        "Définir l'intention notaire",
        ["reservation_soldee", *EDL_STATUSES],
        None,
    ),
    _t(
        "edl_schedule",
        "Programmer l'état des lieux",
        ["reservation_soldee"],
        "edl_programme",
        requires_enabled="edl",
    ),
    _t("edl_reschedule", "Reprogrammer l'état des lieux", ["edl_programme"], None),
    _t(
        "edl_done", "Marquer l'état des lieux réalisé", ["edl_programme"], "edl_realise"
    ),
    _t("edl_finalize", "Finaliser l'état des lieux", ["edl_realise"], "edl_finalise"),
    # Conditions depend on the departure status: see _check_notaire_path.
    _t(
        "notaire",
        "Passer chez le notaire",
        ["reservation_soldee", "edl_finalise"],
        "chez_notaire",
    ),
    _t("notaire_update", "Modifier les infos du notaire", ["chez_notaire"], None),
    _t(
        "proprietaire",
        "Confirmer l'acte notarial",
        ["chez_notaire"],
        "chez_proprietaire",
    ),
    _t(
        "block",
        "Bloquer le lot",
        [s for s in ALL_STATUSES if s not in ("blocked", "chez_proprietaire")],
        "blocked",
    ),
    _t("unblock", "Débloquer le lot", ["blocked"], "available"),
    _t("direct_update", "Modifier directement le statut", DIRECT_UPDATE_STATUSES, None),
)

TRANSITIONS: dict[str, Transition] = {t.name: t for t in _TRANSITION_LIST}


def _optional_key(status: str) -> str | None:
    """The project setting key controlling ``status`` (None if mandatory)."""
    if status in EDL_STATUSES:
        return "edl"
    if status in ("option", "reservation_a_finaliser"):
        return status
    return None


def _label(status: str) -> str:
    return STATUS_LABELS.get(status, status)


def is_status_enabled(enabled_optional: Iterable[str], status: str) -> bool:
    """Whether ``status`` can be used by a project with these optional keys."""
    key = _optional_key(status)
    return key is None or key in set(enabled_optional)


def enabled_statuses(enabled_optional: Iterable[str]) -> list[str]:
    """Statuses usable by the project, in pipeline order."""
    enabled = set(enabled_optional)
    return [s for s in ALL_STATUSES if is_status_enabled(enabled, s)]


def _status_disabled(status: str) -> BusinessRuleError:
    return BusinessRuleError(
        message=f"Le statut « {_label(status)} » est désactivé pour ce projet.",
        rule="status_disabled",
    )


def _check_notaire_path(enabled: set[str], from_status: str) -> None:
    """``notaire``: from ``reservation_soldee`` without EDL, from ``edl_finalise`` with."""
    edl_enabled = "edl" in enabled
    if from_status == "reservation_soldee" and edl_enabled:
        raise BusinessRuleError(
            message=(
                "L'état des lieux est activé pour ce projet : programmez-le avant "
                "le passage chez le notaire."
            ),
            rule="edl_required",
        )
    if from_status == "edl_finalise" and not edl_enabled:
        raise _status_disabled(from_status)


def assert_transition_allowed(
    enabled_optional: Iterable[str], transition: str, from_status: str
) -> str:
    """Check ``transition`` from ``from_status`` and return the arrival status.

    Transitions leaving the status unchanged return ``from_status``.

    Raises:
        BusinessRuleError: departure status not in the table
            (``invalid_lot_status``) or project condition not met
            (``status_disabled``, ``option_engage_not_allowed``, ``edl_required``).
    """
    rule = TRANSITIONS[transition]
    enabled = set(enabled_optional)

    if from_status not in rule.from_statuses:
        raise BusinessRuleError(
            message=(
                f"Action « {rule.label} » impossible depuis le statut "
                f"« {_label(from_status)} »."
            ),
            rule="invalid_lot_status",
        )

    if rule.requires_enabled and rule.requires_enabled not in enabled:
        raise _status_disabled(rule.to_status or from_status)

    if rule.requires_disabled and rule.requires_disabled in enabled:
        # Only option_engage has this condition today.
        raise BusinessRuleError(
            message=(
                f"Passez par « {_label(rule.requires_disabled)} » : l'engagement "
                "direct depuis une option n'est possible que si ce statut est "
                "désactivé."
            ),
            rule="option_engage_not_allowed",
        )

    if transition == "notaire":
        _check_notaire_path(enabled, from_status)

    return rule.to_status or from_status
