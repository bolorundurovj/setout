from __future__ import annotations

from types import SimpleNamespace
from typing import Any, cast

import pytest

from setout.models.budget import BudgetItem
from setout.models.scope import Scope
from setout.utils.scopes import own_totals, rolled_up_totals

pytestmark = pytest.mark.unit


def _scope(scope_id: str, parent_id: str | None = None) -> Scope:
    return cast(Scope, SimpleNamespace(id=scope_id, parent_id=parent_id))


def _item(scope_id: str, amount: int) -> BudgetItem:
    return cast(BudgetItem, SimpleNamespace(scope_id=scope_id, planned_amount=amount))


def test_own_totals_add_up_per_scope() -> None:
    totals = own_totals([_item("1", 250_00), _item("1", 100_00), _item("2", 50_00)])
    assert totals["1"] == 350_00
    assert totals["2"] == 50_00


def test_a_total_rolls_up_to_its_parents() -> None:
    scopes = [_scope("1"), _scope("2", parent_id="1"), _scope("3", parent_id="2")]
    rolled = rolled_up_totals(scopes, {"3": 1000})
    assert rolled["3"] == 1000
    assert rolled["2"] == 1000
    assert rolled["1"] == 1000


def test_siblings_sum_into_the_group() -> None:
    scopes = [_scope("1"), _scope("2", parent_id="1"), _scope("3", parent_id="1")]
    rolled = rolled_up_totals(scopes, {"2": 400, "3": 600})
    assert rolled["1"] == 1000


def test_a_scope_with_no_budget_totals_zero() -> None:
    assert rolled_up_totals([_scope("1")], {})["1"] == 0


def test_a_parent_cycle_does_not_hang() -> None:
    scopes = [_scope("1", parent_id="2"), _scope("2", parent_id="1")]
    rolled = cast(dict[str, Any], rolled_up_totals(scopes, {"1": 100}))
    assert rolled["1"] >= 100
