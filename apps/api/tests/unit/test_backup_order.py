import pytest

from setout.utils.backup import parents_first

pytestmark = pytest.mark.unit


def _ids(rows: list[dict]) -> list[str]:
    return [row["id"] for row in rows]


def test_a_parent_moves_ahead_of_its_children() -> None:
    rows = [
        {"id": "c", "parent_id": "b"},
        {"id": "b", "parent_id": "a"},
        {"id": "a", "parent_id": None},
    ]

    assert _ids(parents_first(rows, "parent_id")) == ["a", "b", "c"]


def test_rows_already_in_order_keep_their_order() -> None:
    rows = [
        {"id": "a", "parent_id": None},
        {"id": "b", "parent_id": None},
        {"id": "c", "parent_id": "a"},
    ]

    assert _ids(parents_first(rows, "parent_id")) == ["a", "b", "c"]


def test_a_parent_missing_from_the_rows_is_ignored() -> None:
    rows = [{"id": "a", "parent_id": "gone"}]

    assert _ids(parents_first(rows, "parent_id")) == ["a"]


def test_a_cycle_neither_loops_nor_drops_rows() -> None:
    rows = [
        {"id": "a", "parent_id": "b"},
        {"id": "b", "parent_id": "a"},
        {"id": "c", "parent_id": None},
    ]

    assert sorted(_ids(parents_first(rows, "parent_id"))) == ["a", "b", "c"]
