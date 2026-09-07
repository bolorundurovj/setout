from __future__ import annotations

from types import SimpleNamespace
from typing import Any, cast

import pytest

from setout.models.budget import BudgetItem
from setout.models.category import Category
from setout.utils.categories import own_totals, rolled_up_totals

pytestmark = pytest.mark.unit


def _category(category_id: str, parent_id: str | None = None) -> Category:
    return cast(Category, SimpleNamespace(id=category_id, parent_id=parent_id))


def _item(category_id: str, amount: int) -> BudgetItem:
    return cast(BudgetItem, SimpleNamespace(category_id=category_id, budgeted_amount=amount))


def test_own_totals_add_up_per_category() -> None:
    totals = own_totals([_item("1", 250_00), _item("1", 100_00), _item("2", 50_00)])
    assert totals["1"] == 350_00
    assert totals["2"] == 50_00


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
