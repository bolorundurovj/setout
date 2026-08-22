from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException, status

from setout.models.budget import BudgetItem
from setout.models.expense import Expense
from setout.models.project import Project
from setout.models.scope import Scope
from setout.models.scope_preset import ScopePreset
from setout.schemas.scope import (
    BudgetItemCreate,
    BudgetItemPage,
    BudgetItemRead,
    BudgetItemUpdate,
    ProjectBudget,
    ScopeCreate,
    ScopePresetRead,
    ScopeRead,
    ScopeUpdate,
)
from setout.utils.cascade import delete_under_scope, restore_under_scope
from setout.utils.scopes import to_reads

NOT_FOUND_SCOPE = "Scope not found"
NOT_FOUND_ITEM = "Budget item not found"


class ScopeController:
    async def list_presets(self) -> list[ScopePresetRead]:
        return [ScopePresetRead.model_validate(p) for p in await ScopePreset.all()]

    async def list_scopes(self, project_id: str) -> list[ScopeRead]:
        await self._project_or_404(project_id)
        scopes = await Scope.filter(project_id=project_id, deleted_at__isnull=True)
        items = await BudgetItem.filter(
            scope__project_id=project_id,
            deleted_at__isnull=True,
        )
        expenses = await Expense.filter(project_id=project_id, deleted_at__isnull=True)
        return to_reads(scopes, items, expenses)

    async def budget(self, project_id: str) -> ProjectBudget:
        project = await self._project_or_404(project_id)
        scopes = await self.list_scopes(project_id)
        return ProjectBudget(
            project_id=project.id,
            currency_code=project.currency_id,
            currency_exponent=project.currency.exponent,
            planned_amount=sum(scope.own_planned_amount for scope in scopes),
            scopes=scopes,
        )

    async def create(self, project_id: str, req: ScopeCreate) -> ScopeRead:
        await self._project_or_404(project_id)
        if req.parent_id is not None:
            await self._scope_or_404(req.parent_id, project_id=project_id)
        scope = await Scope.create(project_id=project_id, **req.model_dump())
        return self._one(await self.list_scopes(project_id), scope.id)

    async def update(self, scope_id: str, req: ScopeUpdate) -> ScopeRead:
        scope = await self._scope_or_404(scope_id)
        changes = req.model_dump(exclude_unset=True)
        parent_id = changes.get("parent_id")
        if parent_id is not None:
            if parent_id == scope.id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A scope cannot be its own parent",
                )
            await self._scope_or_404(parent_id, project_id=scope.project_id)
        if changes:
            scope.update_from_dict(changes)
            await scope.save()
        return self._one(await self.list_scopes(scope.project_id), scope.id)

    async def delete(self, scope_id: str) -> None:
        scope = await self._scope_or_404(scope_id)
        await self._holds_no_spend(scope)
        deleted_at = datetime.now(UTC)
        scope.deleted_at = deleted_at
        await scope.save()
        await delete_under_scope(scope.id, deleted_at)

    async def restore(self, scope_id: str) -> ScopeRead:
        scope = await self._scope_or_404(scope_id, include_deleted=True)
        if scope.deleted_at is not None:
            deleted_at = scope.deleted_at
            scope.deleted_at = None
            await scope.save()
            await restore_under_scope(scope.id, deleted_at)
        return self._one(await self.list_scopes(scope.project_id), scope.id)

    async def list_items(self, scope_id: str, *, limit: int, offset: int) -> BudgetItemPage:
        await self._scope_or_404(scope_id)
        query = BudgetItem.filter(scope_id=scope_id, deleted_at__isnull=True)
        total = await query.count()
        items = await query.offset(offset).limit(limit)
        return BudgetItemPage(
            items=[BudgetItemRead.model_validate(item) for item in items],
            total=total,
            limit=limit,
            offset=offset,
        )

    async def add_item(self, scope_id: str, req: BudgetItemCreate) -> BudgetItemRead:
        scope = await self._scope_or_404(scope_id)
        if await Scope.filter(parent_id=scope.id, deleted_at__isnull=True).exists():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A scope with children holds no budget of its own",
            )
        item = await BudgetItem.create(
            scope_id=scope_id,
            set_at=datetime.now(UTC),
            **req.model_dump(),
        )
        return BudgetItemRead.model_validate(item)

    async def update_item(self, item_id: str, req: BudgetItemUpdate) -> BudgetItemRead:
        item = await self._item_or_404(item_id)
        changes = req.model_dump(exclude_unset=True)
        if "planned_amount" in changes and changes["planned_amount"] != item.planned_amount:
            changes["set_at"] = datetime.now(UTC)
        if changes:
            item.update_from_dict(changes)
            await item.save()
        return BudgetItemRead.model_validate(item)

    async def delete_item(self, item_id: str) -> None:
        item = await self._item_or_404(item_id)
        item.deleted_at = datetime.now(UTC)
        await item.save()

    async def _holds_no_spend(self, scope: Scope) -> None:
        # A deleted scope would take its expenses out of every scope total while
        # the project total still counted them, which reads as money gone missing.
        branch = [scope.id, *await self._below(scope)]
        if await Expense.filter(scope_id__in=branch, deleted_at__isnull=True).exists():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A scope with expenses cannot be deleted, only renamed",
            )

    async def _below(self, scope: Scope) -> list[str]:
        found: list[str] = []
        edge = [scope.id]
        while edge:
            children = await Scope.filter(parent_id__in=edge, deleted_at__isnull=True)
            edge = [child.id for child in children if child.id not in found]
            found.extend(edge)
        return found

    def _one(self, scopes: list[ScopeRead], scope_id: str) -> ScopeRead:
        for scope in scopes:
            if scope.id == scope_id:
                return scope
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_SCOPE)

    async def _project_or_404(self, project_id: str) -> Project:
        project = await Project.get_or_none(
            id=project_id, deleted_at__isnull=True
        ).prefetch_related("currency")
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        return project

    async def _scope_or_404(
        self,
        scope_id: str,
        *,
        project_id: str | None = None,
        include_deleted: bool = False,
    ) -> Scope:
        scope = await Scope.get_or_none(id=scope_id)
        missing = scope is None or (scope.deleted_at is not None and not include_deleted)
        if not missing and project_id is not None and scope is not None:
            missing = scope.project_id != project_id
        if missing or scope is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_SCOPE)
        return scope

    async def _item_or_404(self, item_id: str) -> BudgetItem:
        item = await BudgetItem.get_or_none(id=item_id, deleted_at__isnull=True)
        if item is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_ITEM)
        return item
