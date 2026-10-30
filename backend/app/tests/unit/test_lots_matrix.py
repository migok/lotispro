"""Pure construction of the lot type x status matrix."""

from app.domain.lots_matrix import build_lots_matrix

DEFAULT = ("option", "reservation_a_finaliser")


def test_statuses_follow_project_settings() -> None:
    m = build_lots_matrix(DEFAULT, [])
    assert m.statuses == [
        "creation",
        "available",
        "option",
        "reservation_a_finaliser",
        "reservation_engagee",
        "reservation_soldee",
        "chez_notaire",
        "chez_proprietaire",
        "blocked",
    ]
    assert m.rows == []
    assert m.grand_total == 0
    assert m.totals == dict.fromkeys(m.statuses, 0)


def test_edl_enabled_adds_three_statuses_in_pipeline_order() -> None:
    m = build_lots_matrix(("edl",), [])
    assert m.statuses == [
        "creation",
        "available",
        "reservation_engagee",
        "reservation_soldee",
        "edl_programme",
        "edl_realise",
        "edl_finalise",
        "chez_notaire",
        "chez_proprietaire",
        "blocked",
    ]


def test_disabled_status_with_lots_is_kept() -> None:
    m = build_lots_matrix((), [("Villa", "option", 2), ("Villa", "available", 1)])
    assert m.statuses.index("option") == 2  # place du pipeline
    assert m.totals["option"] == 2
    assert m.grand_total == 3


def test_rows_sorted_case_insensitive_with_missing_type_last() -> None:
    m = build_lots_matrix(
        DEFAULT,
        [
            (None, "available", 1),
            ("villa", "available", 1),
            ("Appartement", "blocked", 2),
            ("Villa", "option", 1),
        ],
    )
    assert [r.type_lot for r in m.rows] == ["Appartement", "Villa", "villa", None]
    assert m.rows[0].counts["blocked"] == 2
    assert m.rows[0].total == 2
    assert set(m.rows[0].counts) == set(m.statuses)
