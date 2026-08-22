"""Unit tests for the migration helpers."""

from __future__ import annotations

import pytest

from setout import migrate_tools

pytestmark = pytest.mark.unit


def test_migration_names_are_sorted_and_include_initial() -> None:
    names = migrate_tools.migration_names()
    assert "0001_initial" in names
    assert names == sorted(names)


def test_downgrade_one_with_no_migrations_is_a_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(migrate_tools, "migration_names", list)
    assert migrate_tools.downgrade_one() == 0


class _FakeResult:
    def __init__(self, returncode: int) -> None:
        self.returncode = returncode


def test_downgrade_one_single_migration_has_no_target(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(migrate_tools, "migration_names", lambda: ["0001_initial"])
    captured: dict[str, list[str]] = {}

    def fake_run(cmd: list[str], check: bool) -> _FakeResult:
        captured["cmd"] = cmd
        return _FakeResult(0)

    monkeypatch.setattr(migrate_tools.subprocess, "run", fake_run)
    assert migrate_tools.downgrade_one() == 0
    # With one migration, roll it back fully: no target beyond the app label.
    assert captured["cmd"][-1] == migrate_tools.APP_LABEL


def test_downgrade_one_targets_second_to_last(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(migrate_tools, "migration_names", lambda: ["0001_initial", "0002_next"])
    captured: dict[str, list[str]] = {}

    def fake_run(cmd: list[str], check: bool) -> _FakeResult:
        captured["cmd"] = cmd
        return _FakeResult(3)

    monkeypatch.setattr(migrate_tools.subprocess, "run", fake_run)
    assert migrate_tools.downgrade_one() == 3
    assert captured["cmd"][-1] == "0001_initial"
