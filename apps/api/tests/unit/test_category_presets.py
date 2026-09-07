from __future__ import annotations

import pytest

from setout.utils.category_presets import CATEGORY_PRESETS

pytestmark = pytest.mark.unit

# Named in the brief, so they must survive any edit to the list.
FROM_THE_BRIEF = [
    "Administrative expenses",
    "Equipment rentals",
    "Concrete foundation",
    "Structure and exterior",
    "Interior work",
    "Finalization and inspections",
]


def test_the_categories_named_in_the_brief_are_present() -> None:
    assert set(FROM_THE_BRIEF) <= set(CATEGORY_PRESETS)


def test_names_are_unique() -> None:
    assert len(CATEGORY_PRESETS) == len(set(CATEGORY_PRESETS))


def test_names_are_not_blank() -> None:
    assert all(name.strip() for name in CATEGORY_PRESETS)


def test_administrative_comes_before_finalization() -> None:
    assert CATEGORY_PRESETS.index("Administrative expenses") < CATEGORY_PRESETS.index(
        "Finalization and inspections"
    )
