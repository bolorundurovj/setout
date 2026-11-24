from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, cast

import pytest

from setout.models.category import Category
from setout.utils.categories import rolled_up_totals, to_reads

pytestmark = pytest.mark.unit


def _category(category_id: str, parent_id: str | None = None) -> Category:
    return cast(Category, SimpleNamespace(id=category_id, parent_id=parent_id))


def test_a_total_rolls_up_to_its_parents() -> None:
    categories = [_category("1"), _category("2", parent_id="1"), _category("3", parent_id="2")]
    rolled = rolled_up_totals(categories, {"3": 1000})
    assert rolled["3"] == 1000
    assert rolled["2"] == 1000
    assert rolled["1"] == 1000


def test_siblings_sum_into_the_group() -> None:
    categories = [_category("1"), _category("2", parent_id="1"), _category("3", parent_id="1")]
    rolled = rolled_up_totals(categories, {"2": 400, "3": 600})
    assert rolled["1"] == 1000


def test_a_category_with_no_budget_totals_zero() -> None:
    assert rolled_up_totals([_category("1")], {})["1"] == 0


def test_a_parent_cycle_does_not_hang() -> None:
    categories = [_category("1", parent_id="2"), _category("2", parent_id="1")]
    rolled = cast(dict[str, Any], rolled_up_totals(categories, {"1": 100}))
    assert rolled["1"] >= 100


def test_to_reads_builds_reads_from_grouped_totals() -> None:
    stamp = datetime(2026, 1, 1, tzinfo=UTC)

    def row(category_id: str, parent_id: str | None, sort_order: int) -> Category:
        return cast(
            Category,
            SimpleNamespace(
                id=category_id,
                parent_id=parent_id,
                project_id="p1",
                code=None,
                name=f"Category {category_id}",
                sort_order=sort_order,
                created_at=stamp,
                updated_at=stamp,
                archived_at=None,
            ),
        )

    reads = to_reads(
        [row("1", None, 0), row("2", "1", 1)],
        {"2": 250_00},
        {"2": 150_00},
        {"2": 2},
    )
    by_id = {read.id: read for read in reads}

    assert by_id["1"].is_group is True
    assert by_id["1"].budgeted_amount == 250_00
    assert by_id["1"].own_budgeted_amount == 0
    assert by_id["1"].spent_amount == 150_00
    assert by_id["1"].expense_count == 2
    assert by_id["2"].own_budgeted_amount == 250_00
    assert by_id["2"].own_spent_amount == 150_00
    assert by_id["2"].own_expense_count == 2
    assert by_id["2"].is_group is False
