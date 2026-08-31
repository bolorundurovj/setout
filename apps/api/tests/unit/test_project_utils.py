from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast

import pytest
from fastapi import HTTPException

from setout.models.project import Project, ProjectStatus
from setout.utils.projects import require_archived, to_read

pytestmark = pytest.mark.unit


def _project(status: ProjectStatus, deleted_at: datetime | None = None) -> Project:
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
            deleted_at=deleted_at,
        ),
    )


@pytest.mark.parametrize(
    "status",
    [ProjectStatus.ACTIVE, ProjectStatus.ON_HOLD, ProjectStatus.COMPLETED],
)
def test_require_archived_rejects_anything_not_archived(status: ProjectStatus) -> None:
    with pytest.raises(HTTPException) as raised:
        require_archived(_project(status))
    assert raised.value.status_code == 409


def test_require_archived_allows_an_archived_project() -> None:
    require_archived(_project(ProjectStatus.ARCHIVED))


def test_to_read_carries_the_currency_and_its_exponent() -> None:
    read = to_read(_project(ProjectStatus.ACTIVE))
    assert read.currency_code == "NGN"
    assert read.currency_exponent == 2
    assert read.name == "Jacaranda Close, Ewuru"
    assert read.deleted_at is None


def test_to_read_reports_a_deleted_project() -> None:
    deleted_at = datetime(2026, 2, 1, tzinfo=UTC)
    read = to_read(_project(ProjectStatus.ARCHIVED, deleted_at=deleted_at))
    assert read.deleted_at == deleted_at
    assert read.status == ProjectStatus.ARCHIVED
