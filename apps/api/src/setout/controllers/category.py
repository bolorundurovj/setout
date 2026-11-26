from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status
from tortoise import Tortoise
from tortoise.functions import Count, Sum
from tortoise.queryset import QuerySet
from tortoise.transactions import in_transaction

from setout.models.budget import BudgetItem
from setout.models.category import Category
from setout.models.category_preset import CategoryPreset
from setout.models.expense import Expense
from setout.models.project import Project
from setout.schemas.category import (
    BudgetItemCreate,
    BudgetItemPage,
    BudgetItemRead,
    BudgetItemSummary,
    BudgetItemUpdate,
    CategoryCreate,
    CategoryPresetRead,
    CategoryRead,
    CategoryUpdate,
    ProjectBudget,
)
from setout.services import changes
from setout.utils.cascade import archive_under_category, restore_under_category
from setout.utils.categories import subtree_ids, to_reads
from setout.utils.placeholders import bound

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
        reads = to_reads(
            categories,
            await self._item_totals(project_id, active_only=True),
            *await self._expense_totals(project_id),
        )
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
            item_summaries=await self._item_summaries(project_id),
        )

    async def _item_summaries(self, project_id: str) -> dict[str, BudgetItemSummary]:
        conn = Tortoise.get_connection("default")
        query = """
            SELECT category_id, id AS first_item_id, set_at, item_count, changed_at
            FROM (
                SELECT b.category_id, b.id, b.set_at,
                       COUNT(*) OVER (PARTITION BY b.category_id) AS item_count,
                       ROW_NUMBER() OVER (PARTITION BY b.category_id ORDER BY b.id) AS position,
                       FIRST_VALUE(CASE WHEN b.updated_at <> b.created_at THEN b.updated_at END)
                           OVER (PARTITION BY b.category_id ORDER BY b.updated_at DESC, b.id)
                           AS changed_at
                FROM budget_item b JOIN category c ON c.id = b.category_id
                WHERE c.project_id = ? AND b.archived_at IS NULL
            ) ranked WHERE position = 1
        """
        rows = await conn.execute_query_dict(bound(query, conn), [project_id])
        return {row["category_id"]: BudgetItemSummary.model_validate(row) for row in rows}

    async def _archived_reads(self, project_id: str) -> list[CategoryRead]:
        # Archived categories total only the rows archived with them and are excluded
        # from the live rollup, so listing them does not change the budget total.
        categories = await Category.filter(project_id=project_id, archived_at__not_isnull=True)
        if not categories:
            return []
        return to_reads(
            categories,
            await self._item_totals_of([category.id for category in categories]),
        )

    async def _item_totals(self, project_id: str, *, active_only: bool) -> dict[str, int]:
        """Budgeted amount per category, grouped by the database."""
        query = BudgetItem.filter(category__project_id=project_id)
        if active_only:
            query = query.filter(archived_at__isnull=True)
        return await self._item_totals_of_all(query)

    async def _item_totals_of(self, category_ids: list[str]) -> dict[str, int]:
        return await self._item_totals_of_all(BudgetItem.filter(category_id__in=category_ids))

    @staticmethod
    async def _item_totals_of_all(query: QuerySet[Any]) -> dict[str, int]:
        rows = (
            await query.group_by("category_id")
            .annotate(total=Sum("budgeted_amount"))
            .values("category_id", "total")
        )
        return {str(row["category_id"]): int(row["total"] or 0) for row in rows}

    @staticmethod
    async def _expense_totals(project_id: str) -> tuple[dict[str, int], dict[str, int]]:
        """Spent amount and expense count per category, grouped by the database."""
        rows = (
            await Expense.filter(
                project_id=project_id, archived_at__isnull=True, category_id__isnull=False
            )
            .group_by("category_id")
            .annotate(spent=Sum("amount"), n=Count("id"))
            .values("category_id", "spent", "n")
        )
        spent = {str(row["category_id"]): int(row["spent"] or 0) for row in rows}
        counts = {str(row["category_id"]): int(row["n"]) for row in rows}
        return spent, counts

    async def create(self, project_id: str, req: CategoryCreate) -> CategoryRead:
        await self._project_or_404(project_id)
        if req.parent_id is not None:
            await self._category_or_404(req.parent_id, project_id=project_id)
            await self._require_empty_parent(req.parent_id)
        category = await Category.create(project_id=project_id, **req.model_dump())
        return self._find_category(await self.list_categories(project_id), category.id)

    async def update(self, category_id: str, req: CategoryUpdate) -> CategoryRead:
        async with in_transaction():
            category = await self._category_or_404(category_id)
            updates = req.model_dump(exclude_unset=True)
            parent_id = updates.get("parent_id")
            if "parent_id" in updates:
                await Project.filter(id=category.project_id).select_for_update().first()
            if parent_id is not None:
                await self._category_or_404(parent_id, project_id=category.project_id)
                if parent_id in await self._subtree(category):
                    raise HTTPException(status_code=409, detail="CATEGORY_CYCLE")
                await self._require_empty_parent(parent_id)
            if updates:
                category.update_from_dict(updates)
                await category.save(update_fields=[*updates, "updated_at"])
            return self._find_category(await self.list_categories(category.project_id), category.id)

    async def _require_empty_parent(self, parent_id: str) -> None:
        if (
            await Expense.filter(category_id=parent_id, archived_at__isnull=True).exists()
            or await BudgetItem.filter(category_id=parent_id, archived_at__isnull=True).exists()
        ):
            raise HTTPException(
                status_code=409, detail="A parent category cannot hold expenses or budget items"
            )

    async def archive(self, category_id: str) -> None:
        async with in_transaction():
            category = await self._category_or_404(category_id)
            await self._require_no_expenses(category)
            archived_at = datetime.now(UTC)
            category.archived_at = archived_at
            await category.save()
            await archive_under_category(await self._subtree(category), archived_at)

    async def restore(self, category_id: str) -> CategoryRead:
        async with in_transaction():
            category = await self._category_or_404(category_id, include_archived=True)
            if category.archived_at is not None:
                archived_at = category.archived_at
                category.archived_at = None
                await category.save()
                await restore_under_category(await self._subtree(category), archived_at)
            return self._find_category(await self.list_categories(category.project_id), category.id)

    async def delete(self, category_id: str) -> None:
        async with in_transaction():
            category = await self._category_or_404(category_id, include_archived=True)
            if category.archived_at is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Only archived categories can be deleted permanently",
                )
            branch = await self._subtree(category)
            rows = await Category.filter(id__in=branch)
            by_id = {row.id: row for row in rows}
            blockers = []
            for row in rows:
                if row.archived_at is None:
                    count = await Expense.filter(category_id=row.id).count()
                    blockers.append({"id": row.id, "name": row.name, "expense_count": count})
            if blockers:
                names = ", ".join(
                    f"{row['name']} ({row['expense_count']} expenses)" for row in blockers
                )
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "CATEGORY_HAS_ACTIVE_DESCENDANTS",
                        "message": f"Archive these subcategories before deleting: {names}.",
                        "descendants": blockers,
                    },
                )
            await changes.recorded_update(Expense.filter(category_id__in=branch), category_id=None)
            await changes.recorded_delete(BudgetItem.filter(category_id__in=branch))
            for descendant_id in reversed(branch):
                await by_id[descendant_id].delete()

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
        updates = req.model_dump(exclude_unset=True)
        if "budgeted_amount" in updates and updates["budgeted_amount"] != item.budgeted_amount:
            updates["set_at"] = datetime.now(UTC)
        if updates:
            item.update_from_dict(updates)
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

    async def delete_item(self, item_id: str) -> None:
        async with in_transaction():
            item = await self._item_or_404(item_id, include_archived=True)
            if item.archived_at is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Only archived budget items can be deleted permanently",
                )
            await item.delete()

    async def _require_no_expenses(self, category: Category) -> None:
        # Archiving a category with expenses would exclude them from every category total
        # while the project total still included them.
        branch = await self._subtree(category)
        if await Expense.filter(category_id__in=branch, archived_at__isnull=True).exists():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A category with expenses cannot be archived, only renamed",
            )

    async def _subtree(self, category: Category) -> list[str]:
        parents = await Category.filter(project_id=category.project_id).values_list(
            "id", "parent_id"
        )
        return subtree_ids(category.id, dict(parents))

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
