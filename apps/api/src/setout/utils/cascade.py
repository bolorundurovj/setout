"""Carry a soft delete down to the rows the deleted thing owns.

Nothing here hard deletes. Each function stamps the same timestamp the owner
was stamped with, and the matching restore clears only the rows carrying that
exact timestamp. Anything deleted on its own beforehand holds a different one,
so it stays deleted when the owner comes back.
"""

from __future__ import annotations

from datetime import datetime

from tortoise.models import Model

from setout.models.advance import Advance
from setout.models.agreement import Agreement
from setout.models.attachment import Attachment
from setout.models.budget import BudgetItem
from setout.models.delivery import Delivery
from setout.models.expense import Expense
from setout.models.land_document import LandDocument
from setout.models.scope import Scope

PROJECT_OWNED = (Scope, Expense, Delivery, Attachment, Advance, Agreement)
EXPENSE_OWNED = (Delivery, Attachment)
LAND_OWNED = (LandDocument,)


async def delete_under_project(project_id: str, deleted_at: datetime) -> None:
    scope_ids = await _scope_ids_of_project(project_id)
    await _mark_deleted(BudgetItem, deleted_at, scope_id__in=scope_ids)
    for owned_model in PROJECT_OWNED:
        await _mark_deleted(owned_model, deleted_at, project_id=project_id)


async def restore_under_project(project_id: str, deleted_at: datetime) -> None:
    scope_ids = await _scope_ids_of_project(project_id)
    await _clear_deleted(BudgetItem, deleted_at, scope_id__in=scope_ids)
    for owned_model in PROJECT_OWNED:
        await _clear_deleted(owned_model, deleted_at, project_id=project_id)


async def delete_under_expense(expense_id: str, deleted_at: datetime) -> None:
    for owned_model in EXPENSE_OWNED:
        await _mark_deleted(owned_model, deleted_at, expense_id=expense_id)


async def restore_under_expense(expense_id: str, deleted_at: datetime) -> None:
    for owned_model in EXPENSE_OWNED:
        await _clear_deleted(owned_model, deleted_at, expense_id=expense_id)


async def delete_under_land(land_id: str, deleted_at: datetime) -> None:
    for owned_model in LAND_OWNED:
        await _mark_deleted(owned_model, deleted_at, land_id=land_id)


async def restore_under_land(land_id: str, deleted_at: datetime) -> None:
    for owned_model in LAND_OWNED:
        await _clear_deleted(owned_model, deleted_at, land_id=land_id)


async def delete_under_scope(scope_id: str, deleted_at: datetime) -> None:
    await _mark_deleted(BudgetItem, deleted_at, scope_id=scope_id)


async def restore_under_scope(scope_id: str, deleted_at: datetime) -> None:
    await _clear_deleted(BudgetItem, deleted_at, scope_id=scope_id)


async def _mark_deleted(
    owned_model: type[Model], deleted_at: datetime, **owner_filters: object
) -> None:
    await owned_model.filter(deleted_at__isnull=True, **owner_filters).update(deleted_at=deleted_at)


async def _clear_deleted(
    owned_model: type[Model], deleted_at: datetime, **owner_filters: object
) -> None:
    await owned_model.filter(deleted_at=deleted_at, **owner_filters).update(deleted_at=None)


async def _scope_ids_of_project(project_id: str) -> list[str]:
    """Every scope of the project, deleted or not, so their items follow either way."""
    scope_ids = await Scope.filter(project_id=project_id).values_list("id", flat=True)
    return [str(scope_id) for scope_id in scope_ids]
