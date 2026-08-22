from __future__ import annotations

import pytest

from setout.utils.currencies import INSERT as CURRENCY_INSERT
from setout.utils.placeholders import bind
from setout.utils.scope_presets import INSERT as PRESET_INSERT

pytestmark = pytest.mark.unit


def test_sqlite_keeps_the_question_marks() -> None:
    assert bind("INSERT INTO t (a, b) VALUES (?, ?)", "sqlite") == (
        "INSERT INTO t (a, b) VALUES (?, ?)"
    )


def test_postgres_numbers_each_placeholder() -> None:
    assert bind("INSERT INTO t (a, b, c) VALUES (?, ?, ?)", "postgres") == (
        "INSERT INTO t (a, b, c) VALUES ($1, $2, $3)"
    )


def test_the_seeding_statements_come_out_numbered() -> None:
    # asyncpg rejects %s outright, which is how Postgres startup used to fail.
    for statement in (CURRENCY_INSERT, PRESET_INSERT):
        bound = bind(statement, "postgres")
        assert "?" not in bound
        assert "%s" not in bound
        assert "$1" in bound and "$3" in bound


def test_a_statement_with_nothing_to_bind_is_left_alone() -> None:
    assert bind("SELECT code FROM currency", "postgres") == "SELECT code FROM currency"
