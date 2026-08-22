from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from typing import cast

import pytest

from setout.models.expense import Expense
from setout.models.scope import Scope
from setout.utils.months import month_key, month_range, to_months, top_of_branch

pytestmark = pytest.mark.unit


def _scope(scope_id: str, name: str, parent_id: str | None = None, sort_order: int = 0) -> Scope:
    return cast(
        Scope,
        SimpleNamespace(id=scope_id, name=name, parent_id=parent_id, sort_order=sort_order),
    )


def _spend(day: str, amount: int, scope_id: str | None = None) -> Expense:
    return cast(
        Expense,
        SimpleNamespace(spent_on=date.fromisoformat(day), amount=amount, scope_id=scope_id),
    )


def test_month_key_pads_single_digit_months() -> None:
    assert month_key(date(2026, 3, 9)) == "2026-03"


def test_month_range_stops_before_the_next_month() -> None:
    assert month_range("2026-06") == (date(2026, 6, 1), date(2026, 7, 1))


def test_december_rolls_into_the_next_year() -> None:
    assert month_range("2026-12") == (date(2026, 12, 1), date(2027, 1, 1))


def test_a_leaf_reports_the_top_of_its_branch() -> None:
    scopes = [_scope("1", "Structure"), _scope("2", "Blockwork", parent_id="1")]
    assert top_of_branch(scopes)["2"].id == "1"


def test_a_parent_cycle_does_not_hang() -> None:
    scopes = [_scope("1", "One", parent_id="2"), _scope("2", "Two", parent_id="1")]
    assert top_of_branch(scopes)["1"].id in {"1", "2"}


def test_months_come_back_oldest_first() -> None:
    months = to_months([_spend("2026-07-02", 100), _spend("2026-06-11", 200)], [])
    assert [month.month for month in months] == ["2026-06", "2026-07"]


def test_a_month_with_nothing_spent_is_left_out() -> None:
    months = to_months([_spend("2026-05-01", 100), _spend("2026-07-01", 100)], [])
    assert [month.month for month in months] == ["2026-05", "2026-07"]


def test_a_month_counts_and_totals_what_is_in_it() -> None:
    months = to_months([_spend("2026-06-01", 300), _spend("2026-06-20", 700)], [])
    assert months[0].amount == 1000
    assert months[0].expense_count == 2


def test_spend_below_a_group_lands_on_the_group() -> None:
    scopes = [_scope("1", "Structure"), _scope("2", "Blockwork", parent_id="1")]
    months = to_months([_spend("2026-06-01", 500, scope_id="2")], scopes)
    assert [(part.scope_id, part.name, part.amount) for part in months[0].scopes] == [
        ("1", "Structure", 500)
    ]


def test_segments_keep_budget_order_with_unfiled_last() -> None:
    scopes = [_scope("1", "Late", sort_order=9), _scope("2", "Early", sort_order=1)]
    months = to_months(
        [
            _spend("2026-06-01", 100),
            _spend("2026-06-02", 200, scope_id="1"),
            _spend("2026-06-03", 300, scope_id="2"),
        ],
        scopes,
    )
    assert [part.name for part in months[0].scopes] == ["Early", "Late", "Not filed to a scope"]


def test_nothing_spent_means_no_months() -> None:
    assert to_months([], [_scope("1", "Structure")]) == []
