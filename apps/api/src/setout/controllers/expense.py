from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

from fastapi import HTTPException, status
from tortoise.functions import Sum
from tortoise.queryset import QuerySet

from setout.models.agreement import Agreement
from setout.models.budget import BudgetItem
from setout.models.expense import Expense
from setout.models.item import Item
from setout.models.person import Person
from setout.models.project import Project
from setout.models.scope import Scope
from setout.models.vendor import Vendor
from setout.schemas.expense import (
    ExpenseCreate,
    ExpensePage,
    ExpenseRead,
    ExpenseUpdate,
    ProjectMonths,
    ProjectSpend,
    ScopeSuggestion,
)
from setout.utils.attachments import counts_for
from setout.utils.cascade import delete_under_expense, restore_under_expense
from setout.utils.expenses import derived_amount
from setout.utils.months import month_range, to_months


class ExpenseController:
    async def list(
        self,
        project_id: str,
        *,
        scope_id: str | None,
        agreement_id: str | None,
        month: str | None,
        unfiled_only: bool,
        agreement_only: bool,
        limit: int,
        offset: int,
    ) -> ExpensePage:
        await self._project_or_404(project_id)
        query = Expense.filter(project_id=project_id, deleted_at__isnull=True)
        if unfiled_only:
            query = query.filter(scope_id__isnull=True)
        elif scope_id is not None:
            query = query.filter(scope_id=scope_id)
        if agreement_id is not None:
            query = query.filter(agreement_id=agreement_id)
        elif agreement_only:
            query = query.filter(agreement_id__isnull=False)
        if month is not None:
            first, following = month_range(month)
            query = query.filter(spent_on__gte=first, spent_on__lt=following)
        total = await query.count()
        rows = await query.offset(offset).limit(limit)
        counts = await counts_for([row.id for row in rows])
        return ExpensePage(
            items=[self._read(row, counts.get(row.id, 0)) for row in rows],
            total=total,
            limit=limit,
            offset=offset,
        )

    async def create(self, project_id: str, req: ExpenseCreate) -> ExpenseRead:
        await self._project_or_404(project_id)
        if req.scope_id is not None:
            await self._fileable_scope(req.scope_id, project_id)
        await self._attribution_or_404(req.item_id, req.vendor_id, req.paid_by_id)
        await self._agreement_or_404(req.agreement_id, project_id)
        amount = self._amount(req.quantity, req.unit_rate, req.amount)
        expense = await Expense.create(
            project_id=project_id,
            scope_id=req.scope_id,
            item_id=req.item_id,
            vendor_id=req.vendor_id,
            agreement_id=req.agreement_id,
            paid_by_id=req.paid_by_id,
            spent_on=req.spent_on or date.today(),
            description=req.description,
            quantity=req.quantity,
            unit_rate=req.unit_rate,
            amount=amount,
            cost_type=req.cost_type,
            notes=req.notes,
        )
        return self._read(expense, 0)

    async def suggest_scope(
        self, project_id: str, item_id: str | None, vendor_id: str | None
    ) -> ScopeSuggestion:
        await self._project_or_404(project_id)
        if item_id:
            scope_id = await self._most_common_scope(project_id, item_id=item_id)
            if scope_id:
                return ScopeSuggestion(scope_id=scope_id, reason="Past purchases of this item")
        if vendor_id:
            scope_id = await self._most_common_scope(project_id, vendor_id=vendor_id)
            if scope_id:
                return ScopeSuggestion(scope_id=scope_id, reason="Past purchases from this vendor")
        return ScopeSuggestion(scope_id=None, reason=None)

    async def _most_common_scope(
        self, project_id: str, *, item_id: str | None = None, vendor_id: str | None = None
    ) -> str | None:
        query = Expense.filter(
            project_id=project_id, deleted_at__isnull=True, scope_id__isnull=False
        )
        if item_id is not None:
            query = query.filter(item_id=item_id)
        elif vendor_id is not None:
            query = query.filter(vendor_id=vendor_id)
        else:
            return None
        counts: dict[str, int] = {}
        for expense in await query.only("scope_id"):
            scope_id = expense.scope_id
            assert scope_id is not None
            counts[scope_id] = counts.get(scope_id, 0) + 1
        if not counts:
            return None
        max_count = max(counts.values())
        winners = [scope_id for scope_id, count in counts.items() if count == max_count]
        return winners[0] if len(winners) == 1 else None

    async def get(self, expense_id: str) -> ExpenseRead:
        expense = await self._expense_or_404(expense_id)
        counts = await counts_for([expense.id])
        return self._read(expense, counts.get(expense.id, 0))

    async def update(self, expense_id: str, req: ExpenseUpdate) -> ExpenseRead:
        expense = await self._expense_or_404(expense_id)
        changes = req.model_dump(exclude_unset=True)
        if changes.get("scope_id") is not None:
            await self._fileable_scope(changes["scope_id"], expense.project_id)
        await self._attribution_or_404(
            changes.get("item_id"), changes.get("vendor_id"), changes.get("paid_by_id")
        )
        await self._agreement_or_404(changes.get("agreement_id"), expense.project_id)
        if changes:
            # Amount is worked out below, so keep it out of the field update.
            # The column is not nullable, and a caller sending a quantity and a
            # rate sends a null amount on purpose.
            entered = changes.pop("amount", None)
            expense.update_from_dict(changes)
            derived = derived_amount(expense.quantity, expense.unit_rate)
            if derived is not None:
                if entered is not None and entered != derived:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                        detail=f"Amount should be {derived}: quantity times unit rate",
                    )
                expense.amount = derived
            elif entered is not None:
                expense.amount = entered
            await expense.save()
        return self._read(expense, (await counts_for([expense.id])).get(expense.id, 0))

    async def delete(self, expense_id: str) -> None:
        expense = await self._expense_or_404(expense_id)
        deleted_at = datetime.now(UTC)
        expense.deleted_at = deleted_at
        await expense.save()
        await delete_under_expense(expense.id, deleted_at)

    async def restore(self, expense_id: str) -> ExpenseRead:
        expense = await self._expense_or_404(expense_id, include_deleted=True)
        if expense.deleted_at is not None:
            deleted_at = expense.deleted_at
            expense.deleted_at = None
            await expense.save()
            await restore_under_expense(expense.id, deleted_at)
        return self._read(expense, (await counts_for([expense.id])).get(expense.id, 0))

    async def spend(self, project_id: str) -> ProjectSpend:
        project = await self._project_or_404(project_id)
        # Filtered by scope id rather than through a join, which would make the
        # database group the sum per scope.
        scope_ids = await Scope.filter(project_id=project_id, deleted_at__isnull=True).values_list(
            "id", flat=True
        )
        planned = await self._total(
            BudgetItem.filter(scope_id__in=scope_ids, deleted_at__isnull=True), "planned_amount"
        )
        filed = Expense.filter(project_id=project_id, deleted_at__isnull=True)
        spent = await self._total(filed, "amount")
        unfiled = await self._total(filed.filter(scope_id__isnull=True), "amount")
        unfiled_count = await filed.filter(scope_id__isnull=True).count()
        removed = await Expense.filter(project_id=project_id, deleted_at__isnull=False).count()
        return ProjectSpend(
            project_id=project.id,
            currency_code=project.currency_id,
            currency_exponent=project.currency.exponent,
            planned_amount=planned,
            spent_amount=spent,
            unfiled_amount=unfiled,
            unfiled_count=unfiled_count,
            removed_count=removed,
            variance_percent=round((spent - planned) / planned * 100, 2) if planned else None,
        )

    async def months(self, project_id: str) -> ProjectMonths:
        project = await self._project_or_404(project_id)
        # Shaped in Python: the segments follow budget order and roll up to the
        # top of each branch, which one query cannot say.
        expenses = await Expense.filter(project_id=project_id, deleted_at__isnull=True).only(
            "id", "spent_on", "scope_id", "amount"
        )
        scopes = await Scope.filter(project_id=project_id, deleted_at__isnull=True)
        months = to_months(expenses, scopes)
        # Ties go to the earlier month, which is the one already on the page.
        busiest = max(months, key=lambda month: month.amount).month if months else None
        return ProjectMonths(
            project_id=project.id,
            currency_code=project.currency_id,
            currency_exponent=project.currency.exponent,
            total_amount=sum(month.amount for month in months),
            months=months,
            busiest_month=busiest,
        )

    def _amount(self, quantity: object, unit_rate: int | None, entered: int | None) -> int:
        derived = derived_amount(quantity, unit_rate)  # type: ignore[arg-type]
        if derived is not None:
            if entered is not None and entered != derived:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=f"Amount should be {derived}: quantity times unit rate",
                )
            return derived
        if entered is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Give an amount, or a quantity and a unit rate",
            )
        return entered

    async def _attribution_or_404(
        self, item_id: str | None, vendor_id: str | None, paid_by_id: str | None
    ) -> None:
        if (
            item_id is not None
            and not await Item.filter(id=item_id, deleted_at__isnull=True).exists()
        ):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
        if (
            vendor_id is not None
            and not await Vendor.filter(id=vendor_id, deleted_at__isnull=True).exists()
        ):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
        if (
            paid_by_id is not None
            and not await Person.filter(id=paid_by_id, deleted_at__isnull=True).exists()
        ):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")

    async def _agreement_or_404(self, agreement_id: str | None, project_id: str) -> None:
        if agreement_id is None:
            return
        exists = await Agreement.filter(
            id=agreement_id, project_id=project_id, deleted_at__isnull=True
        ).exists()
        if not exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agreement not found")

    async def _total(self, query: QuerySet[Any], column: str) -> int:
        rows = await query.annotate(total=Sum(column)).values("total")
        return int(rows[0]["total"] or 0) if rows else 0

    def _read(self, expense: Expense, attachments: int) -> ExpenseRead:
        """The row, plus the one thing about it that a second query knows."""
        fields = {
            name: getattr(expense, name)
            for name in ExpenseRead.model_fields
            if name != "attachment_count"
        }
        return ExpenseRead.model_validate({**fields, "attachment_count": attachments})

    async def _project_or_404(self, project_id: str) -> Project:
        project = await Project.get_or_none(
            id=project_id, deleted_at__isnull=True
        ).prefetch_related("currency")
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        return project

    async def _fileable_scope(self, scope_id: str, project_id: str) -> Scope:
        scope = await Scope.get_or_none(id=scope_id, project_id=project_id, deleted_at__isnull=True)
        if scope is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scope not found")
        if await Scope.filter(parent_id=scope.id, deleted_at__isnull=True).exists():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A scope with children holds no spend of its own",
            )
        return scope

    async def _expense_or_404(self, expense_id: str, *, include_deleted: bool = False) -> Expense:
        expense = await Expense.get_or_none(id=expense_id)
        if expense is None or (expense.deleted_at is not None and not include_deleted):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
        return expense
