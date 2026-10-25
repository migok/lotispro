"""Unit tests for the lot workflow table (statuses, groups, transitions)."""

import pytest

from app.core.exceptions import BusinessRuleError
from app.domain.lot_workflow import (
    ALL_STATUSES,
    DEFAULT_ENABLED_OPTIONAL,
    EDL_STATUSES,
    MANDATORY_STATUSES,
    OPTIONAL_KEYS,
    SOLD_STATUSES,
    TRANSITIONS,
    assert_transition_allowed,
    enabled_statuses,
    is_status_enabled,
)

ALL_ENABLED = ("option", "reservation_a_finaliser", "edl")

# (transition, from_status, expected arrival status, enabled optional statuses)
# One case per departure status of the table in the E3 plan.
VALID_CASES = [
    ("activate", "creation", "available", DEFAULT_ENABLED_OPTIONAL),
    ("start_option", "available", "option", DEFAULT_ENABLED_OPTIONAL),
    ("cancel_option", "option", "available", DEFAULT_ENABLED_OPTIONAL),
    ("extend_option", "option", "option", DEFAULT_ENABLED_OPTIONAL),
    (
        "extend_option",
        "reservation_a_finaliser",
        "reservation_a_finaliser",
        DEFAULT_ENABLED_OPTIONAL,
    ),
    (
        "direct_reservation",
        "available",
        "reservation_a_finaliser",
        DEFAULT_ENABLED_OPTIONAL,
    ),
    ("to_reservation", "option", "reservation_a_finaliser", DEFAULT_ENABLED_OPTIONAL),
    ("refund", "reservation_a_finaliser", "available", DEFAULT_ENABLED_OPTIONAL),
    ("direct_engage", "available", "reservation_engagee", DEFAULT_ENABLED_OPTIONAL),
    (
        "engage",
        "reservation_a_finaliser",
        "reservation_engagee",
        DEFAULT_ENABLED_OPTIONAL,
    ),
    ("option_engage", "option", "reservation_engagee", ("option",)),
    ("solde", "reservation_engagee", "reservation_soldee", DEFAULT_ENABLED_OPTIONAL),
    (
        "set_notaire_intent",
        "reservation_soldee",
        "reservation_soldee",
        DEFAULT_ENABLED_OPTIONAL,
    ),
    ("set_notaire_intent", "edl_programme", "edl_programme", ALL_ENABLED),
    ("set_notaire_intent", "edl_realise", "edl_realise", ALL_ENABLED),
    ("set_notaire_intent", "edl_finalise", "edl_finalise", ALL_ENABLED),
    ("edl_schedule", "reservation_soldee", "edl_programme", ALL_ENABLED),
    ("edl_reschedule", "edl_programme", "edl_programme", ALL_ENABLED),
    ("edl_done", "edl_programme", "edl_realise", ALL_ENABLED),
    ("edl_finalize", "edl_realise", "edl_finalise", ALL_ENABLED),
    ("notaire", "reservation_soldee", "chez_notaire", DEFAULT_ENABLED_OPTIONAL),
    ("notaire", "edl_finalise", "chez_notaire", ALL_ENABLED),
    ("notaire_update", "chez_notaire", "chez_notaire", DEFAULT_ENABLED_OPTIONAL),
    ("proprietaire", "chez_notaire", "chez_proprietaire", DEFAULT_ENABLED_OPTIONAL),
    ("unblock", "blocked", "available", DEFAULT_ENABLED_OPTIONAL),
    ("direct_update", "creation", "creation", DEFAULT_ENABLED_OPTIONAL),
    ("direct_update", "available", "available", DEFAULT_ENABLED_OPTIONAL),
    ("direct_update", "blocked", "blocked", DEFAULT_ENABLED_OPTIONAL),
] + [
    ("block", status, "blocked", ALL_ENABLED)
    for status in ALL_STATUSES
    if status not in ("blocked", "chez_proprietaire")
]

TRANSITION_NAMES = sorted(TRANSITIONS)


class TestStatusGroups:
    def test_all_statuses_in_pipeline_order(self) -> None:
        assert ALL_STATUSES == (
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

    def test_groups(self) -> None:
        assert OPTIONAL_KEYS == ("option", "reservation_a_finaliser", "edl")
        assert EDL_STATUSES == ("edl_programme", "edl_realise", "edl_finalise")
        assert SOLD_STATUSES == (
            "reservation_soldee",
            "edl_programme",
            "edl_realise",
            "edl_finalise",
            "chez_notaire",
            "chez_proprietaire",
        )
        assert MANDATORY_STATUSES == (
            "creation",
            "available",
            "reservation_engagee",
            "reservation_soldee",
            "chez_notaire",
            "chez_proprietaire",
            "blocked",
        )

    def test_default_enabled_optional(self) -> None:
        assert DEFAULT_ENABLED_OPTIONAL == ("option", "reservation_a_finaliser")


class TestEnabledStatuses:
    def test_default_is_pipeline_without_edl(self) -> None:
        assert enabled_statuses(DEFAULT_ENABLED_OPTIONAL) == [
            s for s in ALL_STATUSES if s not in EDL_STATUSES
        ]

    def test_all_enabled_is_full_pipeline(self) -> None:
        assert enabled_statuses(ALL_ENABLED) == list(ALL_STATUSES)

    def test_none_enabled_is_mandatory_only(self) -> None:
        assert enabled_statuses(()) == list(MANDATORY_STATUSES)

    @pytest.mark.parametrize("status", MANDATORY_STATUSES)
    @pytest.mark.parametrize("enabled", [(), DEFAULT_ENABLED_OPTIONAL, ALL_ENABLED])
    def test_mandatory_status_always_enabled(
        self, status: str, enabled: tuple[str, ...]
    ) -> None:
        assert is_status_enabled(enabled, status) is True

    @pytest.mark.parametrize(
        ("status", "key"),
        [
            ("option", "option"),
            ("reservation_a_finaliser", "reservation_a_finaliser"),
            ("edl_programme", "edl"),
            ("edl_realise", "edl"),
            ("edl_finalise", "edl"),
        ],
    )
    def test_optional_status_follows_its_key(self, status: str, key: str) -> None:
        assert is_status_enabled((key,), status) is True
        others = tuple(k for k in OPTIONAL_KEYS if k != key)
        assert is_status_enabled(others, status) is False


class TestTransitionTable:
    @pytest.mark.parametrize(
        ("transition", "from_status", "to_status", "enabled"), VALID_CASES
    )
    def test_valid_departure_gives_arrival_status(
        self,
        transition: str,
        from_status: str,
        to_status: str,
        enabled: tuple[str, ...],
    ) -> None:
        assert assert_transition_allowed(enabled, transition, from_status) == to_status

    def test_every_departure_status_is_covered(self) -> None:
        covered = {(t, f) for t, f, _, _ in VALID_CASES}
        expected = {
            (name, status)
            for name, transition in TRANSITIONS.items()
            for status in transition.from_statuses
        }
        assert covered == expected

    @pytest.mark.parametrize("transition", TRANSITION_NAMES)
    def test_invalid_departure_is_refused(self, transition: str) -> None:
        refused = [
            s for s in ALL_STATUSES if s not in TRANSITIONS[transition].from_statuses
        ]
        assert refused, transition
        for status in refused:
            with pytest.raises(BusinessRuleError) as exc:
                assert_transition_allowed(ALL_ENABLED, transition, status)
            assert exc.value.rule == "invalid_lot_status"


class TestProjectConditions:
    @pytest.mark.parametrize(
        ("transition", "from_status", "enabled", "label"),
        [
            ("start_option", "available", ("reservation_a_finaliser",), "Option"),
            (
                "direct_reservation",
                "available",
                ("option",),
                "Réservation à finaliser",
            ),
            ("to_reservation", "option", ("option",), "Réservation à finaliser"),
            (
                "edl_schedule",
                "reservation_soldee",
                DEFAULT_ENABLED_OPTIONAL,
                "État des lieux programmé",
            ),
        ],
    )
    def test_disabled_target_status_is_refused(
        self,
        transition: str,
        from_status: str,
        enabled: tuple[str, ...],
        label: str,
    ) -> None:
        with pytest.raises(BusinessRuleError) as exc:
            assert_transition_allowed(enabled, transition, from_status)
        assert exc.value.rule == "status_disabled"
        assert exc.value.message == (
            f"Le statut « {label} » est désactivé pour ce projet."
        )

    def test_option_engage_refused_while_raf_enabled(self) -> None:
        with pytest.raises(BusinessRuleError) as exc:
            assert_transition_allowed(
                DEFAULT_ENABLED_OPTIONAL, "option_engage", "option"
            )
        assert exc.value.rule == "option_engage_not_allowed"
        assert exc.value.message == (
            "Passez par « Réservation à finaliser » : l'engagement direct depuis "
            "une option n'est possible que si ce statut est désactivé."
        )

    def test_notaire_from_soldee_refused_when_edl_enabled(self) -> None:
        with pytest.raises(BusinessRuleError) as exc:
            assert_transition_allowed(ALL_ENABLED, "notaire", "reservation_soldee")
        assert exc.value.rule == "edl_required"
        assert exc.value.message == (
            "L'état des lieux est activé pour ce projet : programmez-le avant "
            "le passage chez le notaire."
        )

    def test_notaire_from_edl_finalise_refused_when_edl_disabled(self) -> None:
        with pytest.raises(BusinessRuleError) as exc:
            assert_transition_allowed(
                DEFAULT_ENABLED_OPTIONAL, "notaire", "edl_finalise"
            )
        assert exc.value.rule == "status_disabled"

    def test_invalid_departure_message_is_french(self) -> None:
        with pytest.raises(BusinessRuleError) as exc:
            assert_transition_allowed(DEFAULT_ENABLED_OPTIONAL, "solde", "available")
        assert exc.value.message == (
            "Action « Marquer soldé » impossible depuis le statut « Disponible »."
        )

    @pytest.mark.parametrize("transition", TRANSITION_NAMES)
    def test_every_transition_has_a_french_label(self, transition: str) -> None:
        label = TRANSITIONS[transition].label
        assert label
        assert label != transition
        assert "_" not in label
