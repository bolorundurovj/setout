from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

import pytest

from setout.models.change import ChangeAction
from setout.models.expense import CostType
from setout.services.changes import action_for, differences, to_json

pytestmark = pytest.mark.unit

ARCHIVED = datetime(2026, 10, 25, 9, 30, tzinfo=UTC)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (Decimal("10.000"), "10"),
        (Decimal("2.500"), "2.5"),
        (date(2026, 8, 14), "2026-08-14"),
        (ARCHIVED, "2026-10-25T09:30:00"),
        (datetime(2026, 10, 25, 9, 30), "2026-10-25T09:30:00"),
        (CostType.MATERIAL, "material"),
        (76_500_00, 76_500_00),
        (None, None),
    ],
)
def test_to_json_gives_values_that_compare_equal_across_database_round_trips(
    value: object, expected: object
) -> None:
    assert to_json(value) == expected


def test_differences_leave_out_timestamps_and_unchanged_fields() -> None:
    before = {"amount": 100, "notes": "n", "updated_at": ARCHIVED, "set_at": ARCHIVED}
    after = {"amount": 150, "notes": "n", "updated_at": None, "set_at": None}

    assert differences(before, after) == {"amount": [100, 150]}


def test_differences_treat_equal_quantities_with_different_scale_as_unchanged() -> None:
    assert differences({"quantity": Decimal("10.000")}, {"quantity": Decimal("10")}) == {}


@pytest.mark.parametrize(
    ("before", "changed", "expected"),
    [
        (None, {"amount": [None, 100]}, ChangeAction.CREATE),
        ({}, {"archived_at": [None, "2026-10-25T09:30:00"]}, ChangeAction.ARCHIVE),
        ({}, {"archived_at": ["2026-10-25T09:30:00", None]}, ChangeAction.RESTORE),
        ({}, {"amount": [100, 150]}, ChangeAction.UPDATE),
    ],
)
def test_action_for_reads_archive_and_restore_from_archived_at(
    before: dict[str, object] | None, changed: dict[str, list[object]], expected: ChangeAction
) -> None:
    assert action_for(before, changed) is expected
