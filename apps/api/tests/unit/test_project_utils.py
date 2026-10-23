from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast

import pytest
from fastapi import HTTPException

from setout.models.project import Project, ProjectStatus
from setout.utils.projects import require_closed, to_read

pytestmark = pytest.mark.unit


def _project(status: ProjectStatus, archived_at: datetime | None = None) -> Project:
    # A stub, not a real model: instantiating one needs an initialised ORM,
    # which would make this an integration test.
    return cast(
        Project,
        SimpleNamespace(
            id="p1",
            name="Jacaranda Close, Ewuru",
            currency_id="NGN",
            currency=SimpleNamespace(code="NGN", name="Nigerian Naira", exponent=2),
            status=status,
            land_id=None,
            land=None,
            notes=None,
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
            updated_at=datetime(2026, 1, 2, tzinfo=UTC),
            archived_at=archived_at,
        ),
    )


@pytest.mark.parametrize(
    "status",
    [ProjectStatus.ACTIVE, ProjectStatus.ON_HOLD, ProjectStatus.COMPLETED],
)
def test_require_closed_rejects_anything_not_closed(status: ProjectStatus) -> None:
    with pytest.raises(HTTPException) as raised:
        require_closed(_project(status))
    assert raised.value.status_code == 409


def test_require_closed_allows_a_closed_project() -> None:
    require_closed(_project(ProjectStatus.CLOSED))


def test_to_read_carries_the_currency_and_its_exponent() -> None:
    read = to_read(_project(ProjectStatus.ACTIVE))
    assert read.currency_code == "NGN"
    assert read.currency_exponent == 2
    assert read.name == "Jacaranda Close, Ewuru"
    assert read.archived_at is None


def test_to_read_reports_an_archived_project() -> None:
    archived_at = datetime(2026, 2, 1, tzinfo=UTC)
    read = to_read(_project(ProjectStatus.CLOSED, archived_at=archived_at))
    assert read.archived_at == archived_at
    assert read.status == ProjectStatus.CLOSED
