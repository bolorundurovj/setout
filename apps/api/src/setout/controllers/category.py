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
from setout.utils.cascade import archive_under_category, restore_under_category
from setout.utils.categories import to_reads

NOT_FOUND_CATEGORY = "Category not found"
NOT_FOUND_ITEM = "Budget item not found"


class CategoryController:
    async def list_presets(self) -> list[CategoryPresetRead]:
        return [CategoryPresetRead.model_validate(p) for p in await CategoryPreset.all()]

    async def list_categories(
        self, project_id: str, *, include_archived: bool = False
    ) -> list[CategoryRead]:
        await self._project_or_404(project_id)
        categories = await Category.filter(project_id=project_id, archived_at__isnull=True)
        items = await BudgetItem.filter(
            category__project_id=project_id,
            archived_at__isnull=True,
        )
        expenses = await Expense.filter(project_id=project_id, archived_at__isnull=True)
        reads = to_reads(categories, items, expenses)
        if include_archived:
            reads.extend(await self._archived_reads(project_id))
        return reads

    async def budget(self, project_id: str, *, include_archived: bool = False) -> ProjectBudget:
        project = await self._project_or_404(project_id)
        categories = await self.list_categories(project_id, include_archived=include_archived)
        return ProjectBudget(
            project_id=project.id,
            currency_code=project.currency_id,
            currency_exponent=project.currency.exponent,
            budgeted_amount=sum(
                category.own_budgeted_amount
                for category in categories
                if category.archived_at is None
            ),
            categories=categories,
        )

    async def _archived_reads(self, project_id: str) -> list[CategoryRead]:
        # Archived categories total only the rows archived with them and are excluded
        # from the live rollup, so listing them does not change the budget total.
        categories = await Category.filter(project_id=project_id, archived_at__not_isnull=True)
        if not categories:
            return []
        items = await BudgetItem.filter(category_id__in=[row.id for row in categories])
        return to_reads(categories, items)

    async def create(self, project_id: str, req: CategoryCreate) -> CategoryRead:
        await self._project_or_404(project_id)
        if req.parent_id is not None:
            await self._category_or_404(req.parent_id, project_id=project_id)
        category = await Category.create(project_id=project_id, **req.model_dump())
        return self._find_category(await self.list_categories(project_id), category.id)

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
        return self._find_category(await self.list_categories(category.project_id), category.id)

    async def archive(self, category_id: str) -> None:
        category = await self._category_or_404(category_id)
        await self._require_no_expenses(category)
        archived_at = datetime.now(UTC)
        category.archived_at = archived_at
        await category.save()
        await archive_under_category(category.id, archived_at)

    async def restore(self, category_id: str) -> CategoryRead:
        category = await self._category_or_404(category_id, include_archived=True)
        if category.archived_at is not None:
            archived_at = category.archived_at
            category.archived_at = None
            await category.save()
            await restore_under_category(category.id, archived_at)
        return self._find_category(await self.list_categories(category.project_id), category.id)

    async def list_items(
        self, category_id: str, *, include_archived: bool, limit: int, offset: int
    ) -> BudgetItemPage:
        await self._category_or_404(category_id)
        query = BudgetItem.filter(category_id=category_id)
        if not include_archived:
            query = query.filter(archived_at__isnull=True)
        total = await query.count()
        items = await query.offset(offset).limit(limit)
        return BudgetItemPage(
            items=[BudgetItemRead.model_validate(item) for item in items],
            total=total,
            limit=limit,
            offset=offset,
        )

    async def create_item(self, category_id: str, req: BudgetItemCreate) -> BudgetItemRead:
        category = await self._category_or_404(category_id)
        if await Category.filter(parent_id=category.id, archived_at__isnull=True).exists():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Budget items cannot be added to a category that has subcategories",
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

    async def archive_item(self, item_id: str) -> None:
        item = await self._item_or_404(item_id)
        item.archived_at = datetime.now(UTC)
        await item.save()

    async def restore_item(self, item_id: str) -> BudgetItemRead:
        item = await self._item_or_404(item_id, include_archived=True)
        if item.archived_at is not None:
            item.archived_at = None
            await item.save()
        return BudgetItemRead.model_validate(item)

    async def _require_no_expenses(self, category: Category) -> None:
        # Archiving a category with expenses would exclude them from every category total
        # while the project total still included them.
        branch = [category.id, *await self._descendant_ids(category)]
        if await Expense.filter(category_id__in=branch, archived_at__isnull=True).exists():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A category with expenses cannot be archived, only renamed",
            )

    async def _descendant_ids(self, category: Category) -> list[str]:
        descendants: list[str] = []
        level = [category.id]
        while level:
            children = await Category.filter(parent_id__in=level, archived_at__isnull=True)
            level = [child.id for child in children if child.id not in descendants]
            descendants.extend(level)
        return descendants

    def _find_category(self, categories: list[CategoryRead], category_id: str) -> CategoryRead:
        for category in categories:
            if category.id == category_id:
                return category
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_CATEGORY)

    async def _project_or_404(self, project_id: str) -> Project:
        project = await Project.get_or_none(
            id=project_id, archived_at__isnull=True
        ).prefetch_related("currency")
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        return project

    async def _category_or_404(
        self,
        category_id: str,
        *,
        project_id: str | None = None,
        include_archived: bool = False,
    ) -> Category:
        category = await Category.get_or_none(id=category_id)
        missing = category is None or (category.archived_at is not None and not include_archived)
        if not missing and project_id is not None and category is not None:
            missing = category.project_id != project_id
        if missing or category is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_CATEGORY)
        return category

    async def _item_or_404(self, item_id: str, *, include_archived: bool = False) -> BudgetItem:
        item = await BudgetItem.get_or_none(id=item_id)
        if item is None or (item.archived_at is not None and not include_archived):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_ITEM)
        return item
