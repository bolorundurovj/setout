from __future__ import annotations

import pytest

from setout.utils.scope_presets import SCOPE_PRESETS

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


def test_the_scopes_named_in_the_brief_are_present() -> None:
    assert set(FROM_THE_BRIEF) <= set(SCOPE_PRESETS)


def test_names_are_unique() -> None:
    assert len(SCOPE_PRESETS) == len(set(SCOPE_PRESETS))


def test_names_are_not_blank() -> None:
    assert all(name.strip() for name in SCOPE_PRESETS)


def test_administrative_comes_before_finalization() -> None:
    assert SCOPE_PRESETS.index("Administrative expenses") < SCOPE_PRESETS.index(
        "Finalization and inspections"
    )
