"""Static guard: lot statuses change only through ``LotRepository.change_status``.

``change_status`` writes ``lot_status_history`` in the same transaction; any
other write of ``lots.status`` would skip the history. The guard parses the
services and repositories and flags:

- ``lot_repo.update(..., status=...)``;
- ``update(LotModel)...values(status=...)``;
- either of them with ``**mapping`` when the same function puts a
  ``"status"`` key in that mapping (``mapping["status"] = ...`` or a dict
  literal with a ``"status"`` key).

Only ``LotRepository.change_status`` itself may write the status.
"""

import ast
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[2]
SCANNED_DIRS = (
    APP_DIR / "services",
    APP_DIR / "infrastructure" / "database" / "repositories",
)
ALLOWED_FUNCTION = ("lot_repository.py", "change_status")


def _is_lot_repo_update(call: ast.Call) -> bool:
    func = call.func
    if not (isinstance(func, ast.Attribute) and func.attr == "update"):
        return False
    target = func.value
    name = (
        target.attr if isinstance(target, ast.Attribute) else getattr(target, "id", "")
    )
    return name == "lot_repo"


def _is_lot_model_values(call: ast.Call) -> bool:
    """``<...>.values(...)`` on a chain starting with ``update(LotModel)``."""
    func = call.func
    if not (isinstance(func, ast.Attribute) and func.attr == "values"):
        return False
    node: ast.AST = func.value
    while isinstance(node, ast.Call | ast.Attribute):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "update"
            and node.args
            and isinstance(node.args[0], ast.Name)
            and node.args[0].id == "LotModel"
        ):
            return True
        node = node.func if isinstance(node, ast.Call) else node.value
    return False


def _mappings_with_status_key(function: ast.AST) -> set[str]:
    """Names that receive a ``"status"`` key inside ``function``."""
    names: set[str] = set()
    for node in ast.walk(function):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if (
                    isinstance(target, ast.Subscript)
                    and isinstance(target.value, ast.Name)
                    and isinstance(target.slice, ast.Constant)
                    and target.slice.value == "status"
                ):
                    names.add(target.value.id)
        if isinstance(node, ast.Assign | ast.AnnAssign) and isinstance(
            node.value, ast.Dict
        ):
            keys = [k.value for k in node.value.keys if isinstance(k, ast.Constant)]
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            if "status" in keys:
                names.update(t.id for t in targets if isinstance(t, ast.Name))
    return names


def _writes_status(call: ast.Call, status_mappings: set[str]) -> bool:
    for keyword in call.keywords:
        if keyword.arg == "status":
            return True
        if (
            keyword.arg is None
            and isinstance(keyword.value, ast.Name)
            and keyword.value.id in status_mappings
        ):
            return True
    return False


def find_direct_status_writes(source: str, filename: str = "<test>") -> list[int]:
    """Line numbers of lot status writes that bypass ``change_status``."""
    offending: list[int] = []
    tree = ast.parse(source)
    functions = [
        n
        for n in ast.walk(tree)
        if isinstance(n, ast.FunctionDef | ast.AsyncFunctionDef)
    ]
    for function in functions:
        if (filename, function.name) == ALLOWED_FUNCTION:
            continue
        status_mappings = _mappings_with_status_key(function)
        for node in ast.walk(function):
            if (
                isinstance(node, ast.Call)
                and (_is_lot_repo_update(node) or _is_lot_model_values(node))
                and _writes_status(node, status_mappings)
            ):
                offending.append(node.lineno)
    return sorted(set(offending))


class TestScanner:
    def test_detects_status_written_through_lot_repo_update(self) -> None:
        source = (
            "async def f(self):\n"
            "    await self.lot_repo.update(\n"
            "        lot_id,\n"
            "        status='option',\n"
            "    )\n"
        )
        assert find_direct_status_writes(source) == [2]

    def test_detects_raw_update_of_lot_status(self) -> None:
        source = (
            "async def f(self):\n"
            "    await self.session.execute(\n"
            "        update(LotModel).where(LotModel.id == 1).values(status='x')\n"
            "    )\n"
        )
        assert find_direct_status_writes(source) == [3]

    def test_detects_status_key_in_unpacked_mapping(self) -> None:
        source = (
            "async def f(self):\n"
            "    new_values = {'price': 1}\n"
            "    new_values['status'] = 'available'\n"
            "    await self.session.execute(\n"
            "        update(LotModel).where(LotModel.id == 1).values(**new_values)\n"
            "    )\n"
            "async def g(self):\n"
            "    data = {'status': 'x'}\n"
            "    await self.lot_repo.update(1, **data)\n"
        )
        assert find_direct_status_writes(source) == [5, 9]

    def test_ignores_other_columns_and_other_models(self) -> None:
        source = (
            "async def f(self):\n"
            "    await self.lot_repo.update(lot_id, blocked_reason='')\n"
            "    # await self.lot_repo.update(lot_id, status='x')\n"
            "    await self.reservation_repo.update(rid, status='released')\n"
            "    await self.session.execute(\n"
            "        update(LotModel).where(LotModel.id == 1).values(price=1)\n"
            "    )\n"
            "    await self.session.execute(\n"
            "        update(ReservationModel).values(status='released')\n"
            "    )\n"
        )
        assert find_direct_status_writes(source) == []

    def test_change_status_itself_is_allowed(self) -> None:
        source = (
            "async def change_status(self):\n"
            "    values = {'status': new_status}\n"
            "    await self.session.execute(\n"
            "        update(LotModel).where(LotModel.id == 1).values(**values)\n"
            "    )\n"
        )
        assert find_direct_status_writes(source, "lot_repository.py") == []
        assert find_direct_status_writes(source, "other.py") == [4]


def test_lot_status_is_written_only_by_change_status() -> None:
    offending = [
        f"{path.relative_to(APP_DIR)}:{line}"
        for directory in SCANNED_DIRS
        for path in sorted(directory.glob("*.py"))
        for line in find_direct_status_writes(
            path.read_text(encoding="utf-8"), path.name
        )
    ]
    assert offending == [], (
        "Lot status written outside LotRepository.change_status: "
        + ", ".join(offending)
    )
