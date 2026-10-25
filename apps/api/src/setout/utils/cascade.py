"""Cascade an archive to owned rows, using the owner's archived_at timestamp.

Restore clears only rows with that exact timestamp, so rows archived separately
beforehand stay archived.
"""

from __future__ import annotations

from datetime import datetime

from tortoise.models import Model

from setout.models.advance import Advance
from setout.models.agreement import Agreement
from setout.models.attachment import Attachment
from setout.models.budget import BudgetItem
from setout.models.category import Category
from setout.models.delivery import Delivery
from setout.models.expense import Expense
from setout.models.land_document import LandDocument
from setout.models.land_valuation import LandValuation

PROJECT_OWNED = (Category, Expense, Delivery, Attachment, Advance, Agreement)
EXPENSE_OWNED = (Delivery, Attachment)
AGREEMENT_OWNED = (Attachment,)
DELIVERY_OWNED = (Attachment,)
LAND_OWNED = (LandDocument, LandValuation)


async def archive_under_project(project_id: str, archived_at: datetime) -> None:
    category_ids = await _category_ids_of_project(project_id)
    await _mark_archived(BudgetItem, archived_at, category_id__in=category_ids)
    for owned_model in PROJECT_OWNED:
        await _mark_archived(owned_model, archived_at, project_id=project_id)


async def restore_under_project(project_id: str, archived_at: datetime) -> None:
    category_ids = await _category_ids_of_project(project_id)
    await _clear_archived(BudgetItem, archived_at, category_id__in=category_ids)
    for owned_model in PROJECT_OWNED:
        await _clear_archived(owned_model, archived_at, project_id=project_id)


async def archive_under_expense(expense_id: str, archived_at: datetime) -> None:
    for owned_model in EXPENSE_OWNED:
        await _mark_archived(owned_model, archived_at, expense_id=expense_id)
    for delivery_id in await _delivery_ids_of_expense(expense_id):
        await archive_under_delivery(delivery_id, archived_at)


async def restore_under_expense(expense_id: str, archived_at: datetime) -> None:
    for owned_model in EXPENSE_OWNED:
        await _clear_archived(owned_model, archived_at, expense_id=expense_id)
    for delivery_id in await _delivery_ids_of_expense(expense_id):
        await restore_under_delivery(delivery_id, archived_at)


async def archive_under_agreement(agreement_id: str, archived_at: datetime) -> None:
    for owned_model in AGREEMENT_OWNED:
        await _mark_archived(owned_model, archived_at, agreement_id=agreement_id)


async def restore_under_agreement(agreement_id: str, archived_at: datetime) -> None:
    for owned_model in AGREEMENT_OWNED:
        await _clear_archived(owned_model, archived_at, agreement_id=agreement_id)


async def archive_under_delivery(delivery_id: str, archived_at: datetime) -> None:
    for owned_model in DELIVERY_OWNED:
        await _mark_archived(owned_model, archived_at, delivery_id=delivery_id)


async def restore_under_delivery(delivery_id: str, archived_at: datetime) -> None:
    for owned_model in DELIVERY_OWNED:
        await _clear_archived(owned_model, archived_at, delivery_id=delivery_id)


async def archive_under_land(land_id: str, archived_at: datetime) -> None:
    for owned_model in LAND_OWNED:
        await _mark_archived(owned_model, archived_at, land_id=land_id)


async def restore_under_land(land_id: str, archived_at: datetime) -> None:
    for owned_model in LAND_OWNED:
        await _clear_archived(owned_model, archived_at, land_id=land_id)


async def archive_under_category(category_id: str, archived_at: datetime) -> None:
    await _mark_archived(BudgetItem, archived_at, category_id=category_id)


async def restore_under_category(category_id: str, archived_at: datetime) -> None:
    await _clear_archived(BudgetItem, archived_at, category_id=category_id)


async def _mark_archived(
    owned_model: type[Model], archived_at: datetime, **owner_filters: object
) -> None:
    await owned_model.filter(archived_at__isnull=True, **owner_filters).update(
        archived_at=archived_at
    )


async def _clear_archived(
    owned_model: type[Model], archived_at: datetime, **owner_filters: object
) -> None:
    await owned_model.filter(archived_at=archived_at, **owner_filters).update(archived_at=None)


async def _delivery_ids_of_expense(expense_id: str) -> list[str]:
    delivery_ids = await Delivery.filter(expense_id=expense_id).values_list("id", flat=True)
    return [str(delivery_id) for delivery_id in delivery_ids]


async def _category_ids_of_project(project_id: str) -> list[str]:
    """All of the project's categories, archived or not, so their budget items are included."""
    category_ids = await Category.filter(project_id=project_id).values_list("id", flat=True)
    return [str(category_id) for category_id in category_ids]
