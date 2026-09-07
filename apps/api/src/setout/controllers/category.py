from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException, status

from setout.models.budget import BudgetItem
from setout.models.category import Category
from setout.models.category_preset import CategoryPreset
from setout.models.expense import Expense
from setout.models.project import Project
from setout.schemas.category import (
    BudgetItemCreate,
    BudgetItemPage,
    BudgetItemRead,
    BudgetItemUpdate,
    CategoryCreate,
    CategoryPresetRead,
    CategoryRead,
    CategoryUpdate,
    ProjectBudget,
)
from setout.utils.cascade import delete_under_category, restore_under_category
from setout.utils.categories import to_reads

NOT_FOUND_CATEGORY = "Category not found"
NOT_FOUND_ITEM = "Budget item not found"


class CategoryController:
    async def list_presets(self) -> list[CategoryPresetRead]:
        return [CategoryPresetRead.model_validate(p) for p in await CategoryPreset.all()]

    async def list_categories(self, project_id: str) -> list[CategoryRead]:
        await self._project_or_404(project_id)
        categories = await Category.filter(project_id=project_id, deleted_at__isnull=True)
        items = await BudgetItem.filter(
            category__project_id=project_id,
            deleted_at__isnull=True,
        )
        expenses = await Expense.filter(project_id=project_id, deleted_at__isnull=True)
        return to_reads(categories, items, expenses)

    async def budget(self, project_id: str) -> ProjectBudget:
        project = await self._project_or_404(project_id)
        categories = await self.list_categories(project_id)
        return ProjectBudget(
            project_id=project.id,
            currency_code=project.currency_id,
            currency_exponent=project.currency.exponent,
            budgeted_amount=sum(category.own_budgeted_amount for category in categories),
            categories=categories,
        )

    async def create(self, project_id: str, req: CategoryCreate) -> CategoryRead:
        await self._project_or_404(project_id)
        if req.parent_id is not None:
            await self._category_or_404(req.parent_id, project_id=project_id)
        category = await Category.create(project_id=project_id, **req.model_dump())
        return self._one(await self.list_categories(project_id), category.id)

    async def update(self, category_id: str, req: CategoryUpdate) -> CategoryRead:
        category = await self._category_or_404(category_id)
        changes = req.model_dump(exclude_unset=True)
        parent_id = changes.get("parent_id")
        if parent_id is not None:
            if parent_id == category.id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A category cannot be its own parent",
                )
            await self._category_or_404(parent_id, project_id=category.project_id)
        if changes:
            category.update_from_dict(changes)
            await category.save()
        return self._one(await self.list_categories(category.project_id), category.id)

    async def delete(self, category_id: str) -> None:
        category = await self._category_or_404(category_id)
        await self._holds_no_spend(category)
        deleted_at = datetime.now(UTC)
        category.deleted_at = deleted_at
        await category.save()
        await delete_under_category(category.id, deleted_at)

    async def restore(self, category_id: str) -> CategoryRead:
        category = await self._category_or_404(category_id, include_deleted=True)
        if category.deleted_at is not None:
            deleted_at = category.deleted_at
            category.deleted_at = None
            await category.save()
            await restore_under_category(category.id, deleted_at)
        return self._one(await self.list_categories(category.project_id), category.id)

    async def list_items(self, category_id: str, *, limit: int, offset: int) -> BudgetItemPage:
        await self._category_or_404(category_id)
        query = BudgetItem.filter(category_id=category_id, deleted_at__isnull=True)
        total = await query.count()
        items = await query.offset(offset).limit(limit)
        return BudgetItemPage(
            items=[BudgetItemRead.model_validate(item) for item in items],
            total=total,
            limit=limit,
            offset=offset,
        )

    async def add_item(self, category_id: str, req: BudgetItemCreate) -> BudgetItemRead:
        category = await self._category_or_404(category_id)
        if await Category.filter(parent_id=category.id, deleted_at__isnull=True).exists():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A category with subcategories has no budget of its own",
            )
        item = await BudgetItem.create(
            category_id=category_id,
            set_at=datetime.now(UTC),
            **req.model_dump(),
        )
        return BudgetItemRead.model_validate(item)

    async def update_item(self, item_id: str, req: BudgetItemUpdate) -> BudgetItemRead:
        item = await self._item_or_404(item_id)
        changes = req.model_dump(exclude_unset=True)
        if "budgeted_amount" in changes and changes["budgeted_amount"] != item.budgeted_amount:
            changes["set_at"] = datetime.now(UTC)
        if changes:
            item.update_from_dict(changes)
            await item.save()
        return BudgetItemRead.model_validate(item)

    async def delete_item(self, item_id: str) -> None:
        item = await self._item_or_404(item_id)
        item.deleted_at = datetime.now(UTC)
        await item.save()

    async def _holds_no_spend(self, category: Category) -> None:
        # A deleted category would take its expenses out of every category total while
        # the project total still counted them, which reads as money gone missing.
        branch = [category.id, *await self._below(category)]
        if await Expense.filter(category_id__in=branch, deleted_at__isnull=True).exists():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A category with expenses cannot be deleted, only renamed",
            )

    async def _below(self, category: Category) -> list[str]:
        found: list[str] = []
        edge = [category.id]
        while edge:
            children = await Category.filter(parent_id__in=edge, deleted_at__isnull=True)
            edge = [child.id for child in children if child.id not in found]
            found.extend(edge)
        return found

    def _one(self, categories: list[CategoryRead], category_id: str) -> CategoryRead:
        for category in categories:
            if category.id == category_id:
                return category
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_CATEGORY)

    async def _project_or_404(self, project_id: str) -> Project:
        project = await Project.get_or_none(
            id=project_id, deleted_at__isnull=True
        ).prefetch_related("currency")
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        return project

    async def _category_or_404(
        self,
        category_id: str,
        *,
        project_id: str | None = None,
        include_deleted: bool = False,
    ) -> Category:
        category = await Category.get_or_none(id=category_id)
        missing = category is None or (category.deleted_at is not None and not include_deleted)
        if not missing and project_id is not None and category is not None:
            missing = category.project_id != project_id
        if missing or category is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_CATEGORY)
        return category

    async def _item_or_404(self, item_id: str) -> BudgetItem:
        item = await BudgetItem.get_or_none(id=item_id, deleted_at__isnull=True)
        if item is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_ITEM)
        return item
