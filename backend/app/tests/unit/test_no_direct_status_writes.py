"""Static guard: services change a lot status only through ``change_status``.

``LotRepository.change_status`` writes ``lot_status_history`` in the same
transaction; a service writing ``status=`` through ``lot_repo.update(...)`` or
calling ``lot_repo.release_lot(...)`` would skip the history.

A call may be exempted by putting ``ALLOW_MARKER`` in a comment inside it,
together with the reason (legacy paths documented in ``docs/AVANCEMENT.md``).
"""

import re
from pathlib import Path

SERVICES_DIR = Path(__file__).resolve().parents[2] / "services"

ALLOW_MARKER = "status-guard: legacy"

_CALL = re.compile(r"lot_repo\.(update|release_lot)\(")


def _call_text(source: str, open_paren: int) -> str:
    """Return the source from ``open_paren`` to its matching ``)``."""
    depth = 0
    for i in range(open_paren, len(source)):
        if source[i] == "(":
            depth += 1
        elif source[i] == ")":
            depth -= 1
            if depth == 0:
                return source[open_paren : i + 1]
    return source[open_paren:]


def _strip_comments(text: str) -> str:
    return "\n".join(line.split("#", 1)[0] for line in text.splitlines())


def find_direct_status_writes(source: str) -> list[int]:
    """Line numbers of lot status writes that bypass ``change_status``."""
    offending = []
    for match in _CALL.finditer(source):
        line_start = source.rfind("\n", 0, match.start()) + 1
        if source[line_start : match.start()].lstrip().startswith("#"):
            continue
        call = _call_text(source, match.end() - 1)
        line_end = source.find("\n", match.end())
        opening_line = source[line_start : line_end if line_end != -1 else None]
        if ALLOW_MARKER in call or ALLOW_MARKER in opening_line:
            continue
        code = _strip_comments(call)
        if match.group(1) == "release_lot" or re.search(r"\bstatus\s*=", code):
            offending.append(source.count("\n", 0, match.start()) + 1)
    return offending


class TestScanner:
    def test_detects_status_written_through_update(self) -> None:
        source = "await self.lot_repo.update(\n    lot_id,\n    status='option',\n)\n"
        assert find_direct_status_writes(source) == [1]

    def test_detects_release_lot(self) -> None:
        assert find_direct_status_writes("await lot_repo.release_lot(1, 'x')\n") == [1]

    def test_ignores_other_fields_comments_and_other_repos(self) -> None:
        source = (
            "await self.lot_repo.update(lot_id, blocked_reason='')\n"
            "# await self.lot_repo.update(lot_id, status='x')\n"
            "await self.lot_repo.update(lot_id, price=1)  # status='x'\n"
            "await self.reservation_repo.update(rid, status='released')\n"
        )
        assert find_direct_status_writes(source) == []

    def test_marker_exempts_a_call(self) -> None:
        source = (
            "await self.lot_repo.update(  # status-guard: legacy (reason)\n"
            "    lot_id, status='sold'\n"
            ")\n"
        )
        assert find_direct_status_writes(source) == []


def test_services_do_not_write_lot_status_directly() -> None:
    offending = [
        f"{path.name}:{line}"
        for path in sorted(SERVICES_DIR.glob("*.py"))
        for line in find_direct_status_writes(path.read_text(encoding="utf-8"))
    ]
    assert offending == [], (
        "Lot status written outside LotRepository.change_status: "
        + ", ".join(offending)
    )
